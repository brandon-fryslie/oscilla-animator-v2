
/**
 * Lower Types - Types for block lowering pass
 *
 * These types represent the intermediate results of lowering blocks
 * to IR expressions.
 *
 * NOTE: The actual block registry and lowering functions have moved to src/blocks/registry.ts
 * This file now only contains types used by the compiler passes.
 */

import type { SignalType } from '../../core/canonical-types';
import type {
  SigExprId,
  FieldExprId,
  EventExprId,
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
 * Packed value reference - represents a signal, field, event, instance, or scalar.
 * Used throughout the compiler pipeline for tracking IR expressions.
 */
export type ValueRefPacked =
  | {
      readonly k: 'sig';
      readonly id: SigExprId;
      /** Base slot for lane 0. Multi-component signals occupy [slotMeta.offset, slotMeta.offset + stride). */
      readonly slot: ValueSlot;
      readonly type: SignalType;
      /** Components per sample for this value (e.g. float=1, vec2=2, vec3=3, color=4). */
      readonly stride: number;
    }
  | {
      readonly k: 'field';
      readonly id: FieldExprId;
      /** Slot that will hold the materialized field buffer (typed by `type`). */
      readonly slot: ValueSlot;
      readonly type: SignalType;
      /** Components per lane element in the materialized buffer. */
      readonly stride: number;
    }
  | {
      readonly k: 'event';
      readonly id: EventExprId;
      readonly slot: EventSlotId;
      readonly type: SignalType;
    }
  | { readonly k: 'instance'; readonly id: InstanceId }
  | { readonly k: 'scalar'; readonly value: unknown };

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
  readonly sigId: SigExprId;
  /** Base slot for lane 0. Multi-component signals occupy a contiguous region sized by `stride`. */
  readonly slot: ValueSlot;
  /** Components per sample for this signal (payload geometry; unit does not affect stride). */
  readonly stride: number;
  readonly type: SignalType;
}

export interface LoweredField {
  readonly kind: 'field';
  readonly fieldId: FieldExprId;
  /** Slot that will hold the materialized field buffer. */
  readonly slot: ValueSlot;
  /** Components per lane element in the materialized buffer. */
  readonly stride: number;
  readonly type: SignalType;
}

export interface LoweredScalar {
  readonly kind: 'scalar';
  readonly value: unknown;
  readonly type: SignalType;
}

export interface LoweredInstance {
  readonly kind: 'instance';
  readonly instanceId: InstanceId;
  readonly count: number;
}

/**
 * Lowered input - resolved input value for a block.
 */
export type LoweredInput =
  | LoweredSignalInput
  | LoweredFieldInput
  | LoweredScalarInput
  | LoweredInstanceInput
  | LoweredUnconnectedInput;

export interface LoweredSignalInput {
  readonly kind: 'signal';
  readonly sigId: SigExprId;
  /** Base slot for lane 0. Multi-component signals occupy a contiguous region sized by `stride`. */
  readonly slot: ValueSlot;
  /** Components per sample for this signal. */
  readonly stride: number;
  readonly type: SignalType;
}

export interface LoweredFieldInput {
  readonly kind: 'field';
  readonly fieldId: FieldExprId;
  /** Slot that will hold the materialized field buffer. */
  readonly slot: ValueSlot;
  /** Components per lane element in the materialized buffer. */
  readonly stride: number;
  readonly type: SignalType;
}

export interface LoweredScalarInput {
  readonly kind: 'scalar';
  readonly value: unknown;
  readonly type: SignalType;
}

export interface LoweredInstanceInput {
  readonly kind: 'instance';
  readonly instanceId: InstanceId;
  readonly count: number;
}

export interface LoweredUnconnectedInput {
  readonly kind: 'unconnected';
  /** Default value to use when unconnected. `undefined` means "no default" and should be treated as a compile error where required. */
  readonly defaultValue: unknown | undefined;
  readonly type: SignalType;
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
 */
export interface LowerContext {
  readonly builder: IRBuilder;
  readonly resolvedInputs: ReadonlyMap<string, LoweredInput>;
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
