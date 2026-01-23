/**
 * Runtime Health Monitor
 *
 * Aggregates runtime metrics and generates diagnostics for the DiagnosticsSystem.
 * Emits RuntimeHealthSnapshot events at throttled intervals (5 Hz max).
 *
 * Key features:
 * - Batched NaN/Inf detection (100ms windows)
 * - Frame timing ring buffer (last 10 frames)
 * - Throttled snapshot emission (200ms interval)
 * - Configurable thresholds via DIAGNOSTICS_CONFIG
 *
 * Performance: <1% frame budget overhead
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 */

import type { RuntimeState } from './RuntimeState';
import type { EventHub } from '../events/EventHub';
import { createDiagnostic } from '../diagnostics/types';
import { generateDiagnosticId } from '../diagnostics/diagnosticId';
import { DIAGNOSTICS_CONFIG } from '../diagnostics/config';

// =============================================================================
// Frame Time Recording
// =============================================================================

/**
 * Record frame time in ring buffer
 *
 * Maintains a sliding window of the last 10 frame times for avg/worst calculations.
 * Uses ring buffer to avoid array allocations.
 *
 * @param state - Runtime state with health metrics
 * @param frameTimeMs - Frame execution time in milliseconds
 */
export function recordFrameTime(state: RuntimeState, frameTimeMs: number): void {
  const h = state.health;

  // Write to ring buffer
  h.frameTimes[h.frameTimesIndex] = frameTimeMs;
  h.frameTimesIndex = (h.frameTimesIndex + 1) % h.frameTimes.length;
}

/**
 * Record frame delta (time between rAF callbacks)
 *
 * This is the key metric for detecting timing jitter that causes wagon wheel effects.
 * At 60fps, ideal delta is 16.67ms. Variance indicates timing instability.
 *
 * @param state - Runtime state with health metrics
 * @param rafTimestamp - The timestamp from requestAnimationFrame callback
 */
export function recordFrameDelta(state: RuntimeState, rafTimestamp: number): void {
  const h = state.health;

  if (h.prevRafTimestamp !== null) {
    const delta = rafTimestamp - h.prevRafTimestamp;

    // Write to ring buffer (last 60 frames for ~1 second of history)
    h.frameDeltas[h.frameDeltasIndex] = delta;
    h.frameDeltasIndex = (h.frameDeltasIndex + 1) % h.frameDeltas.length;

    // Accumulate stats for snapshot window
    h.frameCountInWindow++;
    h.frameDeltaSum += delta;
    h.frameDeltaSumSq += delta * delta;
    h.minFrameDelta = Math.min(h.minFrameDelta, delta);
    h.maxFrameDelta = Math.max(h.maxFrameDelta, delta);

    // Count dropped frames (> 20ms suggests missed vsync at 60Hz)
    if (delta > 20) {
      h.droppedFrameCount++;
    }
  }

  h.prevRafTimestamp = rafTimestamp;
}

/**
 * Compute frame timing statistics from current snapshot window
 *
 * Returns statistics useful for diagnosing timing issues:
 * - avgDelta: Mean frame delta (should be ~16.67ms at 60fps)
 * - stdDev: Standard deviation (jitter indicator, should be <1ms ideally)
 * - jitterRatio: stdDev/avgDelta as percentage (>5% may cause visible stutter)
 * - droppedFrames: Count of frames >20ms
 * - minDelta/maxDelta: Range of deltas
 */
export function computeFrameTimingStats(state: RuntimeState): FrameTimingStats {
  const h = state.health;

  if (h.frameCountInWindow === 0) {
    return {
      avgDelta: 0,
      stdDev: 0,
      jitterRatio: 0,
      droppedFrames: 0,
      frameCount: 0,
      minDelta: 0,
      maxDelta: 0,
    };
  }

  const n = h.frameCountInWindow;
  const avgDelta = h.frameDeltaSum / n;

  // Variance = E[X²] - E[X]²
  const variance = h.frameDeltaSumSq / n - avgDelta * avgDelta;
  const stdDev = Math.sqrt(Math.max(0, variance));

  // Jitter ratio as percentage of average delta
  const jitterRatio = avgDelta > 0 ? (stdDev / avgDelta) * 100 : 0;

  return {
    avgDelta,
    stdDev,
    jitterRatio,
    droppedFrames: h.droppedFrameCount,
    frameCount: n,
    minDelta: h.minFrameDelta === Infinity ? 0 : h.minFrameDelta,
    maxDelta: h.maxFrameDelta,
  };
}

/**
 * Reset frame timing stats for next snapshot window
 */
