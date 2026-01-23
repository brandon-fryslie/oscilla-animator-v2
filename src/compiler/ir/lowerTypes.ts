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
  | { readonly k: 'sig'; readonly id: SigExprId; readonly slot: ValueSlot }
  | { readonly k: 'field'; readonly id: FieldExprId; readonly slot: ValueSlot }
  | { readonly k: 'event'; readonly id: EventExprId; readonly slot: EventSlotId }
  | { readonly k: 'instance'; readonly id: InstanceId }
  | { readonly k: 'scalar'; readonly value: unknown };

// =============================================================================
// Legacy Types (for compatibility with existing code)
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
  readonly type: SignalType;
}

export interface LoweredField {
  readonly kind: 'field';
  readonly fieldId: FieldExprId;
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
  readonly type: SignalType;
  readonly slot?: ValueSlot;
}

export interface LoweredFieldInput {
  readonly kind: 'field';
  readonly fieldId: FieldExprId;
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
  readonly defaultValue?: unknown;
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
 * Context for block lowering (legacy interface).
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
