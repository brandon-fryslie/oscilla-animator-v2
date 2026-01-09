/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 * Simplified for v2 - no hot-swap complexity initially.
 */

import type { ValueSlot } from '../types';
import type { EffectiveTime, TimeState } from './timeResolution';
import { createTimeState } from './timeResolution';

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

  /** Cached field buffers (indexed by FieldExprId:DomainId key) */
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
}

/**
 * Create a RuntimeState
 */
export function createRuntimeState(slotCount: number): RuntimeState {
  return {
    values: createValueStore(slotCount),
    cache: createFrameCache(),
    timeState: createTimeState(),
    time: null,
    external: createExternalInputs(),
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
