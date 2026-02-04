
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
 * The k:'sig'|'field'|'event' discriminant is GONE — derive by checking extent axes.
 *
 * MIGRATION (2026-02-03): ValueRefExpr.slot is now optional.
 * Pure blocks return ValueRefExpr with slot: undefined. The orchestrator allocates
 * slots on behalf of pure blocks after lowering completes.
 *
 * MIGRATION (2026-02-03): LowerEffects added for effects-as-data pattern.
 * Blocks return effects (state declarations, step requests, slot requests) instead
 * of calling imperative methods on IRBuilder.
 */

import type { CanonicalType } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  InstanceId,
  StateId,
  StateSlotId,
} from './Indices';
import type { IRBuilder } from './IRBuilder';
import type { StableStateId, ContinuityPolicy } from './types';

// =============================================================================
// Value Reference Types
// =============================================================================

/**
 * Packed value reference — unified around ValueExprId.
 *
 * The legacy k:'sig'|'field'|'event' discriminant is REMOVED.
 * Signal/field/event semantics are derived from type.extent by checking axes.
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
 *
 * PURE LOWERING (2026-02-03):
 * - slot is now OPTIONAL
 * - Pure blocks return ValueRefExpr with slot: undefined
 * - The orchestrator (lower-blocks.ts) allocates slots for pure blocks post-lowering
 * - Impure blocks continue allocating slots directly (slot is present)
 */
export interface ValueRefExpr {
  /** Expression ID into the unified valueExprs table */
  readonly id: ValueExprId;
  /**
   * Value slot for runtime storage.
   * Optional — undefined for pure block outputs (orchestrator allocates later).
   */
  readonly slot?: ValueSlot;
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
   * Only present when temporality is discrete (event).
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


// =============================================================================
// Effects-as-Data Types (WI-1)
// =============================================================================

/**
 * State declaration (symbolic).
 * Declares a state slot that needs to be allocated by the binding pass.
 */
export interface StateDecl {
  /** Symbolic state key (blockId:stateKind) */
  readonly key: StableStateId;
  /** Initial value for scalar state, or per-lane initial value for field state */
  readonly initialValue: number;
  /** Stride (floats per state element, default 1) */
  readonly stride?: number;
  /** Instance ID for field state (undefined for scalar state) */
  readonly instanceId?: InstanceId;
  /** Lane count for field state (undefined for scalar state) */
  readonly laneCount?: number;
}

/**
 * Step request (declarative).
 * Declares a step that needs to be registered by the binding pass.
 * References symbolic StableStateId, not physical StateSlotId.
 */
export type StepRequest =
  | { readonly kind: 'stateWrite'; readonly stateKey: StableStateId; readonly value: ValueExprId }
  | { readonly kind: 'fieldStateWrite'; readonly stateKey: StableStateId; readonly value: ValueExprId }
  | { readonly kind: 'materialize'; readonly field: ValueExprId; readonly instanceId: InstanceId; readonly target: ValueSlot }
  | { readonly kind: 'continuityMapBuild'; readonly instanceId: InstanceId }
  | {
      readonly kind: 'continuityApply';
      readonly targetKey: string;
      readonly instanceId: InstanceId;
      readonly policy: ContinuityPolicy;
      readonly baseSlot: ValueSlot;
      readonly outputSlot: ValueSlot;
      readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
      readonly stride: number;
    };

/**
 * Slot request (declarative).
 * Declares an output slot that needs to be allocated by the binding pass.
 */
export interface SlotRequest {
  /** Port ID for this slot */
  readonly portId: string;
  /** Type of the value stored in this slot */
  readonly type: CanonicalType;
}

/**
 * Event slot request (declarative).
 * Declares an event slot that needs to be allocated by the binding pass.
 */
export interface EventSlotRequest {
  /** Port ID for this event slot */
  readonly portId: string;
  /** Event expression ID */
  readonly eventExprId: ValueExprId;
}

/**
 * Lower effects (declarative side effects).
 * Blocks return effects instead of calling imperative methods on IRBuilder.
 */
export interface LowerEffects {
  /** State declarations (symbolic keys, allocated by binding pass) */
  readonly stateDecls?: readonly StateDecl[];
  /** Step requests (symbolic state keys, resolved by binding pass) */
  readonly stepRequests?: readonly StepRequest[];
  /** Slot requests (allocated by binding pass) */
  readonly slotRequests?: readonly SlotRequest[];
  /** Event slot requests (allocated by binding pass) */
  readonly eventSlotRequests?: readonly EventSlotRequest[];
  /** Eval requests for sink blocks (e.g., TestSignal) */
  readonly evalRequests?: readonly { exprId: ValueExprId }[];
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
