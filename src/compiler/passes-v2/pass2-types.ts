/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Extracting SignalType from blocks
 * 2. Building block output types map
 * 3. Validating type compatibility for edges
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * References:
 * - design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 */

import type {
  Block,
  Edge,
  Endpoint,
} from "../../types";
import type { SignalType } from "../../core/canonical-types";
import {
  getAxisValue,
  DEFAULTS_V0,
} from "../../core/canonical-types";
import type { NormalizedPatch, TypedPatch } from "../ir/patches";
import { getBlockDefinition } from "../../blocks/registry";

/**
 * Error types emitted by Pass 2.
 */
export interface PortTypeUnknownError {
  kind: "PortTypeUnknown";
  blockId: string;
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

export type Pass2Error =
  | PortTypeUnknownError
  | NoConversionPathError;

/**
 * Type compatibility check for wired connections.
 * Determines if a value of type 'from' can be connected to a port expecting type 'to'.
 *
 * Compatibility rules (canonical type system):
 * 1. Exact match (same payload + same resolved axes)
 * 2. zero → one (promote compile-time constant to runtime value)
 * 3. one → many (broadcast single lane to all elements)
 * 4. zero → many (promote then broadcast)
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @returns true if connection is compatible
 */
function isTypeCompatible(from: SignalType, to: SignalType): boolean {
  // Resolve axes with defaults
  const fromCard = getAxisValue(from.extent.cardinality, DEFAULTS_V0.cardinality);
  const fromTemp = getAxisValue(from.extent.temporality, DEFAULTS_V0.temporality);
  const toCard = getAxisValue(to.extent.cardinality, DEFAULTS_V0.cardinality);
  const toTemp = getAxisValue(to.extent.temporality, DEFAULTS_V0.temporality);

  // Payload must match
  if (from.payload !== to.payload) {
    return false;
  }

  // Temporality must match
  if (fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Exact cardinality match
  if (fromCard.kind === toCard.kind) {
    if (fromCard.kind === 'many' && toCard.kind === 'many') {
      // Domain must match
      return fromCard.domain.id === toCard.domain.id;
    }
    return true;
  }

  // zero → one (promote)
  if (fromCard.kind === 'zero' && toCard.kind === 'one') {
    return true;
  }

  // one → many (broadcast)
  if (fromCard.kind === 'one' && toCard.kind === 'many') {
    return true;
  }

  // zero → many (promote then broadcast)
  if (fromCard.kind === 'zero' && toCard.kind === 'many') {
    return true;
  }

  return false;
}

/**
 * Get the type of an endpoint (port).
 */
function getEndpointType(
  endpoint: Endpoint,
  blocks: ReadonlyMap<string, unknown>
): SignalType | null {
  const blockData = blocks.get(endpoint.blockId);
  if (blockData === null || blockData === undefined) return null;

  const block = blockData as Block;
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return null;

  const slot = [...blockDef.inputs, ...blockDef.outputs].find(s => s.id === endpoint.slotId);
  if (slot === null || slot === undefined) return null;

  return slot.type;
}

/**
 * Pass 2: Type Graph Construction
 *
 * Establishes types for every slot and validates type compatibility.
 *
 * @param normalized - The normalized patch from Pass 1
 * @returns A typed patch with type information
 * @throws Error with all accumulated errors if validation fails
 */
export function pass2TypeGraph(
  normalized: NormalizedPatch
): TypedPatch {
  const errors: Pass2Error[] = [];

  // Build block output types map
  const blockOutputTypes = new Map<string, ReadonlyMap<string, SignalType>>();

  for (const blockData of Array.from(normalized.blocks.values())) {
    const block = blockData as Block;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const outputTypes = new Map<string, SignalType>();
    for (const slot of blockDef.outputs) {
      outputTypes.set(slot.id, slot.type);
    }

    blockOutputTypes.set(block.id, outputTypes);
  }

  // Validate type compatibility for edges
  const edges: readonly Edge[] = normalized.edges ?? [];
  for (const edge of edges) {
    if (!edge.enabled) continue;

    const fromType = getEndpointType(edge.from, normalized.blocks);
    const toType = getEndpointType(edge.to, normalized.blocks);

    if (fromType === null || toType === null) {
      // Dangling reference - will be caught by Pass 4
      continue;
    }

    if (!isTypeCompatible(fromType, toType)) {
      const fromCard = getAxisValue(fromType.extent.cardinality, DEFAULTS_V0.cardinality);
      const fromTemp = getAxisValue(fromType.extent.temporality, DEFAULTS_V0.temporality);
      const toCard = getAxisValue(toType.extent.cardinality, DEFAULTS_V0.cardinality);
      const toTemp = getAxisValue(toType.extent.temporality, DEFAULTS_V0.temporality);

      errors.push({
        kind: "NoConversionPath",
        connectionId: edge.id,
        fromType,
        toType,
        message: `Type mismatch: cannot connect ${fromCard.kind}+${fromTemp.kind}<${fromType.payload}> to ${toCard.kind}+${toTemp.kind}<${toType.payload}> for edge ${edge.id}`,
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
    ...normalized,
    blockOutputTypes,
  } as TypedPatch;
}