export function resetFrameTimingStats(state: RuntimeState): void {
  const h = state.health;
  h.droppedFrameCount = 0;
  h.frameCountInWindow = 0;
  h.frameDeltaSum = 0;
  h.frameDeltaSumSq = 0;
  h.minFrameDelta = Infinity;
  h.maxFrameDelta = 0;
}

/**
 * Frame timing statistics
 */
export interface FrameTimingStats {
  /** Average frame delta in ms */
  avgDelta: number;
  /** Standard deviation of frame deltas in ms */
  stdDev: number;
  /** Jitter ratio: stdDev/avgDelta as percentage */
  jitterRatio: number;
  /** Count of dropped frames (delta > 20ms) */
  droppedFrames: number;
  /** Total frame count in window */
  frameCount: number;
  /** Minimum frame delta in window */
  minDelta: number;
  /** Maximum frame delta in window */
  maxDelta: number;
}

// =============================================================================
// NaN/Inf Detection (Batched)
// =============================================================================

/**
 * Record NaN detection (batched in 100ms windows)
 *
 * Multiple NaN occurrences within a batch window count as a single occurrence.
 * This prevents diagnostic spam for repeated NaN (e.g., 600/sec at 60fps).
 *
 * Batching strategy:
 * 1. Track nanBatchCount (occurrences in current batch)
 * 2. When batch window expires (100ms), commit batch: nanCount++
 * 3. Reset nanBatchCount = 0 for next batch
 *
 * @param state - Runtime state with health metrics
 * @param blockId - Block ID that produced NaN (for diagnostic target) - optional
 */
export function recordNaN(state: RuntimeState, blockId?: string | null): void {
  if (!DIAGNOSTICS_CONFIG.nanDetectionEnabled) return;

  const now = performance.now();
  const h = state.health;

  // Check if batch window expired
  if (now - h.samplingBatchStart > DIAGNOSTICS_CONFIG.nanBatchWindowMs) {
    // Commit previous batch if it had occurrences
    if (h.nanBatchCount > 0) {
      h.nanCount++;
    }
    // Start new batch
    h.nanBatchCount = 0;
    h.samplingBatchStart = now;
  }

  // Increment batch count and record block ID
  h.nanBatchCount++;
  if (blockId) {
    h.lastNanBlockId = blockId;
  }
}

/**
 * Record Infinity detection (batched in 100ms windows)
 *
 * Same batching strategy as NaN detection.
 *
 * @param state - Runtime state with health metrics
 * @param blockId - Block ID that produced Infinity (for diagnostic target) - optional
 */
export function recordInfinity(state: RuntimeState, blockId?: string | null): void {
  if (!DIAGNOSTICS_CONFIG.infDetectionEnabled) return;

  const now = performance.now();
  const h = state.health;

  // Check if batch window expired
  if (now - h.samplingBatchStart > DIAGNOSTICS_CONFIG.nanBatchWindowMs) {
    // Commit previous batch if it had occurrences
    if (h.infBatchCount > 0) {
      h.infCount++;
    }
    // Start new batch
    h.infBatchCount = 0;
    h.samplingBatchStart = now;
  }

  // Increment batch count and record block ID
  h.infBatchCount++;
  if (blockId) {
    h.lastInfBlockId = blockId;
  }
}

// =============================================================================
// Snapshot Emission
// =============================================================================

/**
 * Check if health snapshot should be emitted
 *
 * Throttles to 5 Hz (200ms interval) to avoid overwhelming event system.
 * Reads interval from DIAGNOSTICS_CONFIG.
 *
 * @param state - Runtime state with health metrics
 * @returns True if snapshot should be emitted
 */
export function shouldEmitSnapshot(state: RuntimeState): boolean {
  if (!DIAGNOSTICS_CONFIG.runtimeHealthEnabled) return false;

  const now = performance.now();
  const interval = DIAGNOSTICS_CONFIG.healthSnapshotIntervalMs;
  return now - state.health.lastSnapshotTime >= interval;
}

/**
 * Generate and emit RuntimeHealthSnapshot event
 *
 * Calculates frame metrics, generates diagnostics for NaN/Inf/frame budget,
 * and emits RuntimeHealthSnapshot event with diagnosticsDelta.
 *
 * Resets health counters after emission.
 *
 * @param state - Runtime state with health metrics
 * @param events - Event hub for emission
 * @param patchId - Current patch ID
 * @param activePatchRevision - Current patch revision
 * @param tMs - Current time in milliseconds
 */
