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
  EventSlotId,
  ValueSlot,
  StateId,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { TopologyId } from '../../shapes/types';
import type { TimeModelIR } from './schedule';
import type { PureFn, OpCode, InstanceDecl, Step, IntrinsicPropertyName, ContinuityPolicy, SigExpr, FieldExpr, EventExpr, StableStateId, StateMapping } from './types';

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
  sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: SignalType): SigExprId;

  /** Create an external input signal. */
  sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId;

  /** Map a function over a signal. */
  sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId;

  /** Zip multiple signals with a function. */
  sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId;

  /**
   * Create a shape reference signal.
   *
   * @param topologyId - Numeric topology identifier (e.g., TOPOLOGY_ID_ELLIPSE, TOPOLOGY_ID_RECT)
   * @param paramSignals - Signal IDs for each topology parameter
   * @param type - Signal type (should be signalType('shape'))
   * @param controlPointField - Optional Field<vec2> for path control points
   * @returns SigExprId for the shape reference
   */
  sigShapeRef(
    topologyId: TopologyId,
    paramSignals: readonly SigExprId[],
    type: SignalType,
    controlPointField?: FieldExprId
  ): SigExprId;

  // =========================================================================
  // Field Expressions
  // =========================================================================

  /** Create a constant field expression. */
  fieldConst(value: number | string, type: SignalType): FieldExprId;

  /**
   * Create a field from an intrinsic property.
   *
   * Intrinsics are per-element properties automatically available for any instance.
   * Valid intrinsic names: 'index', 'normalizedIndex', 'randomId'
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

  /** Allocate an event slot for an event expression. Returns a distinct EventSlotId. */
  allocEventSlot(eventId: EventExprId): EventSlotId;

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
   * Allocate a persistent state slot with stable identity.
   *
   * State slots survive across frames and are used for feedback/delay.
   * The stableId provides semantic identity that survives recompilation,
   * enabling state migration during hot-swap.
   *
   * For scalar state (signal cardinality):
   * ```typescript
   * const slot = builder.allocStateSlot(
   *   stableStateId(blockId, 'delay'),
   *   { initialValue: 0 }
   * );
   * ```
   *
   * For field state (many cardinality):
   * ```typescript
   * const slot = builder.allocStateSlot(
   *   stableStateId(blockId, 'slew'),
   *   { initialValue: 0, instanceId, laneCount: 1000 }
   * );
   * ```
   *
   * @param stableId - Stable semantic identity (survives recompilation)
   * @param options - State allocation options
   * @returns StateSlotId for referencing this state slot
   */
  allocStateSlot(
    stableId: StableStateId,
    options?: {
      /** Initial value per element (default: 0) */
      initialValue?: number;
      /** Floats per state element (default: 1) */
      stride?: number;
      /** Instance ID for field state (omit for scalar) */
      instanceId?: InstanceId;
      /** Lane count for field state (required if instanceId provided) */
      laneCount?: number;
    }
  ): StateSlotId;

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
   * Create a field expression that reads from per-lane state.
   * Used by stateful cardinality-generic blocks operating on fields.
   * Each lane reads its corresponding state value.
   *
   * @param stateSlot - State slot to read from (base slot for lane 0)
   * @param instanceId - Instance defining the lane count
   * @param type - Field type for the read values
   * @returns FieldExprId for the per-lane read expression
   */
  fieldStateRead(stateSlot: StateSlotId, instanceId: InstanceId, type: SignalType): FieldExprId;

  /**
   * Schedule a per-lane state write step.
   * Each lane writes its corresponding value to state.
   *
   * @param stateSlot - State slot to write to (base slot for lane 0)
   * @param value - Field expression to evaluate and write per-lane
   */
  stepFieldStateWrite(stateSlot: StateSlotId, value: FieldExprId): void;

  /**
   * Schedule a signal evaluation step.
   * Forces evaluation of a signal expression and stores the result in a slot.
   * Used by test blocks to capture signal values for assertion.
   *
   * @param expr - Signal expression to evaluate
   * @param target - Slot to store the evaluated value
   */
  stepEvalSig(expr: SigExprId, target: ValueSlot): void;

  /**
   * Schedule a field materialization step.
   * Materializes a field expression and stores the result in a slot.
   *
   * @param field - Field expression to materialize
   * @param instanceId - Instance context for materialization
   * @param target - Slot to store the materialized buffer
   */
  stepMaterialize(field: FieldExprId, instanceId: InstanceId, target: ValueSlot): void;

  /**
   * Schedule a continuity map build step.
   * Builds element mapping when domain changes (hot-swap boundaries).
   * Executed rarely, only when domain changes.
   *
   * @param instanceId - Instance to build mapping for
   */
  stepContinuityMapBuild(instanceId: InstanceId): void;

  /**
   * Schedule a continuity apply step.
   * Applies continuity policy to a field target.
   * Executed per-frame for targets with policy != none.
   *
   * @param targetKey - Stable target ID for continuity state lookup
   * @param instanceId - Instance context
   * @param policy - Continuity policy to apply
   * @param baseSlot - Slot containing base (materialized) values
   * @param outputSlot - Slot to store continuity-applied values
   * @param semantic - Semantic role of target (position, color, etc.)
   */
  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom'
  ): void;

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
   * @param lifecycle - Lifecycle mode (default: 'static')
   * @returns InstanceId for the created instance
   */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId;

  /**
   * Get all instances.
   * @returns ReadonlyMap of all instance declarations
   */
  getInstances(): ReadonlyMap<InstanceId, InstanceDecl>;

  /** Get schedule. */
  getSchedule(): TimeModelIR;

  // =========================================================================
  // Build Results
  // =========================================================================

  /** Get all emitted steps (state writes, etc). */
  getSteps(): readonly Step[];

  /** Get state mappings with stable IDs for hot-swap migration. */
  getStateMappings(): readonly StateMapping[];

  /** Get state slots (legacy format, use getStateMappings for hot-swap). */
  getStateSlots(): readonly { initialValue: number }[];

  /** Get state slot count. */
  getStateSlotCount(): number;

  /**
   * Get all signal expressions.
   * @returns Readonly array of all signal expressions
   */
  getSigExprs(): readonly SigExpr[];

  /**
   * Get all field expressions.
   * @returns Readonly array of all field expressions
   */
  getFieldExprs(): readonly FieldExpr[];

  /**
   * Get all event expressions.
   * @returns Readonly array of all event expressions
   */
  getEventExprs(): readonly EventExpr[];

  /**
   * Get signal-to-slot mappings.
   * Used by scheduler to generate evalSig steps for debug probing.
   * @returns Map from signal expr ID to slot
   */
  getSigSlots(): ReadonlyMap<number, ValueSlot>;

  /** Get event expression to EventSlotId mappings. */
  getEventSlots(): ReadonlyMap<EventExprId, EventSlotId>;

  /** Get total number of allocated event slots. */
  getEventSlotCount(): number;
}
