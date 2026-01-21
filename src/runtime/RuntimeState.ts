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
 */
export interface FrameCache {
  /** Current frame ID (monotonic, starts at 0) */
  frameId: number;

  /** Cached signal values (indexed by SigExprId) */
  sigValues: Float64Array;

  /** Frame stamps for signal cache validation */
  sigStamps: Uint32Array;

  /** Cached field buffers (indexed by FieldExprId:InstanceId key) */
  fieldBuffers: Map<string, ArrayBufferView>;

  /** Frame stamps for field cache validation */
  fieldStamps: Map<string, number>;
}

/**
 * Create a FrameCache
 */
export function createFrameCache(
  maxSigExprs: number = 1000,
  maxFieldExprs: number = 1000
): FrameCache {
  return {
    frameId: 0,
    sigValues: new Float64Array(maxSigExprs),
    sigStamps: new Uint32Array(maxSigExprs),
    fieldBuffers: new Map(),
    fieldStamps: new Map(),
  };
}

/**
 * ExternalInputs - Values fed into the runtime from outside (mouse, MIDI, etc.)
 */
export interface ExternalInputs {
  /** Mouse X position (0..1, normalized to canvas) - RAW target */
  mouseX: number;

  /** Mouse Y position (0..1, normalized to canvas) - RAW target */
  mouseY: number;

  /** Whether mouse is over the canvas */
  mouseOver: boolean;

  /** Smoothed X position that follows mouseX */
  smoothX: number;

  /** Smoothed Y position that follows mouseY */
  smoothY: number;
}

/**
 * Create default external inputs
 */
export function createExternalInputs(): ExternalInputs {
  return {
    mouseX: 0.5,
    mouseY: 0.5,
    mouseOver: false,
    smoothX: 0.5,
    smoothY: 0.5,
  };
}

/**
 * Update smooth following - call once per frame
 * @param ext External inputs to update
 * @param lerpFactor How fast to follow (0.02 = slow, 0.1 = fast)
 */
export function updateSmoothing(ext: ExternalInputs, lerpFactor: number = 0.05): void {
  ext.smoothX += (ext.mouseX - ext.smoothX) * lerpFactor;
  ext.smoothY += (ext.mouseY - ext.smoothY) * lerpFactor;
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

/**
 * RuntimeState - Complete frame execution state
 */
export interface RuntimeState {
  /** Per-frame value storage (slot-based) */
  values: ValueStore;

  /** Frame cache (per-frame memoization) - cache owns frameId */
  cache: FrameCache;

  /** Time state for wrap detection (persistent across frames) */
  timeState: TimeState;

  /** Current effective time (set each frame) */
  time: EffectiveTime | null;

  /** External inputs (mouse, MIDI, etc.) */
  external: ExternalInputs;

  /** Persistent state array (survives across frames) */
  state: Float64Array;

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
 * Create a RuntimeState
 */
export function createRuntimeState(slotCount: number, stateSlotCount: number = 0): RuntimeState {
  return {
    values: createValueStore(slotCount),
    cache: createFrameCache(),
    timeState: createTimeState(),
    time: null,
    external: createExternalInputs(),
    state: new Float64Array(stateSlotCount),
    health: createHealthMetrics(),
    continuity: createContinuityState(),
    continuityConfig: createContinuityConfig(),
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
