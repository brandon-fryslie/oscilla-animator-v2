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
  StateSlotId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type { PureFn, OpCode, DomainDef, Step } from './types';

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
    inputs: readonly SigExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last',
    type: SignalType
  ): SigExprId;

  /** Combine multiple fields. */
  fieldCombine(
    inputs: readonly FieldExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: SignalType
  ): FieldExprId;

  // =========================================================================
  // Slot Registration
  // =========================================================================

  /** Allocate a typed value slot. */
  allocValueSlot(type: SignalType, label?: string): ValueSlot;

  /** Register a signal expression with a slot. */
  registerSigSlot(sigId: SigExprId, slot: ValueSlot): void;

  /** Register a field expression with a slot. */
  registerFieldSlot(fieldId: FieldExprId, slot: ValueSlot): void;

  /** Register an event expression with a slot. */
  registerEventSlot(eventId: EventExprId, slot: ValueSlot): void;

  // =========================================================================
  // Slot Allocation (Simple)
  // =========================================================================

  /** Allocate a simple slot (without type information). */
  allocSlot(): ValueSlot;

  // =========================================================================
  // State Slot Allocation (Persistent Cross-Frame Storage)
  // =========================================================================

  /**
   * Allocate a persistent state slot with an initial value.
   * State slots survive across frames and are used for feedback/delay.
   *
   * @param initialValue - Initial value for the state slot (default: 0)
   * @returns StateSlotId for referencing this state slot
   */
  allocStateSlot(initialValue?: number): StateSlotId;

  /**
   * Create a signal expression that reads from a state slot.
   * State reads happen at the beginning of the frame, reading the value
   * written by the previous frame.
   *
   * @param stateSlot - State slot to read from
   * @param type - Signal type for the read value
   * @returns SigExprId for the read expression
   */
  sigStateRead(stateSlot: StateSlotId, type: SignalType): SigExprId;

  /**
   * Schedule a state write step.
   * State writes happen at the end of the frame, storing a value
   * that will be read by the next frame.
   *
   * @param stateSlot - State slot to write to
   * @param value - Signal expression to evaluate and write
   */
  stepStateWrite(stateSlot: StateSlotId, value: SigExprId): void;

  // =========================================================================
  // Utility
  // =========================================================================

  /** Create a pure function reference (kernel). */
  kernel(name: string): PureFn;

  /** Create an opcode-based pure function. */
  opcode(op: OpCode): PureFn;

  /** Create an expression-based pure function. */
  expr(expression: string): PureFn;

  /** Create a domain. */
  createDomain(kind: 'grid' | 'n' | 'path', count: number, params?: Record<string, unknown>): DomainId;

  /** Get all domains. */
  getDomains(): ReadonlyMap<DomainId, DomainDef>;

  /** Get timepoint markers. */
  getTimepointMarkers(): { start: number; end: number } | null;

  /** Define a domain. */
  defineDomain(id: DomainId, def: DomainDef): void;

  /** Get schedule. */
  getSchedule(): TimeModelIR;

  /** Declare state. */
  declareState(id: StateId, type: SignalType, initialValue?: unknown): void;

  /** Read state. */
  readState(id: StateId, type: SignalType): SigExprId;

  /** Write state. */
  writeState(id: StateId, value: SigExprId): void;

  // =========================================================================
  // Build Results
  // =========================================================================

  /** Get all emitted steps (state writes, etc). */
  getSteps(): readonly Step[];

  /** Get state slots. */
  getStateSlots(): readonly { initialValue: number }[];

  /** Get state slot count. */
  getStateSlotCount(): number;
}
