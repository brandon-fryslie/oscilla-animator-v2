/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Extracting SignalType from blocks
 * 2. Building block output types map
 * 3. Validating type compatibility for edges
 * 4. Validating unit compatibility (warnings only)
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * References:
 * - design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 */

import type { Block } from "../../graph/Patch";
import type { SignalType, NumericUnit } from "../../core/canonical-types";
import {
  getAxisValue,
  DEFAULTS_V0,
} from "../../core/canonical-types";
import type { NormalizedPatch, TypedPatch, BlockIndex } from "../ir/patches";
import { getBlockDefinition } from "../../blocks/registry";

// Move these types into a better place

/**
 * Error types emitted by Pass 2.
 */
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

export type Pass2Error =
  | PortTypeUnknownError
  | NoConversionPathError;

/**
 * Type compatibility check for wired connections.
 * Determines if a value of type 'from' can be connected to a port expecting type 'to'.
 *
 * The compiler requires EXACT type matches. It does not perform any type coercion,
 * promotion, or automatic adaptation. Graph normalization is responsible for
 * inserting any necessary adapters before compilation.
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @returns true if types are exactly equal
 */
function isTypeCompatible(from: SignalType, to: SignalType): boolean {
  // Resolve axes with defaults
  const fromCard = getAxisValue(from.extent.cardinality, DEFAULTS_V0.cardinality);
  const fromTemp = getAxisValue(from.extent.temporality, DEFAULTS_V0.temporality);
  const toCard = getAxisValue(to.extent.cardinality, DEFAULTS_V0.cardinality);
  const toTemp = getAxisValue(to.extent.temporality, DEFAULTS_V0.temporality);

  // Payload must match exactly, except '???' which is polymorphic
  // '???' unifies with any concrete type (resolved by normalizer at runtime)
  if (from.payload !== to.payload) {
    // '???' is compatible with anything - it will be resolved
    if (from.payload !== '???' && to.payload !== '???') {
      return false;
    }
  }

  // Temporality must match exactly
  if (fromTemp.kind !== toTemp.kind) {
    return false;
  }

  // Cardinality must match exactly
  if (fromCard.kind !== toCard.kind) {
    return false;
  }

  // For 'many' cardinality, instance must also match
  if (fromCard.kind === 'many' && toCard.kind === 'many') {
    const fromInstance = fromCard.instance;
    const toInstance = toCard.instance;
    if (!fromInstance || !toInstance) return false;
    // Instances match if both domainType and instanceId are equal
    return fromInstance.domainType === toInstance.domainType &&
           fromInstance.instanceId === toInstance.instanceId;
  }

  return true;
}

/**
 * Check unit compatibility for wired connections.
 *
 * This is a SOFT validation - emits warnings but does not block compilation.
 * Enables gradual adoption of unit annotations without breaking existing patches.
 *
 * Rules:
 * - No unit annotation → no warning (backwards compatible)
 * - Both have units but different → warning
 * - Same unit or one is undefined → no warning
 *
 * TODO: Integrate with DiagnosticHub instead of console.warn
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @param connectionId - Human-readable connection identifier for warnings
 */
function checkUnitCompatibility(
  from: SignalType,
  to: SignalType,
  connectionId: string
): void {
  const fromUnit = from.unit;
  const toUnit = to.unit;

  // No validation if either side has no unit annotation
  if (fromUnit === undefined || toUnit === undefined) {
    return;
  }

  // Warn if units don't match
  if (fromUnit !== toUnit) {
    console.warn(
      `[Unit Mismatch] ${connectionId}: ` +
      `connecting ${fromUnit} to ${toUnit}. ` +
      `Consider adding a conversion block or verifying unit expectations.`
    );
  }
}

/**
 * Get the type of a port on a block.
 */
function getPortType(
  block: Block,
  portId: string
): SignalType | null {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return null;

  // Check inputs first
  const inputDef = blockDef.inputs[portId];
  if (inputDef?.type) return inputDef.type;

  // Then check outputs
  const outputDef = blockDef.outputs[portId];
  if (outputDef?.type) return outputDef.type;

  return null;
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

  for (const block of normalized.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const outputTypes = new Map<string, SignalType>();
    for (const [portId, outputDef] of Object.entries(blockDef.outputs)) {
      outputTypes.set(portId, outputDef.type);
    }

    blockOutputTypes.set(block.id, outputTypes);
  }

  // Validate type compatibility for edges using NormalizedEdge
  for (const edge of normalized.edges) {
    // Get blocks by index
    const fromBlock = normalized.blocks[edge.fromBlock];
    const toBlock = normalized.blocks[edge.toBlock];

    if (!fromBlock || !toBlock) {
      // Should never happen if normalization is correct
      continue;
    }

    const fromType = getPortType(fromBlock, edge.fromPort);
    const toType = getPortType(toBlock, edge.toPort);

    if (fromType === null || toType === null) {
      // Unknown port type - report error
      if (fromType === null) {
        errors.push({
          kind: "PortTypeUnknown",
          blockIndex: edge.fromBlock as BlockIndex,
          slotId: edge.fromPort,
          message: `Unknown output port type: block[${edge.fromBlock}].${edge.fromPort}`,
        });
      }
      if (toType === null) {
        errors.push({
          kind: "PortTypeUnknown",
          blockIndex: edge.toBlock as BlockIndex,
          slotId: edge.toPort,
          message: `Unknown input port type: block[${edge.toBlock}].${edge.toPort}`,
        });
      }
      continue;
    }

    // Validate type compatibility (HARD error)
    if (!isTypeCompatible(fromType, toType)) {
      const fromCard = getAxisValue(fromType.extent.cardinality, DEFAULTS_V0.cardinality);
      const fromTemp = getAxisValue(fromType.extent.temporality, DEFAULTS_V0.temporality);
      const toCard = getAxisValue(toType.extent.cardinality, DEFAULTS_V0.cardinality);
      const toTemp = getAxisValue(toType.extent.temporality, DEFAULTS_V0.temporality);

      errors.push({
        kind: "NoConversionPath",
        connectionId: `${edge.fromBlock}:${edge.fromPort}->${edge.toBlock}:${edge.toPort}`,
        fromType,
        toType,
        message: `Type mismatch: cannot connect ${fromCard.kind}+${fromTemp.kind}<${fromType.payload}> to ${toCard.kind}+${toTemp.kind}<${toType.payload}>`,
      });
    }

    // Validate unit compatibility (SOFT warning)
    checkUnitCompatibility(
      fromType,
      toType,
      `${fromBlock.type}[${edge.fromPort}] → ${toBlock.type}[${edge.toPort}]`
    );
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
  };
}
