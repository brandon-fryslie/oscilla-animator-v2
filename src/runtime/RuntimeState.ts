/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 * Simplified for v2 - no hot-swap complexity initially.
 */

import type { EffectiveTime, TimeState } from './timeResolution';
import { createTimeState } from './timeResolution';
import type { ContinuityState } from './ContinuityState';
import { createContinuityState } from './ContinuityState';
import type { DebugTap } from './DebugTap';
import type { RenderFrameIR } from '../render/types';
import type { RuntimeScalarArenaAddress } from '../compiler/ir/program';
import { ExternalChannelSystem } from './ExternalChannel';
import { createArena } from './ArenaValueStore';

/**
 * Shape2D packed record word layout (8 x u32 words per shape)
 *
 * Fixed-width record for efficient shape storage and dispatch.
 * See: .agent_planning/_future/12-shapes-types.md
 */
export const SHAPE2D_WORDS = 8;

export enum Shape2DWord {
  /** Numeric topology ID (dispatch key) */
  TopologyId = 0,
  /** FieldSlot ID containing control points (vec2) */
  PointsFieldSlot = 1,
  /** Number of vec2 points expected (validation / fast path) */
  PointsCount = 2,
  /** Optional: scalar slot or style table ID (0 means default) */
  StyleRef = 3,
  /** Bitfield: fill/stroke, fillRule, closed, etc. */
  Flags = 4,
  /** Reserved for future use */
  Reserved0 = 5,
  Reserved1 = 6,
  Reserved2 = 7,
}

/**
 * Shape2D flags bitfield values
 */
export const Shape2DFlags = {
  /** Shape path is closed */
  CLOSED: 1 << 0,
  /** Use fill rendering */
  FILL: 1 << 1,
  /** Use stroke rendering */
  STROKE: 1 << 2,
  /** Fill rule: 0 = nonzero, 1 = evenodd */
  EVENODD_FILL: 1 << 3,
} as const;

/**
 * ShapeBank header word layout (4 x u32 words per shape topology record).
 */
export const SHAPE_BANK_HEADER_WORDS = 4;

export enum ShapeBankHeaderWord {
  IndexCount = 0,
  IndexOffset = 1,
  VertexCount = 2,
  Flags = 3,
}

export interface ShapeBankHeaderRecord {
  indexCount: number;
  indexOffset: number;
  vertexCount: number;
  flags: number;
}

/** Sentinel for shape handles that do not reference a control-point field slot. */
export const SHAPE_BANK_NO_CONTROL_POINT_SLOT = -1;

export interface ShapeBankHandleMetadata {
  topologyId: number;
  controlPointSlot: number;
}

/**
 * Default per-program ShapeBank capacity (u32 words).
 *
 * [LAW:single-enforcer] RuntimeState owns default ShapeBank sizing for
 * handle-based shape execution when compile metadata does not override it.
 */
export const DEFAULT_SHAPE_BANK_WORD_CAPACITY = 4096;

/**
 * ShapeBankState - Uint32 topology bank + frame-volatile bump allocator.
 *
 * [LAW:single-enforcer] RuntimeState owns ShapeBank allocation invariants.
 */
export interface ShapeBankState {
  /** Packed u32 topology bank. */
  data: Uint32Array;
  /** Frame-volatile allocator pointer (u32 word offset). */
  volatilePtr: number;
  /** Start of volatile region (lower range reserved for static assets). */
  staticBoundary: number;
  /**
   * Handle (word offset) -> topology ID sidecar.
   *
   * [LAW:one-source-of-truth] Shape handles resolve topology ownership from
   * this canonical ShapeBank sidecar, not ad-hoc runtime maps.
   */
  topologyIdByHandle: Uint32Array;
  /**
   * Handle (word offset) -> control-point field slot sidecar.
   * `-1` means "no control-point field slot".
   */
  controlPointSlotByHandle: Int32Array;
}

/**
 * Create ShapeBank with optional reserved static region.
 */
export function createShapeBank(
  wordCapacity: number = 0,
  staticBoundary: number = 0,
): ShapeBankState {
  if (!Number.isInteger(wordCapacity) || wordCapacity < 0) {
    throw new Error('createShapeBank: wordCapacity must be a non-negative integer');
  }
  if (!Number.isInteger(staticBoundary) || staticBoundary < 0) {
    throw new Error('createShapeBank: staticBoundary must be a non-negative integer');
  }
  if (staticBoundary > wordCapacity) {
    throw new Error(
      `createShapeBank: staticBoundary ${staticBoundary} exceeds capacity ${wordCapacity}`,
    );
  }
  return {
    data: new Uint32Array(wordCapacity),
    volatilePtr: staticBoundary,
    staticBoundary,
    topologyIdByHandle: new Uint32Array(wordCapacity),
    controlPointSlotByHandle: new Int32Array(wordCapacity).fill(SHAPE_BANK_NO_CONTROL_POINT_SLOT),
  };
}

