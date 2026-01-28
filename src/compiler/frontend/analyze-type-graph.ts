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

import type { Block } from "../../graph/Patch";
import {
  getAxisValue,
  DEFAULTS_V0,
  type SignalType,
} from "../../core/canonical-types";
import type { TypedPatch, BlockIndex } from "../ir/patches";
import {
  getBlockDefinition,
  getBlockCardinalityMetadata,
  isCardinalityGeneric,
} from "../../blocks/registry";
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
  fromType: SignalType;
  toType: SignalType;
  message: string;
}

export type Pass2Error = PortTypeUnknownError | NoConversionPathError;

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Type compatibility check for wired connections.
 * Uses resolved types - no variables should be present.
 */
function isTypeCompatible(from: SignalType, to: SignalType, sourceBlockType?: string, targetBlockType?: string): boolean {
  const fromCard = getAxisValue(from.extent.cardinality, DEFAULTS_V0.cardinality);
  const fromTemp = getAxisValue(from.extent.temporality, DEFAULTS_V0.temporality);
  const toCard = getAxisValue(to.extent.cardinality, DEFAULTS_V0.cardinality);
  const toTemp = getAxisValue(to.extent.temporality, DEFAULTS_V0.temporality);

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

  // Cardinality check - may be relaxed for cardinality-generic/preserving blocks
  if (fromCard.kind !== toCard.kind) {
    // Allow if target block is cardinality-generic and allows mixing
    if (targetBlockType) {
      const meta = getBlockCardinalityMetadata(targetBlockType);
      if (meta && isCardinalityGeneric(targetBlockType)) {
        if (meta.broadcastPolicy === 'allowZipSig' || meta.broadcastPolicy === 'requireBroadcastExpr') {
          return true;
        }
      }
    }

    // Allow one→many if source block is cardinality-preserving.
    // Cardinality-preserving blocks adapt their output cardinality to match
    // their input cardinality, so the static type (cardinality: one) doesn't
    // reflect runtime behavior when inputs are fields.
    if (fromCard.kind === 'one' && toCard.kind === 'many' && sourceBlockType) {
      const sourceMeta = getBlockCardinalityMetadata(sourceBlockType);
      if (sourceMeta?.cardinalityMode === 'preserve') {
        return true;
      }
    }

    return false;
  }

  // For 'many' cardinality, instance must also match
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;
    return fromInstance.domainType === toInstance.domainType &&
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
  const blockOutputTypes = new Map<string, ReadonlyMap<string, SignalType>>();

  for (let i = 0; i < typeResolved.blocks.length; i++) {
    const block = typeResolved.blocks[i];
    const blockIndex = i as BlockIndex;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const outputTypes = new Map<string, SignalType>();
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

    // Validate type compatibility
    if (!isTypeCompatible(fromType, toType, fromBlock.type, toBlock.type)) {
      const fromCard = getAxisValue(fromType.extent.cardinality, DEFAULTS_V0.cardinality);
      const fromTemp = getAxisValue(fromType.extent.temporality, DEFAULTS_V0.temporality);
      const toCard = getAxisValue(toType.extent.cardinality, DEFAULTS_V0.cardinality);
      const toTemp = getAxisValue(toType.extent.temporality, DEFAULTS_V0.temporality);

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
