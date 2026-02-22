/**
 * Pass 2: Type Graph Construction
 *
 * Input: TypeResolvedPatch (from pass1 - has all port types resolved)
 * Output: TypedPatch (extends TypeResolvedPatch with blockOutputTypes for legacy compatibility)
 *
 * This pass validates type compatibility for all edges using the resolved types
 * from pass1. It does NOT look up types from BlockDef - all types come from
 * TypeResolvedPatch.portTypes.
 *
 * // [LAW:one-source-of-truth] Single evaluateTypeGraph drives both throwing and safe APIs.
 */

import {
  type CanonicalType,
  requireInst,
} from "../../core/canonical-types";
import type { TypedPatch, BlockIndex, TypeResolvedPatch, PortKey } from "../ir/patches";
import { getBlockDefinition } from "../../blocks/registry";
import { acceptsBroadcast, isEdgeTypeCompatible } from "./policies/type-compatibility";

// =============================================================================
// Port Type Lookup (inlined from analyze-type-constraints.ts)
// =============================================================================

function portKey(blockIndex: BlockIndex, portName: string, dir: 'in' | 'out'): PortKey {
  return `${blockIndex}:${portName}:${dir}` as PortKey;
}

function getPortType(
  patch: TypeResolvedPatch,
  blockIndex: BlockIndex,
  portName: string,
  direction: 'in' | 'out',
): import("../../core/canonical-types").CanonicalType | undefined {
  return patch.portTypes.get(portKey(blockIndex, portName, direction));
}

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
// Result Type
// =============================================================================

export interface Pass2TypeGraphResult {
  readonly typedPatch: TypedPatch;
  readonly errors: readonly Pass2Error[];
}

// =============================================================================
// Core Evaluator (single implementation)
// =============================================================================

/**
 * Core type-graph evaluator — builds blockOutputTypes and validates edge
 * compatibility in a single pass.  Returns typed errors as data.
 *
 * // [LAW:one-source-of-truth] This is the ONE place that evaluates pass2.
 * // [LAW:dataflow-not-control-flow] Errors are data, not control flow.
 */
function evaluateTypeGraph(typeResolved: TypeResolvedPatch): Pass2TypeGraphResult {
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

    const toBlockDef = getBlockDefinition(toBlock.type);
    const toInputDef = toBlockDef?.inputs?.[edge.toPort];
    const toIsCollect = !!toInputDef?.collectAccepts;

    const fromType = getPortType(typeResolved, edge.fromBlock, edge.fromPort, 'out');
    const toType = getPortType(typeResolved, edge.toBlock, edge.toPort, 'in');

    // [LAW:one-source-of-truth] Collect edges are typed per-edge via collectEdgeTypes
    // and collect AcceptsSpec constraints, not by a single unified input port type.
    if (toIsCollect) {
      if (!fromType) {
        errors.push({
          kind: "PortTypeUnknown",
          blockIndex: edge.fromBlock,
          slotId: edge.fromPort,
          message: `Unknown output port type: block[${edge.fromBlock}].${edge.fromPort}`,
        });
      }
      continue;
    }

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

    // Check if destination accepts one→many by CT/ICT-derived acceptance data.
    // [LAW:one-source-of-truth] Acceptance derives from TypeResolvedPatch.portAcceptance, not BlockDef.
    const toPortKey = portKey(edge.toBlock, edge.toPort, 'in');
    const allowsBroadcast = acceptsBroadcast(typeResolved.portAcceptance?.get(toPortKey));

    // Validate type compatibility
    if (!isEdgeTypeCompatible(fromType, toType, allowsBroadcast)) {
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

  const typedPatch: TypedPatch = {
    ...typeResolved,
    blockOutputTypes,
  };

  return { typedPatch, errors };
}

// =============================================================================
// Public APIs (both delegate to evaluateTypeGraph)
// =============================================================================

/**
 * Pass 2: Type Graph Construction (throwing variant).
 *
 * Validates type compatibility using resolved types from pass1.
 * All types come from typeResolved.portTypes - no BlockDef lookups.
 *
 * @param typeResolved - TypeResolvedPatch from pass1
 * @returns TypedPatch with validated types
 * @throws Error if validation fails
 */
export function pass2TypeGraph(typeResolved: TypeResolvedPatch): TypedPatch {
  const { typedPatch, errors } = evaluateTypeGraph(typeResolved);

  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 2 (Type Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  return typedPatch;
}

/**
 * Total variant of pass2TypeGraph — never throws.
 *
 * Returns the TypedPatch AND any errors as data. Downstream passes always
 * get a TypedPatch to work with, even when there are type mismatches.
 *
 * // [LAW:dataflow-not-control-flow] Errors are data, not control flow.
 */
export function pass2TypeGraphSafe(typeResolved: TypeResolvedPatch): Pass2TypeGraphResult {
  return evaluateTypeGraph(typeResolved);
}
