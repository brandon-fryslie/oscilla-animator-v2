
/**
 * Lower Types - Types for block lowering pass
 *
 * These types represent the intermediate results of lowering blocks
 * to IR expressions.
 *
 * NOTE: The actual block registry and lowering functions have moved to src/blocks/registry.ts
 * This file now only contains types used by the compiler passes.
 *
 * MIGRATION (2026-01-31): ValueRefPacked now uses unified ValueExprId.
 * The k:'sig'|'field'|'event' discriminant is GONE — derive via deriveKind(ref.type).
 */

import { requireInst } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  InstanceId,
  StateId,
} from './Indices';
import type { IRBuilder } from './IRBuilder';

// =============================================================================
// Value Reference Types
// =============================================================================

/**
 * Packed value reference — unified around ValueExprId.
 *
 * The legacy k:'sig'|'field'|'event' discriminant is REMOVED.
 * Signal/field/event semantics are derived from type.extent via deriveKind().
 *
 * Variants:
 * - ValueRefExpr: Any expression (signal, field, or event)
 * - ValueRefInstance: Instance context
 * - ValueRefScalar: Scalar config value
 */
export type ValueRefPacked =
  | ValueRefExpr
  | { readonly k: 'instance'; readonly id: InstanceId }
  | { readonly k: 'scalar'; readonly value: unknown };

/**
 * Unified expression reference.
 * No k discriminant — derive signal/field/event from type.extent.
 */
export interface ValueRefExpr {
  /** Expression ID into the unified valueExprs table */
  readonly id: ValueExprId;
  /** Value slot for runtime storage */
  readonly slot: ValueSlot;
  /** Canonical type (payload + unit + extent) */
  readonly type: CanonicalType;
  /** Components per sample (derived from payload stride) */
  readonly stride: number;
  /**
   * For multi-component signals (stride > 1), scalar ValueExprIds
   * producing each component. Required when stride > 1.
   */
  readonly components?: readonly ValueExprId[];
  /**
   * For event expressions, the event-specific slot.
   * Only present when deriveKind(type) === 'event'.
   */
  readonly eventSlot?: EventSlotId;
}

/**
 * Type guard: is this ValueRefPacked an expression reference?
 * Instance and scalar variants have `k`, ValueRefExpr does not.
 */
export function isExprRef(ref: ValueRefPacked): ref is ValueRefExpr {
  return !('k' in ref);
}

/**
 * Assert and narrow a ValueRefPacked to ValueRefExpr.
 * Throws if the ref is instance or scalar.
 */
export function asExpr(ref: ValueRefPacked): ValueRefExpr {
  if ('k' in ref) {
    throw new Error(`Expected ValueRefExpr, got variant with k='${(ref as { k: string }).k}'`);
  }
  return ref as ValueRefExpr;
}

/**
 * Derive signal/field/event semantics from CanonicalType extent.
 * This is THE way to determine if a value is signal, field, or event.
 * No stored discriminant — always derived from type.
 */
export type DerivedKind = 'signal' | 'field' | 'event';

export function deriveKind(type: CanonicalType): DerivedKind {
  const temp = requireInst(type.extent.temporality, 'temporality');
  if (temp.kind === 'discrete') return 'event';
  const card = requireInst(type.extent.cardinality, 'cardinality');
  if (card.kind === 'many') return 'field';
  return 'signal';
}

// =============================================================================
// Lowered Types (compiler pass contract)
// =============================================================================

/**
 * Lowered output - result of lowering a block output.
 */
export type LoweredOutput =
  | LoweredSignal
  | LoweredField
  | LoweredScalar
  | LoweredInstance;

export interface LoweredSignal {
  readonly kind: 'signal';
  readonly sigId: ValueExprId;
  readonly slot: ValueSlot;
  readonly stride: number;
  readonly type: CanonicalType;
}

export interface LoweredField {
  readonly kind: 'field';
  readonly fieldId: ValueExprId;
  readonly slot: ValueSlot;
  readonly stride: number;
  readonly type: CanonicalType;
}

export interface LoweredScalar {
  readonly kind: 'scalar';
  readonly value: unknown;
  readonly type: CanonicalType;
}

export interface LoweredInstance {
  readonly kind: 'instance';
  readonly instanceId: InstanceId;
  readonly count: number;
}

/**
 * Result of lowering a single block.
 */
export interface LoweredBlock {
  readonly blockId: string;
  readonly blockType: string;
  readonly outputs: ReadonlyMap<string, LoweredOutput>;
  readonly stateReads?: readonly StateId[];
  readonly stateWrites?: readonly StateId[];
}



/**
 * Context for block lowering.
 *
 * Invariant: after graph normalization, every input port is connected,
 * so lowering never receives an "unconnected" input or a defaultValue fallback.
 */
export interface LowerContext {
  readonly builder: IRBuilder;
  readonly resolvedInputs: ReadonlyMap<string, ValueRefPacked>;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Block lowering function - transforms a block into IR expressions.
 */
export type BlockLowerFn = (ctx: LowerContext) => LoweredBlock;

/**
 * Complete lowered IR - result of the lowering pass.
 */
export interface LoweredIR {
  readonly blocks: ReadonlyMap<string, LoweredBlock>;
  readonly outputs: ReadonlyMap<string, ReadonlyMap<string, LoweredOutput>>;
  readonly instances: ReadonlyMap<InstanceId, { count: number }>;
}