/**
 * Reset frame-volatile ShapeBank allocator pointer.
 *
 * [LAW:dataflow-not-control-flow] Reset is unconditional at frame start.
 */
export function resetShapeBankFrameAllocator(shapeBank: ShapeBankState): void {
  shapeBank.volatilePtr = shapeBank.staticBoundary;
}

/**
 * Allocate `words` in frame-volatile ShapeBank region.
 *
 * @returns Handle (u32 word offset into ShapeBank)
 */
export function allocShapeBankWords(shapeBank: ShapeBankState, words: number): number {
  if (!Number.isInteger(words) || words <= 0) {
    throw new Error('allocShapeBankWords: words must be a positive integer');
  }
  const start = shapeBank.volatilePtr;
  const end = start + words;
  if (end > shapeBank.data.length) {
    throw new Error(
      `allocShapeBankWords: out of capacity (need ${end}, capacity ${shapeBank.data.length})`,
    );
  }
  shapeBank.volatilePtr = end;
  return start;
}

/**
 * Read ShapeBank topology header at handle offset.
 */
export function readShapeBankHeader(
  bank: Uint32Array,
  handle: number,
): ShapeBankHeaderRecord {
  return {
    indexCount: bank[handle + ShapeBankHeaderWord.IndexCount],
    indexOffset: bank[handle + ShapeBankHeaderWord.IndexOffset],
    vertexCount: bank[handle + ShapeBankHeaderWord.VertexCount],
    flags: bank[handle + ShapeBankHeaderWord.Flags],
  };
}

/**
 * Write ShapeBank topology header at handle offset.
 */
export function writeShapeBankHeader(
  bank: Uint32Array,
  handle: number,
  header: ShapeBankHeaderRecord,
): void {
  bank[handle + ShapeBankHeaderWord.IndexCount] = header.indexCount;
  bank[handle + ShapeBankHeaderWord.IndexOffset] = header.indexOffset;
  bank[handle + ShapeBankHeaderWord.VertexCount] = header.vertexCount;
  bank[handle + ShapeBankHeaderWord.Flags] = header.flags;
}

/**
 * Write runtime handle metadata sidecar for a ShapeBank record.
 */
export function writeShapeBankHandleMetadata(
  shapeBank: ShapeBankState,
  handle: number,
  metadata: ShapeBankHandleMetadata,
): void {
  shapeBank.topologyIdByHandle[handle] = metadata.topologyId >>> 0;
  shapeBank.controlPointSlotByHandle[handle] = metadata.controlPointSlot;
}

/**
 * Read runtime handle metadata sidecar for a ShapeBank record.
 */
export function readShapeBankHandleMetadata(
  shapeBank: ShapeBankState,
  handle: number,
): ShapeBankHandleMetadata {
  return {
    topologyId: shapeBank.topologyIdByHandle[handle] >>> 0,
    controlPointSlot: shapeBank.controlPointSlotByHandle[handle] ?? SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  };
}

// =============================================================================
// Deterministic Frame Segment Semantics (W13)
// =============================================================================

/**
 * Canonical runtime frame segments in strict execution order.
 *
 * [LAW:one-source-of-truth] Segment ownership/order is defined once here and
 * shared by all runtime frame executors/inspectors.
 */
export const RUNTIME_FRAME_SEGMENT_ORDER = [
  'preframe-external-input',
  'preframe-time-resolve',
  'preframe-event-reset',
  'phase1-value-pre-event',
  'phase1-continuity-map',
  'phase1-value-after-map',
  'phase1-continuity-apply',
  'phase1-event-dispatch',
  'phase1-value-post-event',
  'phase1-render-collect',
  'phase1-debug-materialize',
  'render-assembly',
  'phase2-state-write',
  'continuity-finalize',
  'frame-output',
] as const;

export type RuntimeFrameSegment = (typeof RUNTIME_FRAME_SEGMENT_ORDER)[number];

export interface RuntimeFrameSegmentOwnership {
  /** Canonical read surfaces touched by this segment */
  reads: readonly string[];
  /** Canonical write surfaces touched by this segment */
  writes: readonly string[];
}

/**
 * Canonical ownership contract per frame segment.
 *
 * [LAW:one-source-of-truth] Segment read/write ownership is defined once here
 * so execution/tests share one deterministic frame-graph contract.
 */
export const RUNTIME_FRAME_SEGMENT_OWNERSHIP: Readonly<
  Record<RuntimeFrameSegment, RuntimeFrameSegmentOwnership>
