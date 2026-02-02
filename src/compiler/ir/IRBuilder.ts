/**
 * IRBuilder Interface
 *
 * Builder pattern for constructing IR expressions.
 * All methods return ValueExprId — the ONE index type for the unified valueExprs table.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { TopologyId } from '../../shapes/types';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  OpCode,
  InstanceDecl,
  Step,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
} from './types';
import type { CameraDeclIR } from './program';
import type { ValueExpr } from './value-expr';

// =============================================================================
// IRBuilder Interface
// =============================================================================

/**
 * IRBuilder provides methods for constructing IR expressions.
 * All methods return ValueExprId — indices into the unified valueExprs table.
 */
export interface IRBuilder {
  // =========================================================================
  // Canonical Value Expression Methods (unified)
  // =========================================================================

  /** Create a constant expression. Works for signal, field, or event extent. */
  constant(value: ConstValue, type: CanonicalType): ValueExprId;

  /** Create a slot-read expression. */
  slotRead(slot: ValueSlot, type: CanonicalType): ValueExprId;

  /** Create a time-derived expression. */
  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId;

  /** Create an external input expression. */
  external(channel: string, type: CanonicalType): ValueExprId;

  /** Map a function over an expression (unary kernel). */
  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId;

  /** Zip multiple expressions with a function (n-ary kernel). */
  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /**
   * Zip a field expression with signal expressions.
   * The field provides per-lane values, signals provide uniform values.
   */
  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /** Broadcast a signal to a field (cardinality one → many). */
  broadcast(signal: ValueExprId, type: CanonicalType, signalComponents?: readonly ValueExprId[]): ValueExprId;

  /** Reduce a field to a signal (cardinality many → one). */
  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId;

  /** Create an intrinsic field expression (index, randomId, normalizedIndex). */
  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId;

  /** Create a placement field expression (uv, rank, seed). */
  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId;

  /** Create a state-read expression. */
  stateRead(stateSlot: StateSlotId, type: CanonicalType): ValueExprId;

  /** Read an event expression as a float signal (0.0 or 1.0). */
  eventRead(eventExpr: ValueExprId): ValueExprId;

  /** Create a path derivative expression (tangent or arcLength). */
  pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', topologyId: TopologyId, type: CanonicalType): ValueExprId;

  /** Create a shape reference expression. */
  shapeRef(
    topologyId: TopologyId,
    paramArgs: readonly ValueExprId[],
    type: CanonicalType,
    controlPointField?: ValueExprId
  ): ValueExprId;

  /** Combine multiple expressions (sum, average, max, min, last, product). */
  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId;

  // =========================================================================
  // Structural Operations (Extract/Construct)
  // =========================================================================

  /** Extract a component from a composite payload (extractX, extractY, extractZ). */
  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId;

  /** Construct a composite from components (makeVec2, makeVec3). */
  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId;

  /** Convert color from HSL to RGB (alpha passthrough). */
  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId;

  // =========================================================================
  // Event Expression Methods
  // =========================================================================

  /** Create a pulse event (fires every tick from time root). */
  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId;

  /** Create a wrap event from a signal (rising edge). */
  eventWrap(signal: ValueExprId): ValueExprId;

  /** Combine multiple events (any/all). */
  eventCombine(events: readonly ValueExprId[], mode: 'any' | 'all' | 'merge' | 'last', type?: CanonicalType): ValueExprId;

  /** Create a "never fires" event. */
  eventNever(): ValueExprId;

  // =========================================================================
  // Slot Registration & Allocation
  // =========================================================================

  allocTypedSlot(type: CanonicalType, label?: string): ValueSlot;
  registerSlotType(slot: ValueSlot, type: CanonicalType): void;
  registerSigSlot(sigId: ValueExprId, slot: ValueSlot): void;
  registerFieldSlot(fieldId: ValueExprId, slot: ValueSlot): void;
  allocEventSlot(eventId: ValueExprId): EventSlotId;
  allocSlot(stride?: number): ValueSlot;

  // =========================================================================
  // Execution Steps
  // =========================================================================

  stepSlotWriteStrided(slotBase: ValueSlot, inputs: readonly ValueExprId[]): void;
  stepStateWrite(stateSlot: StateSlotId, value: ValueExprId): void;
  stepFieldStateWrite(stateSlot: StateSlotId, value: ValueExprId): void;
  stepEvalSig(expr: ValueExprId, target: ValueSlot): void;
  stepMaterialize(field: ValueExprId, instanceId: InstanceId, target: ValueSlot): void;
  stepContinuityMapBuild(instanceId: InstanceId): void;
  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
    stride: number
  ): void;

  // =========================================================================
  // State Slots
  // =========================================================================

  allocStateSlot(
    stableId: StableStateId,
    options?: {
      initialValue?: number;
      stride?: number;
      instanceId?: InstanceId;
      laneCount?: number;
    }
  ): StateSlotId;

  // =========================================================================
  // Render Globals
  // =========================================================================

  addRenderGlobal(decl: CameraDeclIR): void;
  getRenderGlobals(): readonly CameraDeclIR[];

  // =========================================================================
  // Utility
  // =========================================================================

  kernel(name: string): PureFn;
  opcode(op: OpCode): PureFn;
  expr(expression: string): PureFn;

  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId;

  getInstances(): ReadonlyMap<InstanceId, InstanceDecl>;
  getSchedule(): TimeModelIR;

  // =========================================================================
  // Build Results
  // =========================================================================

  getSteps(): readonly Step[];
  getStateMappings(): readonly StateMapping[];
  getStateSlotCount(): number;
  getSlotCount(): number;
  getSlotMetaInputs(): ReadonlyMap<ValueSlot, { readonly type: CanonicalType; readonly stride: number }>;

  /** Get a single value expression by ID. */
  getValueExpr(id: ValueExprId): ValueExpr | undefined;

  /** Get all value expressions. */
  getValueExprs(): readonly ValueExpr[];

  getSigSlots(): ReadonlyMap<number, ValueSlot>;
  getEventSlots(): ReadonlyMap<ValueExprId, EventSlotId>;
  getEventSlotCount(): number;
}
