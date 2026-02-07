/**
 * DiagnosticsStore - MobX Wrapper for DiagnosticHub
 *
 * Provides reactive access to diagnostics via MobX computed properties.
 * Wraps DiagnosticHub and exposes its query methods as observables.
 *
 * Architecture:
 * - DiagnosticHub: Core state manager (subscribes to events)
 * - DiagnosticsStore: MobX wrapper (reactive UI layer)
 */

import { makeObservable, computed, action, observable } from 'mobx';
import type { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import type { Diagnostic, DiagnosticFilter } from '../diagnostics/types';

// =============================================================================
// Compilation Stats Types
// =============================================================================

export interface CompilationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  recentMs: number[]; // Last 20 for median calculation
}

// =============================================================================
// Frame Timing Stats Types
// =============================================================================

/**
 * Frame timing statistics for diagnosing animation smoothness issues.
 *
 * Key metrics:
 * - avgDelta: Should be ~16.67ms at 60fps
 * - stdDev: Jitter indicator - should be <1ms for smooth animation
 * - jitterRatio: stdDev/avgDelta as % - >5% may cause visible stutter
 * - droppedFrames: Frames >20ms (missed vsync)
 */
export interface FrameTimingStats {
  avgDelta: number;
  stdDev: number;
  jitterRatio: number;
  droppedFrames: number;
  frameCount: number;
  minDelta: number;
  maxDelta: number;
}

// =============================================================================
// Memory Stats Types (Sprint: memory-instrumentation)
// =============================================================================

/**
 * Memory statistics for diagnosing buffer pool usage and leaks.
 *
 * Key metrics:
 * - poolAllocs: Allocations in last frame (should match releases)
 * - poolReleases: Releases in last frame
 * - pooledBytes: Total bytes in buffer pool
 * - poolKeyCount: Number of distinct buffer sizes
 */
export interface MemoryStats {
  poolAllocs: number;
  poolReleases: number;
  pooledBytes: number;
  poolKeyCount: number;
}

// =============================================================================
// Multi-Window Frame Timing Aggregation
// =============================================================================

/**
 * Range stats for a single metric across a time window.
 */
export interface TimingRangeStats {
  mean: number;
  min: number;
  max: number;
}

/**
 * Aggregated frame timing stats for a single time window.
 */
export interface TimingWindowStats {
  fps: TimingRangeStats;
  msPerFrame: TimingRangeStats;
  jitter: TimingRangeStats;
  dropped: number;
}

/**
 * A labeled time window with its aggregated stats.
 */
export interface TimingWindowEntry {
  label: string;
  stats: TimingWindowStats;
  /** true if enough snapshots exist to fill this window's full duration */
  full: boolean;
}

/** Window configurations: label and snapshot count at 5Hz */
const TIMING_WINDOW_CONFIGS = [
  { label: '1s', snapshots: 5 },
  { label: '10s', snapshots: 50 },
  { label: '1m', snapshots: 300 },
  { label: '5m', snapshots: 1500 },
] as const;

/**
 * Compute aggregated stats from a range of the history array.
 * Uses index range to avoid array allocation.
 */
function computeWindowStatsFromRange(
  history: readonly FrameTimingStats[],
  count: number
): TimingWindowStats {
  const start = Math.max(0, history.length - count);
  const end = history.length;
  const n = end - start;

  if (n === 0) {
    return {
      fps: { mean: 0, min: 0, max: 0 },
      msPerFrame: { mean: 0, min: 0, max: 0 },
      jitter: { mean: 0, min: 0, max: 0 },
      dropped: 0,
    };
  }

  let fpsSum = 0, fpsMin = Infinity, fpsMax = 0;
  let deltaMeanSum = 0, deltaMin = Infinity, deltaMax = 0;
  let jitterSum = 0, jitterMin = Infinity, jitterMax = 0;
  let dropped = 0;
  let counted = 0;

  for (let i = start; i < end; i++) {
    const s = history[i];
    // Skip empty snapshots that may have leaked in
    if (s.avgDelta <= 0 || s.frameCount === 0) continue;

    counted++;
    const fps = 1000 / s.avgDelta;
    fpsSum += fps;
    fpsMin = Math.min(fpsMin, fps);
    fpsMax = Math.max(fpsMax, fps);
    deltaMeanSum += s.avgDelta;
    // Use per-snapshot extremes for absolute min/max frame times
    if (s.minDelta > 0) deltaMin = Math.min(deltaMin, s.minDelta);
    deltaMax = Math.max(deltaMax, s.maxDelta);
    jitterSum += s.stdDev;
    jitterMin = Math.min(jitterMin, s.stdDev);
    jitterMax = Math.max(jitterMax, s.stdDev);
    dropped += s.droppedFrames;
  }

  if (counted === 0) {
    return {
      fps: { mean: 0, min: 0, max: 0 },
      msPerFrame: { mean: 0, min: 0, max: 0 },
      jitter: { mean: 0, min: 0, max: 0 },
      dropped: 0,
    };
  }

  return {
    fps: {
      mean: fpsSum / counted,
      min: fpsMin === Infinity ? 0 : fpsMin,
      max: fpsMax,
    },
    msPerFrame: {
      mean: deltaMeanSum / counted,
      min: deltaMin === Infinity ? 0 : deltaMin,
      max: deltaMax,
    },
    jitter: {
      mean: jitterSum / counted,
      min: jitterMin === Infinity ? 0 : jitterMin,
      max: jitterMax,
    },
    dropped,
  };
}