> = {
  'preframe-external-input': {
    reads: ['externalChannels.writeBus'],
    writes: ['externalChannels.snapshot'],
  },
  'preframe-time-resolve': {
    reads: ['timeState'],
    writes: ['time'],
  },
  'preframe-event-reset': {
    reads: ['events', 'eventScalars'],
    writes: ['events', 'eventScalars'],
  },
  'phase1-value-pre-event': {
    reads: ['arena', 'state.readBank', 'eventScalars', 'externalChannels.snapshot'],
    writes: ['arena', 'cache.scalarValueExprValues', 'cache.scalarValueExprStamps'],
  },
  'phase1-continuity-map': {
    reads: ['continuity.prevDomains'],
    writes: ['continuity.prevDomains', 'continuity.mappings', 'continuity.changedInstancesThisFrame'],
  },
  'phase1-value-after-map': {
    reads: ['arena', 'state.readBank', 'eventScalars', 'externalChannels.snapshot'],
    writes: ['arena', 'cache.scalarValueExprValues', 'cache.scalarValueExprStamps'],
  },
  'phase1-continuity-apply': {
    reads: ['continuity.changedInstancesThisFrame', 'continuity.mappings', 'arena'],
    writes: ['continuity.targets', 'arena'],
  },
  'phase1-event-dispatch': {
    reads: ['arena', 'eventWrapPredicate'],
    writes: ['eventScalars', 'events', 'eventWrapPredicate'],
  },
  'phase1-value-post-event': {
    reads: ['arena', 'state.readBank', 'eventScalars', 'externalChannels.snapshot'],
    writes: ['arena', 'cache.scalarValueExprValues', 'cache.scalarValueExprStamps'],
  },
  'phase1-render-collect': {
    reads: ['arena'],
    writes: ['render step buffer'],
  },
  'phase1-debug-materialize': {
    reads: ['arena'],
    writes: ['debug tap'],
  },
  'render-assembly': {
    reads: ['render step buffer', 'arena'],
    writes: ['lastRenderFrame'],
  },
  'phase2-state-write': {
    reads: ['arena', 'state.readBank', 'state mappings'],
    writes: ['state.writeBank'],
  },
  'continuity-finalize': {
    reads: ['time'],
    writes: [
      'continuity.lastTModelMs',
      'continuity.domainChangeThisFrame',
      'continuity.changedInstancesThisFrame',
      'continuity.mappings',
    ],
  },
  'frame-output': {
    reads: ['lastRenderFrame'],
    writes: ['lastRenderFrame'],
  },
} as const;

export interface RuntimeFrameSemantics {
  /** Frame id this trace belongs to (RuntimeState.cache.frameId) */
  frameId: number;
  /** Ordered unique segment transitions observed in the frame */
  segments: RuntimeFrameSegment[];
}

const RUNTIME_FRAME_SEGMENT_INDEX = new Map<RuntimeFrameSegment, number>(
  RUNTIME_FRAME_SEGMENT_ORDER.map((segment, index) => [segment, index]),
);

/**
 * Reset frame segment tracing for the current frame.
 */
export function beginRuntimeFrameSemantics(state: RuntimeState): void {
  if (!state.frameSemantics) {
    state.frameSemantics = {
      frameId: state.cache.frameId,
      segments: [],
    };
  }
  state.frameSemantics.frameId = state.cache.frameId;
  state.frameSemantics.segments.length = 0;
}

/**
 * Record a frame segment transition and enforce canonical monotonic ordering.
 *
 * [LAW:dataflow-not-control-flow] Runtime frame ownership varies by segment data,
 * not by ad-hoc execution branches; monotonic segment transitions are explicit.
 */
export function enterRuntimeFrameSegment(
  state: RuntimeState,
  segment: RuntimeFrameSegment,
): void {
  if (!state.frameSemantics || state.frameSemantics.frameId !== state.cache.frameId) {
    beginRuntimeFrameSemantics(state);
  }
  const semantics = state.frameSemantics!;
  const previous = semantics.segments[semantics.segments.length - 1];
  if (previous === segment) return;

  const previousIndex = previous ? (RUNTIME_FRAME_SEGMENT_INDEX.get(previous) ?? -1) : -1;
  const nextIndex = RUNTIME_FRAME_SEGMENT_INDEX.get(segment) ?? -1;
  if (nextIndex < previousIndex) {
    throw new Error(
      `Runtime frame segment order violation: '${segment}' cannot follow '${previous}'`,
    );
  }
  semantics.segments.push(segment);
}

// =============================================================================
// Event Payload Types (Spec §5: Runtime)
// =============================================================================

/**
 * EventPayload - Data-carrying event occurrence
 *
 * Spec reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md
 *
 * Events can carry numeric values (key + value pair).
 * Used by SampleAndHold, Accumulator, and other event-to-continuous blocks.
 */
export interface EventPayload {
  /** Event identifier (semantic key) */
  key: string;

  /** Event value (float or int) */
  value: number;
}

/**
 * EventBuffer - Per-slot event buffer
 *
 * Preallocated buffer for event payloads fired in a single tick.
 * Events clear after one tick (Spec §6.1 / Invariant I4).
 */
export interface EventBuffer {
  /** Events that occurred this tick (cleared each frame) */
  events: EventPayload[];

  /** Preallocated capacity (for memory management) */
  capacity: number;
}

