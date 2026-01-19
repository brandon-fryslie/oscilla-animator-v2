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
  StateId,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { TimeModelIR } from './schedule';
import type { PureFn, OpCode, InstanceDecl, LayoutSpec, Step, IntrinsicPropertyName } from './types';

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

  /**
   * Create a field from an intrinsic property.
   *
   * Intrinsics are per-element properties automatically available for any instance.
   * Valid intrinsic names: 'index', 'normalizedIndex', 'randomId', 'position', 'radius'
   *
   * @param instanceId - The instance to query
   * @param intrinsic - Intrinsic property name (type-checked at compile time)
   * @param type - Signal type for the field
   */
  fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: SignalType): FieldExprId;

  /**
   * Create an array field expression (Stage 2: Signal<T> → Field<T>).
   * Represents the elements of an array instance.
   * @param instanceId - The instance containing the array elements
   * @param type - Signal type for the array elements
   */
  fieldArray(instanceId: InstanceId, type: SignalType): FieldExprId;

  /**
   * Create a layout field expression (Stage 3: Field operation for positions).
   * Applies a layout specification to compute positions for field elements.
   * @param input - The field to apply layout to
   * @param layoutSpec - Layout specification (grid, circular, etc.)
   * @param instanceId - The instance being laid out
   * @param type - Signal type for the output (typically vec2)
   */
  fieldLayout(
    input: FieldExprId,
    layoutSpec: LayoutSpec,
    instanceId: InstanceId,
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

  /** Get slot count for iteration. */
  getSlotCount(): number;

  /** Get slot type information for slotMeta generation. */
  getSlotTypes(): ReadonlyMap<ValueSlot, SignalType>;

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

  /**
   * Schedule a signal evaluation step.
   * Forces evaluation of a signal expression and stores the result in a slot.
   * Used by test blocks to capture signal values for assertion.
   *
   * @param expr - Signal expression to evaluate
   * @param target - Slot to store the evaluated value
   */
  stepEvalSig(expr: SigExprId, target: ValueSlot): void;

  // =========================================================================
  // Utility
  // =========================================================================

  /** Create a pure function reference (kernel). */
  kernel(name: string): PureFn;

  /** Create an opcode-based pure function. */
  opcode(op: OpCode): PureFn;

  /** Create an expression-based pure function. */
  expr(expression: string): PureFn;

  /**
   * Create an instance.
   * @param domainType - Domain type ID (shape, circle, etc.)
   * @param count - Number of elements
   * @param layout - Layout specification
   * @param lifecycle - Lifecycle mode (default: 'static')
   * @returns InstanceId for the created instance
   */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    layout: LayoutSpec,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId;

  /**
   * Get all instances.
   * @returns ReadonlyMap of all instance declarations
   */
  getInstances(): ReadonlyMap<InstanceId, InstanceDecl>;

  /** Get timepoint markers. */
  getTimepointMarkers(): { start: number; end: number } | null;

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
