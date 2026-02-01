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
  type CanonicalType,
  requireInst,
} from "../../core/canonical-types";
import type { TypedPatch, BlockIndex } from "../ir/patches";
import { getBlockDefinition, getBlockCardinalityMetadata } from "../../blocks/registry";
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
function isTypeCompatible(from: CanonicalType, to: CanonicalType, allowsBroadcast = false): boolean {
  const fromCard = requireInst(from.extent.cardinality, 'cardinality');
  const fromTemp = requireInst(from.extent.temporality, 'temporality');
  const toCard = requireInst(to.extent.cardinality, 'cardinality');
  const toTemp = requireInst(to.extent.temporality, 'temporality');

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

  // Cardinality must match, with broadcast exception
  if (fromCard.kind !== toCard.kind) {
    // Allow one → many when the destination block permits signal broadcast (allowZipSig)
    if (allowsBroadcast && fromCard.kind === 'one' && toCard.kind === 'many') {
      return true;
    }
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

    // Check if the destination block allows signal→field broadcast
    const toMeta = getBlockCardinalityMetadata(toBlock.type);
    const allowsBroadcast = toMeta?.broadcastPolicy === 'allowZipSig';

    // Validate type compatibility
    if (!isTypeCompatible(fromType, toType, allowsBroadcast)) {
      const fromCard = requireInst(fromType.extent.cardinality, 'cardinality');
      const fromTemp = requireInst(fromType.extent.temporality, 'temporality');
      const toCard = requireInst(toType.extent.cardinality, 'cardinality');
      const toTemp = requireInst(toType.extent.temporality, 'temporality');

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
