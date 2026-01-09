/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Extracting SignalType from blocks
 * 4. Building block output types map
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * References:
 * - HANDOFF.md Topic 3: Pass 2 - Type Graph
 * - design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 */

import type {
  Block,
  Edge,
  Endpoint,
} from "../../types";
import type { SignalType, PayloadType, Cardinality, Temporality } from "../../core/canonical-types";
import {
  signalTypeSignal,
  signalTypeTrigger,
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

export interface BusIneligibleTypeError {
  kind: "BusIneligibleType";
  busId: string;
  busName: string;
  signalType: SignalType;
  message: string;
}

export interface ReservedBusTypeViolationError {
  kind: "ReservedBusTypeViolation";
  busId: string;
  busName: string;
  expectedType: string;
  actualType: SignalType;
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
  | BusIneligibleTypeError
  | ReservedBusTypeViolationError
  | NoConversionPathError;

/**
 * Check if a SignalType is eligible for bus usage.
 *
 * Rules (using canonical type system):
 * - cardinality=one + temporality=continuous → bus-eligible (signal)
 * - cardinality=one + temporality=discrete → bus-eligible (event/trigger)
 * - cardinality=zero → NOT bus-eligible (compile-time constant)
 * - cardinality=many → only if payload is scalar-like (float, int, bool, color)
 */
export function isBusEligible(type: SignalType): boolean {
  const cardinality = getAxisValue(type.extent.cardinality, DEFAULTS_V0.cardinality);
  const temporality = getAxisValue(type.extent.temporality, DEFAULTS_V0.temporality);

  // cardinality=zero (compile-time constant) is NOT bus-eligible
  if (cardinality.kind === 'zero') {
    return false;
  }

  // cardinality=one → bus-eligible for both continuous and discrete
  if (cardinality.kind === 'one') {
    return true;
  }

  // cardinality=many → only bus-eligible for scalar payloads
  if (cardinality.kind === 'many') {
    const scalarPayloads: PayloadType[] = ['float', 'int', 'bool', 'color'];
    return scalarPayloads.includes(type.payload);
  }

  return false;
}

/**
 * Reserved bus constraints - canonical type definitions.
 * These buses have strict type requirements enforced by the compiler.
 *
 * Canonical types:
 * - phaseA: signal<float> (one + continuous)
 * - pulse: trigger<bool> (one + discrete)
 * - energy: signal<float> (one + continuous)
 * - palette: signal<color> (one + continuous)
 */
const RESERVED_BUS_CONSTRAINTS: Record<
  string,
  { payload: PayloadType; cardinality: 'one'; temporality: 'continuous' | 'discrete'; description: string }
> = {
  phaseA: {
    payload: 'float',
    cardinality: 'one',
    temporality: 'continuous',
    description: "Primary phase signal (0..1) with wrap semantics",
  },
  pulse: {
    payload: 'bool',
    cardinality: 'one',
    temporality: 'discrete',
    description: "Primary pulse/event trigger (discrete, not continuous)",
  },
  energy: {
    payload: 'float',
    cardinality: 'one',
    temporality: 'continuous',
    description: "Energy/amplitude signal (0..∞)",
  },
  palette: {
    payload: 'color',
    cardinality: 'one',
    temporality: 'continuous',
    description: "Color palette signal",
  },
};

/**
 * Validate reserved bus type constraints.
 */
function validateReservedBus(
  busId: string,
  busName: string,
  busType: SignalType
): ReservedBusTypeViolationError | null {
  const constraint = RESERVED_BUS_CONSTRAINTS[busName];
  if (constraint === undefined) {
    return null; // Not a reserved bus
  }

  const cardinality = getAxisValue(busType.extent.cardinality, DEFAULTS_V0.cardinality);
  const temporality = getAxisValue(busType.extent.temporality, DEFAULTS_V0.temporality);

  // Check payload, cardinality, and temporality match
  if (
    busType.payload !== constraint.payload ||
    cardinality.kind !== constraint.cardinality ||
    temporality.kind !== constraint.temporality
  ) {
    return {
      kind: "ReservedBusTypeViolation",
      busId,
      busName,
      expectedType: `${constraint.cardinality}+${constraint.temporality}<${constraint.payload}>`,
      actualType: busType,
      message: `Reserved bus '${busName}' must have type ${constraint.cardinality}+${constraint.temporality}<${constraint.payload}> (${constraint.description}), got ${cardinality.kind}+${temporality.kind}<${busType.payload}>`,
    };
  }

  return null;
}

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
 * Bus-Block Unification: Endpoints are now only ports - buses are BusBlocks.
 */
function getEndpointType(
  endpoint: Endpoint,
  blocks: ReadonlyMap<string, unknown>,
  _busTypes: Map<string, SignalType>
): SignalType | null {
  // Bus-Block Unification: All endpoints are port kind now
  // Find the block and slot
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
 * Establishes types for every slot and bus, validates bus eligibility,
 * and builds block output types map.
 *
 * Accumulates all errors before throwing, so users see all problems at once.
 *
 * @param normalized - The normalized patch from Pass 1
 * @returns A typed patch with type information
 * @throws Error with all accumulated errors if validation fails
 */
export function pass2TypeGraph(
  normalized: NormalizedPatch
): TypedPatch {
  const errors: Pass2Error[] = [];

  // Step 1: Build bus type map from BusBlocks and validate bus eligibility
  // After Bus-Block Unification, bus info is in BusBlock params
  const busOutputTypes = new Map<string, SignalType>();

  // Use Array.from() to avoid downlevelIteration issues
  for (const blockData of Array.from(normalized.blocks.values())) {
    const block = blockData as Block;
    if (block.type !== 'BusBlock') continue;

    const busId = block.id;
    const busName = (block.params as Record<string, unknown>)?.busName as string | undefined ?? block.label ?? 'Unnamed';
    const busTypeDesc = (block.params as Record<string, unknown>)?.busType as { domain: string; world: string } | undefined;

    if (busTypeDesc == null) {
      // BusBlock without type info - skip (shouldn't happen)
      continue;
    }

    // Convert legacy world/domain to SignalType
    // This is a temporary adapter until BusBlock stores SignalType directly
    let busType: SignalType;
    const payload = busTypeDesc.domain as PayloadType;

    switch (busTypeDesc.world) {
      case 'signal':
        busType = signalTypeSignal(payload);
        break;
      case 'event':
        busType = signalTypeTrigger(payload);
        break;
      default:
        // Unsupported world for bus
        errors.push({
          kind: "BusIneligibleType",
          busId,
          busName,
          signalType: signalTypeSignal('float'), // placeholder
          message: `Bus '${busName}' (${busId}) has unsupported world '${busTypeDesc.world}'. Only signal and event worlds are supported for buses.`,
        });
        continue;
    }

    // Validate bus eligibility
    if (!isBusEligible(busType)) {
      errors.push({
        kind: "BusIneligibleType",
        busId,
        busName,
        signalType: busType,
        message: `Bus '${busName}' (${busId}) has ineligible type. Check cardinality and payload constraints.`,
      });
    }

    // Validate reserved bus constraints
    const reservedError = validateReservedBus(busId, busName, busType);
    if (reservedError !== null) {
      errors.push(reservedError);
    }

    busOutputTypes.set(busId, busType);
  }

  // Step 2: Build block output types map and validate all slot types
  const blockOutputTypes = new Map<string, ReadonlyMap<string, SignalType>>();

  // Use Array.from() to avoid downlevelIteration issues
  for (const blockData of Array.from(normalized.blocks.values())) {
    const block = blockData as Block;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    const outputTypes = new Map<string, SignalType>();

    // Store output types
    for (const slot of blockDef.outputs) {
      outputTypes.set(slot.id, slot.type);
    }

    blockOutputTypes.set(block.id, outputTypes);
  }

  // Step 3: Validate type compatibility for edges
  const edges: readonly Edge[] = normalized.edges ?? [];
  for (const edge of edges) {
    if (!edge.enabled) continue;

    // Get source and target types
    const fromType = getEndpointType(edge.from, normalized.blocks, busOutputTypes);
    const toType = getEndpointType(edge.to, normalized.blocks, busOutputTypes);

    if (fromType === null || toType === null) {
      // Dangling reference - will be caught by Pass 4
      continue;
    }

    // Check type compatibility
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

  // Throw if there are any errors
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 2 (Type Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }


  // Return typed patch
  return {
    ...normalized,
    blockOutputTypes: blockOutputTypes,
    busOutputTypes: busOutputTypes.size > 0 ? busOutputTypes : undefined,
  } as TypedPatch;
}