/** Lifetime accumulator shape */
interface LifetimeTimingAccumulator {
  totalSnapshots: number;
  fpsSum: number;
  fpsMin: number;
  fpsMax: number;
  deltaMeanSum: number;
  deltaMin: number;
  deltaMax: number;
  jitterSum: number;
  jitterMin: number;
  jitterMax: number;
  totalDropped: number;
}

function createLifetimeAccumulator(): LifetimeTimingAccumulator {
  return {
    totalSnapshots: 0,
    fpsSum: 0,
    fpsMin: Infinity,
    fpsMax: 0,
    deltaMeanSum: 0,
    deltaMin: Infinity,
    deltaMax: 0,
    jitterSum: 0,
    jitterMin: Infinity,
    jitterMax: 0,
    totalDropped: 0,
  };
}

// =============================================================================
// Jank Event Types
// =============================================================================

/** Threshold for jank detection (ms). Frames with delta > this are logged. */
export const JANK_THRESHOLD_MS = 500;

/**
 * A captured jank event with timing breakdown.
 *
 * Tells you WHERE the time went:
 * - prevExecMs + prevRenderMs = our code (previous frame's work)
 * - browserGapMs = browser overhead (GC, layout, other scripts)
 */
export interface JankEvent {
  /** Wall clock time string for display */
  wallTime: string;
  /** Time between rAF callbacks (ms) — the total pause duration */
  deltaMs: number;
  /** Previous frame's executeFrame() time (ms) */
  prevExecMs: number;
  /** Previous frame's renderFrame() time (ms) */
  prevRenderMs: number;
  /** Unexplained gap: delta - prevExec - prevRender (ms) — browser/GC overhead */
  browserGapMs: number;
}

// =============================================================================
// Log Types
// =============================================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

// =============================================================================
// DiagnosticsStore Class
// =============================================================================

/**
 * DiagnosticsStore provides reactive access to diagnostics.
 *
 * Usage:
 * ```typescript
 * const store = new DiagnosticsStore(hub);
 *
 * // Reactive access (triggers re-render when diagnostics change)
 * const diagnostics = store.activeDiagnostics;
 * const errors = store.errors;
 *
 * // Filter diagnostics
 * const compileErrors = store.filter({ domain: 'compile', severity: 'error' });
 * ```
 */
export class DiagnosticsStore {
  // =============================================================================
  // Private State
  // =============================================================================

  private hub: DiagnosticHub | null = null;

  // Observable revision counter for MobX reactivity
  // This is incremented via a callback from DiagnosticHub
  private _revision: number = 0;

  // Log entries (capped at MAX_LOGS to prevent unbounded memory growth)
  private static readonly MAX_LOGS = 1000;
  private _logs: LogEntry[] = [];
  private _nextId = 0;

  // Compilation statistics (per-session)
  private _compilationStats: CompilationStats = {
    count: 0,
    totalMs: 0,
    minMs: Infinity,
    maxMs: 0,
    recentMs: [],
  };