/**
 * ValueStore - Slot-based value storage
 *
 * Stores non-arena typed banks by slot ID.
 * [LAW:one-source-of-truth] Numeric slot values live only in RuntimeState.arena.
 */
export interface ValueStore {
  /**
   * Packed shape2d values (8 x u32 words per shape)
   *
   * Layout: [shape0_word0..shape0_word7, shape1_word0..shape1_word7, ...]
   * Access: shape2d[offset * SHAPE2D_WORDS + Shape2DWord.TopologyId]
   */
  shape2d: Uint32Array;
}

/**
 * Create a ValueStore
 *
 * @param shape2dSlotCount - Number of shape2d slots (defaults to 0)
 */
export function createValueStore(shape2dSlotCount: number = 0): ValueStore {
  return {
    shape2d: new Uint32Array(shape2dSlotCount * SHAPE2D_WORDS),
  };
}

// =============================================================================
// Shape2D Pack/Unpack Utilities
// =============================================================================

/**
 * Unpacked shape2d record for easier manipulation
 */
export interface Shape2DRecord {
  /** Numeric topology ID (dispatch key) */
  topologyId: number;
  /** FieldSlot ID containing control points (vec2) */
  pointsFieldSlot: number;
  /** Number of vec2 points expected */
  pointsCount: number;
  /** Style reference (0 = default) */
  styleRef: number;
  /** Flags bitfield */
  flags: number;
}

/**
 * Read a shape2d record from the packed bank
 *
 * @param bank - The shape2d Uint32Array bank
 * @param offset - Slot offset (not byte offset)
 * @returns Unpacked shape2d record
 */
export function readShape2D(bank: Uint32Array, offset: number): Shape2DRecord {
  const baseIndex = offset * SHAPE2D_WORDS;
  return {
    topologyId: bank[baseIndex + Shape2DWord.TopologyId],
    pointsFieldSlot: bank[baseIndex + Shape2DWord.PointsFieldSlot],
    pointsCount: bank[baseIndex + Shape2DWord.PointsCount],
    styleRef: bank[baseIndex + Shape2DWord.StyleRef],
    flags: bank[baseIndex + Shape2DWord.Flags],
  };
}

/**
 * Write a shape2d record to the packed bank
 *
 * @param bank - The shape2d Uint32Array bank
 * @param offset - Slot offset (not byte offset)
 * @param record - Shape2d record to write
 */
export function writeShape2D(bank: Uint32Array, offset: number, record: Shape2DRecord): void {
  const baseIndex = offset * SHAPE2D_WORDS;
  bank[baseIndex + Shape2DWord.TopologyId] = record.topologyId;
  bank[baseIndex + Shape2DWord.PointsFieldSlot] = record.pointsFieldSlot;
  bank[baseIndex + Shape2DWord.PointsCount] = record.pointsCount;
  bank[baseIndex + Shape2DWord.StyleRef] = record.styleRef;
  bank[baseIndex + Shape2DWord.Flags] = record.flags;
  // Reserved words are left as 0
}

/**
 * FrameCache - Per-frame memoization
 *
 * Uses stamp-based invalidation (no array clearing between frames).
 * Cache is valid when stamp === frameId.
 *
 * C-15 FIX: Field buffers use nested Map structure Map<fieldId, Map<instanceId, buffer>>
 * to eliminate string allocation in hot path.
 */
export interface FrameCache {
  /** Current frame ID (monotonic, starts at 0) */
  frameId: number;

  /** Cached scalar ValueExpr values (indexed by ValueExprId) */
  scalarValueExprValues: Float32Array;

  /** Frame stamps for scalar ValueExpr cache validation */
  scalarValueExprStamps: Uint32Array;

  /**
   * Cached ValueExpr field buffers (indexed by ValueExprId, simple array).
   * Cache by expression ID since instanceId is embedded in the type.
   */
  valueExprFieldBuffers: (ArrayBufferView | null)[];

  /**
   * Frame stamps for ValueExpr field cache validation (indexed by ValueExprId).
   */
  valueExprFieldStamps: number[];

  /** Scalar ValueExprId -> canonical arena address metadata. */
  scalarExprToArenaAddress: ReadonlyMap<number, RuntimeScalarArenaAddress> | null;
}

/**
 * Create a FrameCache
 */
export function createFrameCache(
  maxValueExprs: number = 0
): FrameCache {
  return {
    frameId: 1, // Start at 1 so initial stamps[n]=0 don't match
    scalarValueExprValues: new Float32Array(maxValueExprs),
    scalarValueExprStamps: new Uint32Array(maxValueExprs),
    valueExprFieldBuffers: new Array(maxValueExprs).fill(null),
    valueExprFieldStamps: new Array(maxValueExprs).fill(-1),
    scalarExprToArenaAddress: null,
  };
}

/**
 * HealthMetrics - Runtime health monitoring state
 *
 * Tracks performance metrics and error conditions for diagnostics.
 * Uses batched aggregation to minimize overhead (<1% frame budget).
 *
 * Batching strategy:
 * - Frame times: Ring buffer (last 10 frames)
 * - NaN/Inf: 100ms batch windows (not per-occurrence)
 * - Snapshots: Throttled to 5 Hz (200ms interval)
 */
