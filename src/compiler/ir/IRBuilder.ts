/**
 * IRBuilder Interface
 *
 * Builder pattern for constructing IR expressions.
 * Provides methods for creating signal, field, and event expressions.
 */

import type { SignalType } from '../../core/canonical-types';
import type {
  SigExprId,
  FieldExprId,
  EventExprId,
  ValueSlot,
  DomainId,
  StateId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type { PureFn, OpCode } from './types';

// =============================================================================
// IRBuilder Interface
// =============================================================================

/**
 * IRBuilder provides methods for constructing IR expressions.
 * All methods return stable IDs for the created expressions.
 */
export interface IRBuilder {
  // =========================================================================
  // Signal Expressions
  // =========================================================================

  /** Create a constant signal expression. */
  sigConst(value: number | string | boolean, type: SignalType): SigExprId;

  /** Create a signal from a slot reference. */
  sigSlot(slot: ValueSlot, type: SignalType): SigExprId;

  /** Create a time-derived signal. */
  sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress', type: SignalType): SigExprId;

  /** Create an external input signal. */
  sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId;

  /** Map a function over a signal. */
  sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId;

  /** Zip multiple signals with a function. */
  sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId;

  // =========================================================================
  // Field Expressions
  // =========================================================================

  /** Create a constant field expression. */
  fieldConst(value: number | string, type: SignalType): FieldExprId;

  /** Create a source field (identity, random, index). */
  fieldSource(
    domain: DomainId,
    sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
    type: SignalType
  ): FieldExprId;

  /** Broadcast a signal to a field. */
  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId;

  /** Map a function over a field. */
  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId;

  /** Zip multiple fields with a function. */
  fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId;

  /** Zip a field with signals. */
  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId;

  // =========================================================================
  // Event Expressions
  // =========================================================================

  /** Create a pulse event. */
  eventPulse(source: 'timeRoot'): EventExprId;

  /** Create a wrap event from a signal. */
  eventWrap(signal: SigExprId): EventExprId;

  /** Combine multiple events. */
  eventCombine(events: readonly EventExprId[], mode: 'any' | 'all' | 'merge' | 'last', type?: SignalType): EventExprId;

  // =========================================================================
  // Combine Operations
  // =========================================================================

  /** Combine multiple signals. */
  sigCombine(
    inputs: readonly number[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last',
    type: SignalType
  ): number;

  /** Combine multiple fields. */
  fieldCombine(
    inputs: readonly number[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: SignalType
  ): number;

  // =========================================================================
  // Slot Registration
  // =========================================================================

  /** Allocate a typed value slot. */
  allocValueSlot(type: SignalType, label?: string): ValueSlot;

  /** Register a signal expression with a slot. */
  registerSigSlot(sigId: number, slot: ValueSlot): void;

  /** Register a field expression with a slot. */
  registerFieldSlot(fieldId: number, slot: ValueSlot): void;

  /** Register an event expression with a slot. */
  registerEventSlot(eventId: EventExprId, slot: ValueSlot): void;

  // =========================================================================
  // Debug Tracking
  // =========================================================================

  /** Set current block ID for debug tracking. */
  setCurrentBlockId(blockId: string | undefined): void;

  /** Allocate a constant ID. */
  allocConstId(value: number): number;

  // =========================================================================
  // Domains
  // =========================================================================

  /** Create a domain. */
  createDomain(
    kind: 'grid' | 'n' | 'path',
    count: number,
    params?: Record<string, unknown>
  ): DomainId;

  // =========================================================================
  // Slots
  // =========================================================================

  /** Allocate a value slot. */
  allocSlot(): ValueSlot;

  /** Get current slot count. */
  getSlotCount(): number;

  // =========================================================================
  // State
  // =========================================================================

  /** Allocate a state cell. */
  allocState(initialValue: unknown): StateId;

  // =========================================================================
  // Time Model
  // =========================================================================

  /** Set the time model. */
  setTimeModel(timeModel: TimeModelIR): void;

  /** Get the current time model. */
  getTimeModel(): TimeModelIR | undefined;

  // =========================================================================
  // Pure Functions
  // =========================================================================

  /** Create an opcode-based pure function. */
  opcode(op: OpCode): PureFn;

  /** Create an expression-based pure function. */
  expr(expression: string): PureFn;

  /** Create a kernel-based pure function. */
  kernel(name: string): PureFn;
}

// =============================================================================
// Export
// =============================================================================

export type { OpCode, PureFn } from './types';
