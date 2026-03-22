
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
  StateSlotId,
} from './Indices';
import type { StableStateId } from './types';
import type { TimeModelIR } from './schedule';

// =============================================================================
// Value Reference Types
// =============================================================================

/**
 * Packed value reference — unified around ValueExprId.
 *
 * The legacy k:'sig'|'field'|'event' discriminant is REMOVED.
 * One/many/event semantics are derived from type.extent by checking axes.
 *
 * Variants:
 * - ValueRefExpr: Any expression (one, many, or event)
 * - ValueRefInstance: Instance context
 * - ValueRefScalar: Scalar config value
 */
export type ValueRefPacked =
  | ValueRefExpr
  | { readonly k: 'instance'; readonly id: InstanceId }
  | { readonly k: 'scalar'; readonly value: unknown };

/**
 * Unified expression reference.
 * No k discriminant — derive one/many/event from type.extent.
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
   * For multi-component values (stride > 1), scalar ValueExprIds
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
// Collect Input Types
// =============================================================================

/**
 * A single entry in a collect port's input list.
 * Each incoming edge to a collect port produces one entry with its own type.
 *
 * // [LAW:one-type-per-behavior] Collect entries are derived from normal edges.
 */
export interface CollectInputEntry {
  /** Resolved value reference for this edge's output */
  readonly value: ValueRefExpr;
  /** Per-edge resolved type (from collectEdgeTypes) */
  readonly type: CanonicalType;
  /** Edge alias (from Edge.alias, used for Expression DSL member access) */
  readonly alias: string;
  /** Edge sort key for deterministic ordering */
  readonly sortKey: number;
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
  | { readonly kind: 'materialize'; readonly field: ValueExprId; readonly instanceId: InstanceId; readonly target: ValueSlot };

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
  /** Eval requests for sink blocks (for runtime probes/test sinks). */
  readonly evalRequests?: readonly { exprId: ValueExprId }[];
  /** Optional time model contribution for runtime clock resolution. */
  readonly timeModel?: TimeModelIR;
  /**
   * Additional memory resources to include in the MemoryManifest.
   * Used by blocks that require GPU resources beyond standard arena slots
   * (e.g., Texture2D for fluid simulation fields).
   */
  readonly memoryResources?: readonly import('./program').MemoryResourceIR[];
  /**
   * DispatchKernel instructions emitted by this block.
   * Collected into the NagaLoweringProgramIR for execution by the Rust dispatcher.
   */
  readonly dispatchInstructions?: readonly import('../ir/naga-emitter/ScheduleNagaLowering').DispatchKernelInstruction[];
}