export interface HealthMetrics {
  /** Ring buffer of last 10 frame times (ms) */
  frameTimes: number[];

  /** Current write position in frameTimes ring buffer */
  frameTimesIndex: number;

  /** Count of NaN batch windows detected (NOT individual NaN occurrences) */
  nanCount: number;

  /** Count of Infinity batch windows detected */
  infCount: number;

  /** Block ID of last NaN occurrence (for diagnostic target) */
  lastNanBlockId: string | null;

  /** Block ID of last Infinity occurrence (for diagnostic target) */
  lastInfBlockId: string | null;

  /** Count of field materializations (for perf diagnostics) */
  materializationCount: number;

  /** Timestamp of last health snapshot emission (performance.now()) */
  lastSnapshotTime: number;

  /** Start of current sampling batch window (performance.now()) */
  samplingBatchStart: number;

  /** NaN occurrences in current batch window (resets every 100ms) */
  nanBatchCount: number;

  /** Infinity occurrences in current batch window (resets every 100ms) */
  infBatchCount: number;

  // === Assembler Performance Metrics ===

  /** Ring buffer of assembler grouping times (ms per frame, last 10 frames) */
  assemblerGroupingMs: number[];
  assemblerGroupingMsIndex: number;

  /** Ring buffer of assembler slicing times (ms per frame, last 10 frames) */
  assemblerSlicingMs: number[];
  assemblerSlicingMsIndex: number;

  /** Ring buffer of assembler total times (ms per frame, last 10 frames) */
  assemblerTotalMs: number[];
  assemblerTotalMsIndex: number;

  /** Topology group cache hits in current snapshot window */
  topologyGroupCacheHits: number;

  /** Topology group cache misses in current snapshot window */
  topologyGroupCacheMisses: number;

  // === Frame Timing Metrics (for detecting timing jitter/aliasing) ===

  /** Previous rAF timestamp (for computing frame delta) */
  prevRafTimestamp: number | null;

  /** Ring buffer of frame deltas (time between rAF callbacks, ms) - last 60 frames */
  frameDeltas: number[];

  /** Current write position in frameDeltas ring buffer */
  frameDeltasIndex: number;

  /** Count of dropped frames (delta > 20ms) in current snapshot window */
  droppedFrameCount: number;

  /** Total frames in current snapshot window */
  frameCountInWindow: number;

  /** Sum of frame deltas for variance calculation */
  frameDeltaSum: number;

  /** Sum of squared frame deltas for variance calculation */
  frameDeltaSumSq: number;

  /** Minimum frame delta in current window */
  minFrameDelta: number;

  /** Maximum frame delta in current window */
  maxFrameDelta: number;

  // === Memory Instrumentation (Sprint: memory-instrumentation) ===

  /** Pool allocations in last frame */
  poolAllocs: number;

  /** Pool releases in last frame */
  poolReleases: number;

  /** Total pooled bytes across all pools */
  pooledBytes: number;

  /** Number of distinct pool keys */
  poolKeyCount: number;
}

/**
 * Create initial HealthMetrics state
 */
export function createHealthMetrics(): HealthMetrics {
  return {
    frameTimes: new Array(10).fill(0),
    frameTimesIndex: 0,
    nanCount: 0,
    infCount: 0,
    lastNanBlockId: null,
    lastInfBlockId: null,
    materializationCount: 0,
    lastSnapshotTime: 0,
    samplingBatchStart: 0,
    nanBatchCount: 0,
    infBatchCount: 0,
    // Assembler performance metrics
    assemblerGroupingMs: new Array(10).fill(0),
    assemblerGroupingMsIndex: 0,
    assemblerSlicingMs: new Array(10).fill(0),
    assemblerSlicingMsIndex: 0,
    // Memory instrumentation
    poolAllocs: 0,
    poolReleases: 0,
    pooledBytes: 0,
    poolKeyCount: 0,
    assemblerTotalMs: new Array(10).fill(0),
    assemblerTotalMsIndex: 0,
    topologyGroupCacheHits: 0,
    topologyGroupCacheMisses: 0,
    // Frame timing metrics
    prevRafTimestamp: null,
    frameDeltas: new Array(60).fill(0),
    frameDeltasIndex: 0,
    droppedFrameCount: 0,
    frameCountInWindow: 0,
    frameDeltaSum: 0,
    frameDeltaSumSq: 0,
    minFrameDelta: Infinity,
    maxFrameDelta: 0,
  };
}

/**
 * ContinuityConfig - User-configurable continuity parameters
 *
 * Controls the behavior of continuity system transitions.
 * Persisted in RuntimeState to survive hot-swap.
 */
export interface ContinuityConfig {
  /** Decay exponent for gauge decay (0.1-2.0, default 0.7) */
  decayExponent: number;