  // Frame timing statistics (updated at 5Hz from HealthMonitor)
  private _frameTiming: FrameTimingStats = {
    avgDelta: 0,
    stdDev: 0,
    jitterRatio: 0,
    droppedFrames: 0,
    frameCount: 0,
    minDelta: 0,
    maxDelta: 0,
  };

  // Historical frame timing snapshots (5Hz, up to 5 minutes)
  private _frameTimingHistory: FrameTimingStats[] = [];
  private static readonly MAX_TIMING_HISTORY = 1500;

  // Lifetime accumulator (never resets, survives history eviction)
  private _lifetimeStats: LifetimeTimingAccumulator = createLifetimeAccumulator();

  // Jank event log (bounded, most recent events)
  private static readonly MAX_JANK_EVENTS = 50;
  private _jankLog: JankEvent[] = [];

  // Memory statistics (Sprint: memory-instrumentation)
  private _memoryStats: MemoryStats = {
    poolAllocs: 0,
    poolReleases: 0,
    pooledBytes: 0,
    poolKeyCount: 0,
  };

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(hub?: DiagnosticHub) {
    this.hub = hub || null;

    makeObservable<
      DiagnosticsStore,
      '_revision' | '_logs' | '_compilationStats' | '_frameTiming' | '_frameTimingHistory' | '_lifetimeStats' | '_jankLog' | '_memoryStats' | 'incrementRevision'
    >(this, {
      // Observable revision counter
      _revision: observable,
      incrementRevision: action,

      // DiagnosticHub API
      revision: computed,
      activeDiagnostics: computed,
      errorCount: computed,
      warningCount: computed,
      hasErrors: computed,

      // Log API
      _logs: observable,
      logs: computed,
      log: action,
      clearLogs: action,

      // Compilation Stats API
      _compilationStats: observable,
      compilationStats: computed,
      avgCompileMs: computed,
      medianCompileMs: computed,
      lastCompileMs: computed,
      recordCompilation: action,

      // Frame Timing API
      _frameTiming: observable,
      _frameTimingHistory: observable,
      _lifetimeStats: observable,
      frameTiming: computed,
      frameTimingHistory: computed,
      frameTimingWindows: computed,
      updateFrameTiming: action,

      // Jank Log API
      _jankLog: observable,
      jankLog: computed,
      recordJank: action,

      // Memory Stats API (Sprint: memory-instrumentation)
      _memoryStats: observable,
      memoryStats: computed,
      updateMemoryStats: action,
    });
  }

  /**
   * Increments the revision counter.
   * Called by DiagnosticHub when diagnostics change.
   */
  incrementRevision(): void {
    this._revision++;
  }

  // =============================================================================
  // New API (DiagnosticHub Integration)
  // =============================================================================

  /**
   * Diagnostics revision number.
   * Increments whenever the diagnostic set changes.
   * MobX tracks this to trigger UI updates.
   */
  get revision(): number {
    return this._revision;
  }

