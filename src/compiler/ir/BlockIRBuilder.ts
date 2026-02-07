/**
 * BlockIRBuilder Interface - Pure Surface for Block Lowering
 *
 * This is the ONLY builder interface that blocks see in their lower() function.
 * It provides pure expression construction - no allocation, no schedule mutation,
 * no slot registration.
 *
 * Blocks return effects as data (slotRequests, stateDecls, stepRequests).
 * The orchestrator processes those effects using OrchestratorIRBuilder.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  DomainTypeId,
  InstanceId,
} from './Indices';
import type { TopologyId } from '../../shapes/types';
import type {
  PureFn,
  OpCode,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  StableStateId,
} from './types';

// =============================================================================
// BlockIRBuilder Interface (Pure)
// =============================================================================

/**
 * Pure builder interface for block lowering.
 * Blocks construct expression graphs and declare effects as data.
 */
export interface BlockIRBuilder {
  // =========================================================================
  // Canonical Value Expression Methods (pure graph construction)
  // =========================================================================

  /** Create a constant expression. */
  constant(value: ConstValue, type: CanonicalType): ValueExprId;

  /** Create a constant with a stable provenance key (prevents cross-origin dedup). */
  constantWithKey(value: ConstValue, type: CanonicalType, key: string): ValueExprId;

  // REMOVED 2026-02-06: slotRead() - dead code, never called in production

  /** Create a time-derived expression. */
  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId;

  /** Create an external input expression. */
  external(channel: string, type: CanonicalType): ValueExprId;

  /** Map a function over an expression (unary kernel). */
  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId;

  /** Zip multiple expressions with a function (n-ary kernel). */
  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /** Zip a field with signals. */
  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /** Broadcast a signal to a field (cardinality one → many). */
  broadcast(signal: ValueExprId, type: CanonicalType, signalComponents?: readonly ValueExprId[]): ValueExprId;

  /** Reduce a field to a signal (cardinality many → one). */
  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId;

  /** Create an intrinsic field expression (index, randomId, normalizedIndex). */
  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId;

  /** Create a placement field expression (uv, rank, seed). */
  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId;

  /** Create a state-read expression (symbolic - resolved by orchestrator). */
  stateRead(stateKey: StableStateId, type: CanonicalType): ValueExprId;

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

  /** Extract a component from a composite payload. */
  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId;

  /** Construct a composite from components. */
  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId;

  /** Convert color from HSL to RGB (alpha passthrough). */
  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId;

  // =========================================================================
  // Event Expression Methods
  // =========================================================================

  /** Create a pulse event (fires every tick). */
  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId;

  /** Create a wrap event from a signal (rising edge). */
  eventWrap(signal: ValueExprId): ValueExprId;

  /** Combine multiple events (any/all/merge/last). */
  eventCombine(events: readonly ValueExprId[], mode: 'any' | 'all' | 'merge' | 'last', type?: CanonicalType): ValueExprId;

  /** Create a "never fires" event. */
  eventNever(): ValueExprId;

  // =========================================================================
  // Event Slot Allocation (allowed - events are special)
  // =========================================================================

  allocEventSlot(eventId: ValueExprId): EventSlotId;

  // =========================================================================
  // Utility
  // =========================================================================

  kernel(name: string): PureFn;
  opcode(op: OpCode): PureFn;
  expr(expression: string): PureFn;

  /** Create a new instance of a domain type. */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    shapeField?: ValueExprId,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId;

  setCurrentBlockId(blockId: string): void;

  // =========================================================================
  // Query Methods (read-only access)
  // =========================================================================

  /** Get a single value expression by ID (for inspection). */
  getValueExpr(id: ValueExprId): any;

  /** Get all value expressions (read-only). Used for searching/inspecting IR during lowering. */
  getValueExprs(): readonly any[];

  // =========================================================================
  // Render Globals (blocks can declare camera/render settings)
  // =========================================================================

  addRenderGlobal(decl: any): void;
}