  /** Global multiplier for all transition times (0.5-3.0, default 1.0) */
  tauMultiplier: number;

  /** Base tau duration in milliseconds (50-500ms, default 150ms)
   * Applied as factor: effectiveTau = policyTau × (baseTauMs / 150) × tauMultiplier
   * This gives an absolute-time feel to the control
   */
  baseTauMs: number;

  /** Test pulse request (null when no pulse requested) */
  testPulseRequest?: {
    /** Pulse magnitude (e.g., 50 for 50px offset) */
    magnitude: number;
    /** Target semantic ('position' | 'radius' | etc., or null for all) */
    targetSemantic?: string;
    /** Frame ID when pulse was applied (prevents double-apply) */
    appliedFrameId?: number;
  } | null;
}

/**
 * Create default continuity config
 */
export function createContinuityConfig(): ContinuityConfig {
  return {
    decayExponent: 0.7,
    tauMultiplier: 1.0,
    baseTauMs: 150,
    testPulseRequest: null,
  };
}

// =============================================================================
// Session vs Program State Split
// =============================================================================
//
// SessionState: Long-lived state that survives hot-swap (created once at startup)
// ProgramState: Per-compile state that is recreated on each hot-swap
//
// This split makes lifecycle explicit: SessionState is never recreated,
// ProgramState is recreated on every compile with state migration.

/**
 * SessionState - Long-lived state that survives hot-swap
 *
 * Created once at application startup and never recreated.
 * Contains state that must persist across recompilations.
 */
export interface SessionState {
  /** Time state for wrap detection (persistent across frames and compiles) */
  timeState: TimeState;

  /** External channel system (generic input infrastructure) */
  external: ExternalChannelSystem;

  /** Health monitoring metrics */
  health: HealthMetrics;

  /** Continuity state for smooth transitions (survives hot-swap) */
  continuity: ContinuityState;

  /** Continuity config for user-controlled parameters */
  continuityConfig: ContinuityConfig;

  /** Optional debug tap for runtime observation */
  tap?: DebugTap;
}

/**
 * ProgramState - Per-compile state, recreated on hot-swap
 *
 * Created fresh on each compile. Stateful primitive state is
 * migrated using StableStateIds (see StateMigration.ts).
 */
export interface ProgramState {
  /** Per-frame value storage (slot-based) */
  values: ValueStore;

  /** Last assembled frame for the current program execution. */
  lastRenderFrame: RenderFrameIR | null;

  /** Float32 arena for unified value store (cardinality unification migration) */
  arena: Float32Array;

  /** Persistent state segment within arena (W1/W14 canonical ownership). */
  stateArena: {
    readonly offset: number;
    readonly length: number;
    /** Length of each state bank (read/write) in floats. */
    readonly bankLength?: number;
    /** Active read-bank offset in `arena` (for diagnostics/debug only). */
    readOffset?: number;
    /** Active write-bank offset in `arena` (for diagnostics/debug only). */
    writeOffset?: number;
  };

  /** Frame cache (per-frame memoization) - cache owns frameId */
  cache: FrameCache;

  /** Deterministic frame segment trace for the current frame (W13). */
  frameSemantics: RuntimeFrameSemantics;

  /** Current effective time (set each frame) */
  time: EffectiveTime | null;

  /** Stateful primitive state (migrated via StableStateIds on hot-swap) */
  state: Float32Array;

  /** Phase-2 state write target bank (committed via end-of-frame swap). */
  stateWrite: Float32Array;

  /** Event scalar storage (0=not fired, 1=fired this tick). Cleared each frame. */
  eventScalars: Uint8Array;

  /**
   * Previous predicate values for wrap edge detection (indexed by ValueExprId).
   * Used by the canonical ValueExpr event evaluator.
   */
  eventWrapPredicate: Uint8Array;

  /**
   * Event payload storage (spec-compliant data-carrying events)
   *
   * Maps event slot ID to array of EventPayload occurrences this tick.
   * Cleared each frame alongside eventScalars (spec §6.1 / Invariant I4).
   *
   * Usage:
   * - Event-producing blocks push EventPayload to the array
   * - Event-consuming blocks (SampleAndHold) read from the array
   * - Cleared at frame start (monotone OR: only append, never remove mid-frame)
   */
  events: Map<number, EventPayload[]>;

  /** Shape topology bank + frame-volatile allocator. */
  shapeBank: ShapeBankState;
}

/**
 * RuntimeState - Complete frame execution state
 *
 * Composes SessionState (long-lived) and ProgramState (per-compile).
 * The flat structure is kept for backwards compatibility with existing code.
 */
export interface RuntimeState {
  // === ProgramState fields (recreated on compile) ===

  /** Per-frame value storage (slot-based) */
  values: ValueStore;

  /** Last assembled frame for the current program execution. */
  lastRenderFrame: RenderFrameIR | null;

  /** Float32 arena for unified value store (cardinality unification migration) */
  arena: Float32Array;