export function emitHealthSnapshot(
  state: RuntimeState,
  events: EventHub,
  patchId: string,
  activePatchRevision: number,
  tMs: number
): void {
  const h = state.health;
  const config = DIAGNOSTICS_CONFIG;

  // Calculate frame metrics from ring buffer
  const validFrames = h.frameTimes.filter((t) => t > 0);
  const avgFrameMs = validFrames.length > 0 ? validFrames.reduce((a, b) => a + b, 0) / validFrames.length : 0;
  const worstFrameMs = validFrames.length > 0 ? Math.max(...validFrames) : 0;
  const fpsEstimate = avgFrameMs > 0 ? Math.round(1000 / avgFrameMs) : 0;

  // Generate diagnostics array
  const raised = [];

  // P_NAN_DETECTED (only if enabled and NaN occurred)
  // Note: Block ID tracking not yet implemented in IR - using graphSpan for now
  if (config.nanDetectionEnabled && h.nanCount > 0) {
    const target = h.lastNanBlockId
      ? { kind: 'block' as const, blockId: h.lastNanBlockId }
      : { kind: 'graphSpan' as const, blockIds: [] };

    const diag = createDiagnostic({
      code: 'P_NAN_DETECTED',
      severity: 'warn',
      domain: 'perf',
      primaryTarget: target,
      title: 'NaN value detected',
      message: `Signal produced NaN during evaluation (${h.nanCount} batch(es) detected in last snapshot window)`,
      scope: { patchRevision: activePatchRevision },
    });
    // Generate stable ID using the helper
    const id = generateDiagnosticId(diag.code, diag.primaryTarget, activePatchRevision);
    raised.push({ ...diag, id });
  }

  // P_INFINITY_DETECTED (only if enabled and Inf occurred)
  if (config.infDetectionEnabled && h.infCount > 0) {
    const target = h.lastInfBlockId
      ? { kind: 'block' as const, blockId: h.lastInfBlockId }
      : { kind: 'graphSpan' as const, blockIds: [] };

    const diag = createDiagnostic({
      code: 'P_INFINITY_DETECTED',
      severity: 'warn',
      domain: 'perf',
      primaryTarget: target,
      title: 'Infinity value detected',
      message: `Signal produced Infinity during evaluation (${h.infCount} batch(es) detected in last snapshot window)`,
      scope: { patchRevision: activePatchRevision },
    });
    const id = generateDiagnosticId(diag.code, diag.primaryTarget, activePatchRevision);
    raised.push({ ...diag, id });
  }

  // P_FRAME_BUDGET_EXCEEDED (only if enabled and threshold exceeded)
  if (config.frameBudgetWarningsEnabled && worstFrameMs > config.frameBudgetThresholdMs) {
    const diag = createDiagnostic({
      code: 'P_FRAME_BUDGET_EXCEEDED',
      severity: 'warn',
      domain: 'perf',
      primaryTarget: { kind: 'graphSpan', blockIds: [] },
      title: 'Frame budget exceeded',
      message: `Frame took ${worstFrameMs.toFixed(1)}ms (threshold: ${config.frameBudgetThresholdMs}ms, target: ${config.targetFPS} FPS)`,
      scope: { patchRevision: activePatchRevision },
    });
    const id = generateDiagnosticId(diag.code, diag.primaryTarget, activePatchRevision);
    raised.push({ ...diag, id });
  }

  // Calculate assembler stats from ring buffers
  const validGrouping = h.assemblerGroupingMs.filter((t) => t > 0);
  const validSlicing = h.assemblerSlicingMs.filter((t) => t > 0);
  const validTotal = h.assemblerTotalMs.filter((t) => t > 0);
  const assemblerStats = validTotal.length > 0 ? {
    avgGroupingMs: validGrouping.length > 0 ? validGrouping.reduce((a, b) => a + b, 0) / validGrouping.length : 0,
    avgSlicingMs: validSlicing.length > 0 ? validSlicing.reduce((a, b) => a + b, 0) / validSlicing.length : 0,
    avgTotalMs: validTotal.reduce((a, b) => a + b, 0) / validTotal.length,
    cacheHits: h.topologyGroupCacheHits,
    cacheMisses: h.topologyGroupCacheMisses,
  } : undefined;

  // Emit RuntimeHealthSnapshot event
  events.emit({
    type: 'RuntimeHealthSnapshot',
    patchId,
    activePatchRevision,
    tMs,
    frameBudget: {
      fpsEstimate,
      avgFrameMs,
      worstFrameMs: worstFrameMs > 0 ? worstFrameMs : undefined,
    },
    evalStats: {
      fieldMaterializations: h.materializationCount,
      nanCount: h.nanCount,
      infCount: h.infCount,
    },
    assemblerStats,
    diagnosticsDelta: raised.length > 0 ? { raised, resolved: [] } : undefined,
  });

  // Reset counters after snapshot
  h.nanCount = 0;
  h.infCount = 0;
  h.lastNanBlockId = null;
  h.lastInfBlockId = null;
  h.materializationCount = 0;
  h.lastSnapshotTime = performance.now();
}
