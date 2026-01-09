/**
 * Block Registry
 *
 * ONE pattern for all blocks. No exceptions.
 *
 * Each block:
 * 1. Declares its inputs and outputs with types
 * 2. Provides a lower() function that emits IR
 * 3. Returns outputs keyed by portId
 */

import type {
  DomainId,
  EventExprId,
  FieldExprId,
  PortId,
  SigExprId,
} from '../../types';
import type { SignalType, DomainRef } from '../../core/canonical-types';
import {
  signalTypeSignal,
  signalTypeField,
  signalTypeStatic,
  domainRef,
  type PayloadType,
} from '../../core/canonical-types';
import type { IRBuilder } from '../ir';

// =============================================================================
// Value References
// =============================================================================

/**
 * A reference to a value in the IR.
 * This is what gets passed between blocks during lowering.
 */
export type ValueRef =
  | { kind: 'sig'; id: SigExprId; type: SignalType }
  | { kind: 'field'; id: FieldExprId; type: SignalType }
  | { kind: 'event'; id: EventExprId }
  | { kind: 'domain'; id: DomainId }
  | { kind: 'scalar'; value: number | string | boolean; type: SignalType };

// =============================================================================
// Port Definitions
// =============================================================================

export interface PortDef {
  readonly portId: PortId;
  readonly type: SignalType | DomainRef;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
}

// =============================================================================
// Block Lowering Context
// =============================================================================

export interface LowerContext {
  /** IR builder for emitting nodes */
  readonly b: IRBuilder;

  /** Block configuration (from block.params) */
  readonly config: Readonly<Record<string, unknown>>;

  /** Resolved inputs by port ID */
  readonly inputsById: Readonly<Record<string, ValueRef | undefined>>;
}

/**
 * Block lowering function.
 * Takes context with inputs, returns outputs by port ID.
 */
export type BlockLower = (
  ctx: LowerContext
) => Readonly<Record<string, ValueRef>>;

// =============================================================================
// Block Definition
// =============================================================================

export interface BlockDef {
  readonly type: string;
  readonly inputs: readonly PortDef[];
  readonly outputs: readonly PortDef[];
  readonly lower: BlockLower;
}

// =============================================================================
// Registry
// =============================================================================

const registry = new Map<string, BlockDef>();

export function registerBlock(def: BlockDef): void {
  if (registry.has(def.type)) {
    throw new Error(`Block type already registered: ${def.type}`);
  }

  // Validate port IDs are unique
  const inputIds = new Set(def.inputs.map((p) => p.portId));
  const outputIds = new Set(def.outputs.map((p) => p.portId));

  if (inputIds.size !== def.inputs.length) {
    throw new Error(`Duplicate input port IDs in block ${def.type}`);
  }
  if (outputIds.size !== def.outputs.length) {
    throw new Error(`Duplicate output port IDs in block ${def.type}`);
  }

  registry.set(def.type, def);
}

export function getBlock(type: string): BlockDef | undefined {
  return registry.get(type);
}

export function getAllBlocks(): readonly BlockDef[] {
  return [...registry.values()];
}

// =============================================================================
// Helpers for block implementations
// =============================================================================

export function portId(s: string): PortId {
  return s as PortId;
}

/**
 * Create a Signal SignalType (one + continuous).
 */
export function sigType(payload: PayloadType): SignalType {
  return signalTypeSignal(payload);
}

/**
 * Create a Field SignalType (many(domain) + continuous).
 * Note: This creates a default field type. Actual domain will be unified at compile time.
 */
export function fieldType(payload: PayloadType): SignalType {
  return signalTypeField(payload, '__default__');
}

/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export function scalarType(payload: PayloadType): SignalType {
  return signalTypeStatic(payload);
}

/**
 * Create an Event SignalType.
 * Note: Events use discrete temporality.
 */
export function eventType(payload: PayloadType = 'float'): SignalType {
  return signalTypeSignal(payload); // TODO: Update to use discrete temporality
}

/**
 * Create a DomainRef for domain output ports.
 */
export function domainType(id: string = '__domain__'): DomainRef {
  return domainRef(id);
}

// =============================================================================
// Input extraction helpers (eliminates conditionals in block implementations)
// =============================================================================

type SigRef = { kind: 'sig'; id: SigExprId; type: SignalType };
type FieldRef = { kind: 'field'; id: FieldExprId; type: SignalType };
type DomainRefValue = { kind: 'domain'; id: DomainId };

/** Extract required signal input - throws if missing or wrong type */
export function sig(inputs: Record<string, ValueRef | undefined>, port: string): SigRef {
  const v = inputs[port];
  if (!v || v.kind !== 'sig') throw new Error(`Missing signal input: ${port}`);
  return v;
}

/** Extract required field input - throws if missing or wrong type */
export function field(inputs: Record<string, ValueRef | undefined>, port: string): FieldRef {
  const v = inputs[port];
  if (!v || v.kind !== 'field') throw new Error(`Missing field input: ${port}`);
  return v;
}

/** Extract required domain input - throws if missing or wrong type */
export function domain(inputs: Record<string, ValueRef | undefined>, port: string): DomainRefValue {
  const v = inputs[port];
  if (!v || v.kind !== 'domain') throw new Error(`Missing domain input: ${port}`);
  return v;
}

/** Extract signal OR field input (for polymorphic ports) */
export function sigOrField(inputs: Record<string, ValueRef | undefined>, port: string): SigRef | FieldRef {
  const v = inputs[port];
  if (!v || (v.kind !== 'sig' && v.kind !== 'field')) {
    throw new Error(`Missing signal/field input: ${port}`);
  }
  return v;
}