  /** Persistent state segment within arena (W1/W14 canonical ownership). */
  stateArena: {
    readonly offset: number;
    readonly length: number;
    /** Length of each state bank (read/write) in floats. */
    readonly bankLength?: number;
    /** Active read-bank offset in `arena` (for diagnostics/debug only). */
    readOffset?: number;
    /** Active write-bank offset in `arena` (for diagnostics/debug only). */
    writeOffset?: number;
  };

  /** Frame cache (per-frame memoization) - cache owns frameId */
  cache: FrameCache;

  /** Deterministic frame segment trace for the current frame (W13). */
  frameSemantics?: RuntimeFrameSemantics;

  /** Current effective time (set each frame) */
  time: EffectiveTime | null;

  /** Stateful primitive state (migrated via StableStateIds on hot-swap) */
  state: Float32Array;

  /** Phase-2 state write target bank (committed via end-of-frame swap). */
  stateWrite?: Float32Array;

  /** Event scalar storage (0=not fired, 1=fired this tick). Cleared each frame. */
  eventScalars: Uint8Array;

  /**
   * Previous predicate values for wrap edge detection (indexed by ValueExprId).
   * Used by the canonical ValueExpr event evaluator.
   */
  eventWrapPredicate: Uint8Array;

  /**
   * Cycle detection bitset for event combine recursion.
   * Allocated on-demand in evaluateValueExprEvent().
   */
  eventCycleDetection?: Uint8Array;

  /**
   * Event payload storage (spec-compliant data-carrying events)
   *
   * Maps event slot ID to array of EventPayload occurrences this tick.
   * Cleared each frame alongside eventScalars (spec §6.1 / Invariant I4).
   */
  events: Map<number, EventPayload[]>;

  /** Shape topology bank + frame-volatile allocator. */
  shapeBank?: ShapeBankState;

  // === SessionState fields (survive hot-swap) ===

  /** Time state for wrap detection (persistent across frames) */
  timeState: TimeState;

  /** External channel system (generic input infrastructure) */
  externalChannels: ExternalChannelSystem;

  /** Health monitoring metrics (Sprint 2+) */
  health: HealthMetrics;

  /** Continuity state for smooth transitions (spec topics/11-continuity-system.md) */
  continuity: ContinuityState;

  /** Continuity config for user-controlled parameters (survives hot-swap) */
  continuityConfig: ContinuityConfig;

  /** Optional debug tap for runtime observation (Sprint 1: Debug Probe) */
  tap?: DebugTap;
}

/**
 * Create a SessionState (called once at startup)
 */
export function createSessionState(): SessionState {
  return {
    timeState: createTimeState(),
    external: new ExternalChannelSystem(),
    health: createHealthMetrics(),
    continuity: createContinuityState(),
    continuityConfig: createContinuityConfig(),
  };
}

/**
 * Create a ProgramState (called on each compile)
 */
export function createProgramState(
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0,
  valueExprCount: number = 0,
  arenaTotalFloats: number = 0,
  shape2dSlotCount: number = 0,
  shapeBankWordCapacity: number = DEFAULT_SHAPE_BANK_WORD_CAPACITY,
  shapeBankStaticBoundary: number = 0,
): ProgramState {
  // [LAW:one-source-of-truth] event wrap-edge state lives in eventWrapPredicate;
  // eventExprCount is accepted for callsite compatibility while compile/runtime
  // signatures converge on ValueExpr-driven sizing.
  void eventExprCount;
  const stateArenaOffset = arenaTotalFloats;
  // [LAW:one-source-of-truth] Persistent primitive state ownership is explicit:
  // one read bank + one write bank in a single arena segment.
  const stateBankLength = stateSlotCount;
  const readOffset = stateArenaOffset;
  const writeOffset = stateArenaOffset + stateBankLength;
  const arena = createArena(arenaTotalFloats + stateBankLength * 2);
  const stateReadView = arena.subarray(readOffset, readOffset + stateBankLength);
  const stateWriteView = arena.subarray(writeOffset, writeOffset + stateBankLength);
  return {
    values: createValueStore(shape2dSlotCount),
    lastRenderFrame: null,
    arena,
    // [LAW:one-source-of-truth] Persistent state ownership is anchored to one
    // arena segment contract with explicit read/write bank metadata.
    stateArena: {
      offset: stateArenaOffset,
      length: stateBankLength * 2,
      bankLength: stateBankLength,
      readOffset,
      writeOffset,
    },
    cache: createFrameCache(valueExprCount),
    frameSemantics: {
      frameId: 0,
      segments: [],
    },
    time: null,
    state: stateReadView,
    stateWrite: stateWriteView,
    eventScalars: new Uint8Array(eventSlotCount),
    eventWrapPredicate: new Uint8Array(valueExprCount),
    events: new Map(),
    // [LAW:single-enforcer] ShapeBank allocator invariants are owned by
    // createShapeBank(), not duplicated across runtime construction callsites.
    shapeBank: createShapeBank(shapeBankWordCapacity, shapeBankStaticBoundary),
  };
}