  /**
   * Returns all active diagnostics.
   * Active = union of compile + authoring + runtime for active revision.
   */
  get activeDiagnostics(): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision to trigger updates
    this.revision;
    return this.hub.getActive();
  }

  /**
   * Returns diagnostics for a specific patch revision.
   */
  getByRevision(patchRevision: number): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getByRevision(patchRevision);
  }

  /**
   * Returns compile diagnostics for a specific revision.
   */
  getCompileSnapshot(patchRevision: number): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getCompileSnapshot(patchRevision);
  }

  /**
   * Returns diagnostics for a specific block (reactive).
   * Includes errors on the block itself and its ports.
   */
  getDiagnosticsForBlock(blockId: string): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision for reactivity
    this.revision;
    return this.hub.getDiagnosticsForBlock(blockId);
  }

  /**
   * Returns diagnostics for a specific edge (reactive).
   * Checks diagnostics on source and target ports.
   */
  getDiagnosticsForEdge(edge: { from: { blockId: string; slotId: string }; to: { blockId: string; slotId: string } }): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision for reactivity
    this.revision;
    return this.hub.getDiagnosticsForEdge(edge);
  }

  /**
   * Returns diagnostics for a specific port (reactive).
   */
  getDiagnosticsForPort(blockId: string, portId: string): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision for reactivity
    this.revision;
    return this.hub.getDiagnosticsForPort(blockId, portId);
  }

  /**
   * Returns authoring diagnostics (current).
   */
  getAuthoringSnapshot(): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getAuthoringSnapshot();
  }

  /**
   * Returns runtime diagnostics (current session).
   */
  getRuntimeDiagnostics(): Diagnostic[] {
    if (!this.hub) return [];
    return this.hub.getRuntimeDiagnostics();
  }

  /**
   * Filters diagnostics by criteria.
   */
  filter(filter: DiagnosticFilter): Diagnostic[] {
    if (!this.hub) return [];
    // Force dependency on revision to trigger updates
    this.revision;
    const active = this.hub.getActive();
    return this.hub.filter(active, filter);
  }

  /**
   * Returns all errors (severity: 'error' or 'fatal').
   */
  get errors(): Diagnostic[] {
    return this.filter({ severity: ['error', 'fatal'] });
  }

  /**
   * Returns all warnings (severity: 'warn').
   */
  get warnings(): Diagnostic[] {
    return this.filter({ severity: ['warn'] });
  }

  /**
   * Returns number of errors.
   */
  get errorCount(): number {
    return this.errors.length;
  }

  /**
   * Returns number of warnings.
   */
  get warningCount(): number {
    return this.warnings.length;
  }

  /**
   * Returns true if there are any errors.
   */
  get hasErrors(): boolean {
    return this.errorCount > 0;
  }

  // =============================================================================
  // Log API
  // =============================================================================

  /**
   * Log entries.
   */
  get logs(): readonly LogEntry[] {
    return this._logs;
  }

  /**
   * Adds a log entry.
   * Logs are capped at MAX_LOGS entries (FIFO eviction).
   */
  log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    this._logs.push({
      ...entry,
      id: `log-${this._nextId++}`,
      timestamp: Date.now(),
    });

    // Cap log size to prevent unbounded memory growth
    if (this._logs.length > DiagnosticsStore.MAX_LOGS) {
      this._logs.shift();
    }
  }

  /**
   * Clears log entries.
   */
  clearLogs(): void {
    this._logs = [];
  }

  // =============================================================================
  // Compilation Stats API
  // =============================================================================

  /**
   * Returns current compilation statistics.
   */
  get compilationStats(): CompilationStats {
    return this._compilationStats;
  }

  /**
   * Returns average compilation time in milliseconds.
   * Returns 0 if no compilations recorded.
   */
  get avgCompileMs(): number {
    if (this._compilationStats.count === 0) return 0;
    return this._compilationStats.totalMs / this._compilationStats.count;
  }

  /**
   * Returns median compilation time in milliseconds.
   * Uses the recent compilations (last 20) for calculation.
   * Returns 0 if no compilations recorded.
   */
  get medianCompileMs(): number {
    const recent = this._compilationStats.recentMs;
    if (recent.length === 0) return 0;

    const sorted = [...recent].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Returns the most recent compilation time in milliseconds.
   * Returns 0 if no compilations recorded.
   */
  get lastCompileMs(): number {
    const recent = this._compilationStats.recentMs;
    return recent.length > 0 ? recent[recent.length - 1] : 0;
  }

  /**
   * Records a compilation duration.
   * Called when a CompileEnd event is received with status 'success'.
   *
   * @param durationMs - The compilation duration in milliseconds
   */
  recordCompilation(durationMs: number): void {
    this._compilationStats.count++;
    this._compilationStats.totalMs += durationMs;
    this._compilationStats.minMs = Math.min(this._compilationStats.minMs, durationMs);
    this._compilationStats.maxMs = Math.max(this._compilationStats.maxMs, durationMs);

    // Keep last 20 for median calculation
    this._compilationStats.recentMs.push(durationMs);
    if (this._compilationStats.recentMs.length > 20) {
      this._compilationStats.recentMs.shift();
    }
  }

  // =============================================================================
  // Frame Timing API
  // =============================================================================

  /**
   * Returns current frame timing statistics.
   */
  get frameTiming(): FrameTimingStats {
    return this._frameTiming;
  }

  /**
   * Returns historical frame timing for trend analysis.
   * Last 30 snapshots (~6 seconds at 5Hz).
   */
  get frameTimingHistory(): readonly FrameTimingStats[] {
    return this._frameTimingHistory;
  }

  /**
   * Updates frame timing statistics.
   * Called by the animation loop at snapshot intervals (5Hz).
   */
  updateFrameTiming(stats: FrameTimingStats): void {
    this._frameTiming = stats;

    // Skip empty snapshots — no real frame data to aggregate
    if (stats.frameCount === 0 || stats.avgDelta <= 0) return;

    // Add to history (ring buffer via shift)
    this._frameTimingHistory.push(stats);
    if (this._frameTimingHistory.length > DiagnosticsStore.MAX_TIMING_HISTORY) {
      this._frameTimingHistory.shift();
    }

    // Update lifetime accumulator
    const fps = 1000 / stats.avgDelta;
    const life = this._lifetimeStats;
    life.totalSnapshots++;
    life.fpsSum += fps;
    life.fpsMin = Math.min(life.fpsMin, fps);
    life.fpsMax = Math.max(life.fpsMax, fps);
    life.deltaMeanSum += stats.avgDelta;
    life.deltaMin = Math.min(life.deltaMin, stats.minDelta);
    life.deltaMax = Math.max(life.deltaMax, stats.maxDelta);
    life.jitterSum += stats.stdDev;
    life.jitterMin = Math.min(life.jitterMin, stats.stdDev);
    life.jitterMax = Math.max(life.jitterMax, stats.stdDev);
    life.totalDropped += stats.droppedFrames;
  }

  /**
   * Multi-window frame timing aggregation.
   *
   * Returns stats for 1s, 10s, 1m, 5m, and lifetime windows.
   * Each window shows mean/min/max for fps, ms/frame, jitter, plus total dropped.
   *
   * - fps min/max: per-snapshot fps extremes (reveals sustained slow periods)
   * - msPerFrame min/max: absolute individual frame extremes (reveals jank spikes)
   * - jitter min/max: per-snapshot stdDev extremes
   * - dropped: total count across the window
   */
  get frameTimingWindows(): TimingWindowEntry[] {
    const history = this._frameTimingHistory;
    const life = this._lifetimeStats;

    const entries: TimingWindowEntry[] = TIMING_WINDOW_CONFIGS.map(config => {
      const available = history.length;
      if (available === 0) {
        return {
          label: config.label,
          stats: {
            fps: { mean: 0, min: 0, max: 0 },
            msPerFrame: { mean: 0, min: 0, max: 0 },
            jitter: { mean: 0, min: 0, max: 0 },
            dropped: 0,
          },
          full: false,
        };
      }

      return {
        label: config.label,
        stats: computeWindowStatsFromRange(history, config.snapshots),
        full: available >= config.snapshots,
      };
    });

    // Lifetime window from accumulator
    if (life.totalSnapshots > 0) {
      const n = life.totalSnapshots;
      entries.push({
        label: 'life',
        stats: {
          fps: {
            mean: life.fpsSum / n,
            min: life.fpsMin === Infinity ? 0 : life.fpsMin,
            max: life.fpsMax,
          },
          msPerFrame: {
            mean: life.deltaMeanSum / n,
            min: life.deltaMin === Infinity ? 0 : life.deltaMin,
            max: life.deltaMax,
          },
          jitter: {
            mean: life.jitterSum / n,
            min: life.jitterMin === Infinity ? 0 : life.jitterMin,
            max: life.jitterMax,
          },
          dropped: life.totalDropped,
        },
        full: true,
      });
    }

    return entries;
  }

  // =============================================================================
  // Jank Log API
  // =============================================================================

  /**
   * Recent jank events with timing breakdown.
   * Each event tells you where the time went: our code vs browser overhead.
   */
  get jankLog(): readonly JankEvent[] {
    return this._jankLog;
  }

  /**
   * Record a jank event.
   * Called by the animation loop when frame delta exceeds JANK_THRESHOLD_MS.
   */
  recordJank(event: JankEvent): void {
    this._jankLog.push(event);
    if (this._jankLog.length > DiagnosticsStore.MAX_JANK_EVENTS) {
      this._jankLog.shift();
    }
  }

  // =============================================================================
  // Memory Stats API (Sprint: memory-instrumentation)
  // =============================================================================

  /**
   * Returns current memory statistics.
   */
  get memoryStats(): MemoryStats {
    return this._memoryStats;
  }

  /**
   * Updates memory statistics.
   * Called by the animation loop at snapshot intervals (5Hz).
   */
  updateMemoryStats(stats: MemoryStats): void {
    this._memoryStats = stats;
  }
}
