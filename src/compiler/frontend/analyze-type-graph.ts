/**
 * Pass 2: Type Graph Construction
 *
 * Input: TypeResolvedPatch (from pass1 - has all port types resolved)
 * Output: TypedPatch (extends TypeResolvedPatch with blockOutputTypes for legacy compatibility)
 *
 * This pass validates type compatibility for all edges using the resolved types
 * from pass1. It does NOT look up types from BlockDef - all types come from
 * TypeResolvedPatch.portTypes.
 */

import {
  DEFAULTS_V0,
  type CanonicalType,
} from "../../core/canonical-types";
import type { TypedPatch, BlockIndex } from "../ir/patches";
import { getBlockDefinition } from "../../blocks/registry";
import { type TypeResolvedPatch, getPortType } from "./analyze-type-constraints";

// =============================================================================
// Error Types
// =============================================================================

export interface PortTypeUnknownError {
  kind: "PortTypeUnknown";
  blockIndex: BlockIndex;
  slotId: string;
  message: string;
}

export interface NoConversionPathError {
  kind: "NoConversionPath";
  connectionId: string;
  fromType: CanonicalType;
  toType: CanonicalType;
  message: string;
}

export type Pass2Error = PortTypeUnknownError | NoConversionPathError;

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Type compatibility check for wired connections.
 * Pure function that checks only CanonicalType structure.
 *
 * Sprint 1: Removed block-name parameters and cardinality-generic exceptions.
 * Sprint 2 will add proper constraint-based cardinality resolution in the frontend solver.
 */
function isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean {
  const fromCard = from.extent.cardinality.kind === 'inst' ? from.extent.cardinality.value : DEFAULTS_V0.cardinality;
  const fromTemp = from.extent.temporality.kind === 'inst' ? from.extent.temporality.value : DEFAULTS_V0.temporality;
  const toCard = to.extent.cardinality.kind === 'inst' ? to.extent.cardinality.value : DEFAULTS_V0.cardinality;
  const toTemp = to.extent.temporality.kind === 'inst' ? to.extent.temporality.value : DEFAULTS_V0.temporality;

  // Payload must match (resolved types - no variables)
  if (from.payload !== to.payload) {
    return false;
  }

  // Unit must match (resolved types - no variables)
  if (from.unit.kind !== to.unit.kind) {
    return false;
  }

  // Temporality must match
  if (fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Cardinality must match exactly
  if (fromCard.kind !== toCard.kind) {
    // TODO: Sprint 2 - frontend solver will resolve cardinality/instance
    // Previously this allowed special cases for cardinality-generic blocks.
    // Now we enforce strict matching - frontend type inference must produce
    // compatible types upfront.
    return false;
  }

  // For 'many' cardinality, instance must also match
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;
    return fromInstance.domainTypeId === toInstance.domainTypeId &&
      fromInstance.instanceId === toInstance.instanceId;
  }

  return true;
}

// =============================================================================
// Pass 2: Type Graph
// =============================================================================

/**
 * Pass 2: Type Graph Construction
 *
 * Validates type compatibility using resolved types from pass1.
 * All types come from typeResolved.portTypes - no BlockDef lookups.
 *
 * @param typeResolved - TypeResolvedPatch from pass1
 * @returns TypedPatch with validated types
 * @throws Error if validation fails
 */
export function pass2TypeGraph(typeResolved: TypeResolvedPatch): TypedPatch {
  const errors: Pass2Error[] = [];

  // Build block output types map (for legacy compatibility)
  const blockOutputTypes = new Map<string, ReadonlyMap<string, CanonicalType>>();

  for (let i = 0; i < typeResolved.blocks.length; i++) {
    const block = typeResolved.blocks[i];
    const blockIndex = i as BlockIndex;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const outputTypes = new Map<string, CanonicalType>();
    for (const portId of Object.keys(blockDef.outputs)) {
      const type = getPortType(typeResolved, blockIndex, portId, 'out');
      if (type) {
        outputTypes.set(portId, type);
      }
    }

    blockOutputTypes.set(block.id, outputTypes);
  }

  // Validate type compatibility for edges
  for (const edge of typeResolved.edges) {
    const fromBlock = typeResolved.blocks[edge.fromBlock];
    const toBlock = typeResolved.blocks[edge.toBlock];

    if (!fromBlock || !toBlock) continue;

    const fromType = getPortType(typeResolved, edge.fromBlock, edge.fromPort, 'out');
    const toType = getPortType(typeResolved, edge.toBlock, edge.toPort, 'in');

    if (!fromType || !toType) {
      if (!fromType) {
        errors.push({
          kind: "PortTypeUnknown",
          blockIndex: edge.fromBlock,
          slotId: edge.fromPort,
          message: `Unknown output port type: block[${edge.fromBlock}].${edge.fromPort}`,
        });
      }
      if (!toType) {
        errors.push({
          kind: "PortTypeUnknown",
          blockIndex: edge.toBlock,
          slotId: edge.toPort,
          message: `Unknown input port type: block[${edge.toBlock}].${edge.toPort}`,
        });
      }
      continue;
    }

    // Validate type compatibility (pure function - no block names)
    if (!isTypeCompatible(fromType, toType)) {
      const fromCard = fromType.extent.cardinality.kind === 'inst' ? fromType.extent.cardinality.value : DEFAULTS_V0.cardinality;
      const fromTemp = fromType.extent.temporality.kind === 'inst' ? fromType.extent.temporality.value : DEFAULTS_V0.temporality;
      const toCard = toType.extent.cardinality.kind === 'inst' ? toType.extent.cardinality.value : DEFAULTS_V0.cardinality;
      const toTemp = toType.extent.temporality.kind === 'inst' ? toType.extent.temporality.value : DEFAULTS_V0.temporality;

      errors.push({
        kind: "NoConversionPath",
        connectionId: `${edge.fromBlock}:${edge.fromPort}->${edge.toBlock}:${edge.toPort}`,
        fromType,
        toType,
        message: `Type mismatch: cannot connect ${fromCard.kind}+${fromTemp.kind}<${fromType.payload.kind}, unit:${fromType.unit.kind}> to ${toCard.kind}+${toTemp.kind}<${toType.payload.kind}, unit:${toType.unit.kind}> (${fromBlock.type}.${edge.fromPort} -> ${toBlock.type}.${edge.toPort})`,
      });
    }
  }

  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 2 (Type Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  return {
    ...typeResolved,
    blockOutputTypes,
  };
}