/**
 * Create a RuntimeState by composing SessionState and ProgramState
 *
 * Convenience constructor for tests and utilities.
 * New production callsites should compose session/program state explicitly via
 * createSessionState() + createRuntimeStateFromSession().
 * @internal Not part of public API
 */
export function createRuntimeState(
  slotCount: number,
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0,
  valueExprCount: number = 0,
  arenaTotalFloats: number = 0,
  shape2dSlotCount: number = 0,
  shapeBankWordCapacity: number = DEFAULT_SHAPE_BANK_WORD_CAPACITY,
  shapeBankStaticBoundary: number = 0,
): RuntimeState {
  const session = createSessionState();
  // [LAW:no-mode-explosion] `slotCount` remains as a compatibility-only
  // positional arg for legacy tests; program/runtime construction no longer
  // depends on it.
  void slotCount;
  return createRuntimeStateFromSession(
    session,
    stateSlotCount,
    eventSlotCount,
    eventExprCount,
    valueExprCount,
    arenaTotalFloats,
    shape2dSlotCount,
    shapeBankWordCapacity,
    shapeBankStaticBoundary,
  );
}

/**
 * Create a RuntimeState from existing SessionState and new ProgramState
 *
 * Used during hot-swap to preserve session state while replacing program state.
 */
export function createRuntimeStateFromSession(
  session: SessionState,
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0,
  valueExprCount: number = 0,
  arenaTotalFloats: number = 0,
  shape2dSlotCount: number = 0,
  shapeBankWordCapacity: number = DEFAULT_SHAPE_BANK_WORD_CAPACITY,
  shapeBankStaticBoundary: number = 0,
): RuntimeState {
  const program = createProgramState(
    stateSlotCount,
    eventSlotCount,
    eventExprCount,
    valueExprCount,
    arenaTotalFloats,
    shape2dSlotCount,
    shapeBankWordCapacity,
    shapeBankStaticBoundary,
  );
  return {
    // ProgramState (fresh)
    values: program.values,
    lastRenderFrame: program.lastRenderFrame,
    arena: program.arena,
    stateArena: program.stateArena,
    cache: program.cache,
    frameSemantics: program.frameSemantics,
    time: program.time,
    state: program.state,
    stateWrite: program.stateWrite,
    eventScalars: program.eventScalars,
    eventWrapPredicate: program.eventWrapPredicate,
    events: program.events,
    shapeBank: program.shapeBank,
    // SessionState (preserved)
    timeState: session.timeState,
    externalChannels: session.external,
    health: session.health,
    continuity: session.continuity,
    continuityConfig: session.continuityConfig,
    tap: session.tap,
  };
}

/**
 * Reset frame-volatile ShapeBank allocator for a new frame.
 */
export function resetFrameVolatileShapeBank(state: RuntimeState): void {
  if (!state.shapeBank) return;
  // [LAW:single-enforcer] Frame reset delegates to one allocator boundary.
  resetShapeBankFrameAllocator(state.shapeBank);
}

/**
 * Prepare the state write bank for Phase 2.
 *
 * Copies the active read bank into the write bank so unchanged state slots
 * preserve previous-frame values when not explicitly rewritten this frame.
 */
export function prepareStateWriteBank(state: RuntimeState): void {
  const write = state.stateWrite ?? state.state;
  if (write.length !== state.state.length) {
    throw new Error(
      'prepareStateWriteBank: read/write bank length mismatch (read=' +
        state.state.length +
        ', write=' +
        write.length +
        ')',
    );
  }
  write.set(state.state);
  if (!state.stateWrite) {
    state.stateWrite = write;
  }
}

/**
 * Commit Phase-2 state writes by swapping read/write bank ownership.
 */
export function commitStateWriteBank(state: RuntimeState): void {
  const write = state.stateWrite;
  if (!write || write === state.state) {
    return;
  }
  const previousRead = state.state;
  state.state = write;
  state.stateWrite = previousRead;
  const readOffset = state.stateArena.readOffset;
  const writeOffset = state.stateArena.writeOffset;
  if (readOffset !== undefined && writeOffset !== undefined) {
    state.stateArena.readOffset = writeOffset;
    state.stateArena.writeOffset = readOffset;
  }
}

/**
 * Extract SessionState from a RuntimeState
 *
 * Useful for preserving session state during hot-swap.
 */
export function extractSessionState(state: RuntimeState): SessionState {
  return {
    timeState: state.timeState,
    external: state.externalChannels,
    health: state.health,
    continuity: state.continuity,
    continuityConfig: state.continuityConfig,
    tap: state.tap,
  };
}

/**
 * Advance to next frame
 * Cache owns frameId - only increment it there
 */
export function advanceFrame(state: RuntimeState): void {
  state.cache.frameId++;
  // Note: Don't clear caches - stamp-based invalidation handles this
}
