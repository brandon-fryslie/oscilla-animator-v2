/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 * Simplified for v2 - no hot-swap complexity initially.
 */

import type { ValueSlot } from '../types';
import type { EffectiveTime, TimeState } from './timeResolution';
import { createTimeState } from './timeResolution';
import type { ContinuityState } from './ContinuityState';
import { createContinuityState } from './ContinuityState';
import type { DebugTap } from './DebugTap';
import { ExternalChannelSystem } from './ExternalChannel';

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
 * Stores evaluated signal values by slot ID.
 * Uses typed arrays for performance, Map for complex types.
 */
export interface ValueStore {
  /** Numeric values (most signals) */
  f64: Float64Array;

  /** Object values (colors, complex types) */
  objects: Map<ValueSlot, unknown>;

  /**
   * Packed shape2d values (8 x u32 words per shape)
   *
   * Layout: [shape0_word0..shape0_word7, shape1_word0..shape1_word7, ...]
   * Access: shape2d[offset * SHAPE2D_WORDS + Shape2DWord.TopologyId]
   */
  shape2d: Uint32Array;
}

/**
 * Create a ValueStore with the given slot count
 *
 * @param slotCount - Total number of slots for f64 storage
 * @param shape2dSlotCount - Number of shape2d slots (defaults to 0)
 */
export function createValueStore(slotCount: number, shape2dSlotCount: number = 0): ValueStore {
  return {
    f64: new Float64Array(slotCount),
    objects: new Map(),
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

  /** Cached signal values (indexed by SigExprId) */
  sigValues: Float64Array;

  /** Frame stamps for signal cache validation */
  sigStamps: Uint32Array;

  /** Cached field buffers (nested Map: fieldId -> instanceId -> buffer) */
  fieldBuffers: Map<number, Map<number, ArrayBufferView>>;

  /** Frame stamps for field cache validation (nested Map: fieldId -> instanceId -> stamp) */
  fieldStamps: Map<number, Map<number, number>>;
}

/**
 * Create a FrameCache
 */
export function createFrameCache(
  maxSigExprs: number = 1000,
  maxFieldExprs: number = 1000
): FrameCache {
  return {
    frameId: 1, // Start at 1 so initial sigStamps[n]=0 don't match
    sigValues: new Float64Array(maxSigExprs),
    sigStamps: new Uint32Array(maxSigExprs),
    fieldBuffers: new Map(),
    fieldStamps: new Map(),
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

  /** Blocks with heavy materialization overhead */
  heavyMaterializationBlocks: Map<string, number>;

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
    heavyMaterializationBlocks: new Map(),
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

  /** Frame cache (per-frame memoization) - cache owns frameId */
  cache: FrameCache;

  /** Current effective time (set each frame) */
  time: EffectiveTime | null;

  /** Stateful primitive state (migrated via StableStateIds on hot-swap) */
  state: Float64Array;

  /** Event scalar storage (0=not fired, 1=fired this tick). Cleared each frame. */
  eventScalars: Uint8Array;

  /** Previous predicate values for wrap edge detection (indexed by EventExprId). */
  eventPrevPredicate: Uint8Array;

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

  /** Frame cache (per-frame memoization) - cache owns frameId */
  cache: FrameCache;

  /** Current effective time (set each frame) */
  time: EffectiveTime | null;

  /** Stateful primitive state (migrated via StableStateIds on hot-swap) */
  state: Float64Array;

  /** Event scalar storage (0=not fired, 1=fired this tick). Cleared each frame. */
  eventScalars: Uint8Array;

  /** Previous predicate values for wrap edge detection (indexed by EventExprId). */
  eventPrevPredicate: Uint8Array;

  /**
   * Event payload storage (spec-compliant data-carrying events)
   *
   * Maps event slot ID to array of EventPayload occurrences this tick.
   * Cleared each frame alongside eventScalars (spec §6.1 / Invariant I4).
   */
  events: Map<number, EventPayload[]>;

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
  slotCount: number,
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0
): ProgramState {
  return {
    values: createValueStore(slotCount),
    cache: createFrameCache(),
    time: null,
    state: new Float64Array(stateSlotCount),
    eventScalars: new Uint8Array(eventSlotCount),
    eventPrevPredicate: new Uint8Array(eventExprCount),
    events: new Map(),
  };
}

/**
 * Create a RuntimeState by composing SessionState and ProgramState
 *
 * Convenience wrapper for tests and simple use cases.
 * For production code with session persistence, use createSessionState() + createProgramState() separately.
 */
export function createRuntimeState(
  slotCount: number,
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0
): RuntimeState {
  const session = createSessionState();
  const program = createProgramState(slotCount, stateSlotCount, eventSlotCount, eventExprCount);
  return {
    // ProgramState
    values: program.values,
    cache: program.cache,
    time: program.time,
    state: program.state,
    eventScalars: program.eventScalars,
    eventPrevPredicate: program.eventPrevPredicate,
    events: program.events,
    // SessionState
    timeState: session.timeState,
    externalChannels: session.external,
    health: session.health,
    continuity: session.continuity,
    continuityConfig: session.continuityConfig,
  };
}

/**
 * Create a RuntimeState from existing SessionState and new ProgramState
 *
 * Used during hot-swap to preserve session state while replacing program state.
 */
export function createRuntimeStateFromSession(
  session: SessionState,
  slotCount: number,
  stateSlotCount: number = 0,
  eventSlotCount: number = 0,
  eventExprCount: number = 0
): RuntimeState {
  const program = createProgramState(slotCount, stateSlotCount, eventSlotCount, eventExprCount);
  return {
    // ProgramState (fresh)
    values: program.values,
    cache: program.cache,
    time: program.time,
    state: program.state,
    eventScalars: program.eventScalars,
    eventPrevPredicate: program.eventPrevPredicate,
    events: program.events,
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
