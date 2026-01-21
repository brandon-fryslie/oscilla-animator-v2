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
 * ValueStore - Slot-based value storage
 *
 * Stores evaluated signal values by slot ID.
 * Uses Float64Array for numeric values, Map for objects.
 */
export interface ValueStore {
  /** Numeric values (most signals) */
  f64: Float64Array;

  /** Object values (colors, complex types) */
  objects: Map<ValueSlot, unknown>;
}

/**
 * Create a ValueStore with the given slot count
 */
export function createValueStore(slotCount: number): ValueStore {
  return {
    f64: new Float64Array(slotCount),
    objects: new Map(),
  };
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
