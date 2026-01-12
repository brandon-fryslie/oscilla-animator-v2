/**
 * Diagnostics System Configuration
 *
 * Simple configuration object for diagnostics settings.
 * TODO: Migrate to app-wide settings panel when available.
 * Migration path:
 * 1. Move DiagnosticsConfig interface into app settings
 * 2. Replace DIAGNOSTICS_CONFIG imports with appSettings.diagnostics
 * 3. No other code changes needed
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 */

export interface DiagnosticsConfig {
  // Runtime health monitoring
  runtimeHealthEnabled: boolean;
  healthSnapshotIntervalMs: number; // 5 Hz = 200ms, 2 Hz = 500ms
  nanBatchWindowMs: number; // Aggregate NaN in this window

  // Frame budget thresholds
  frameBudgetThresholdMs: number; // Warn if frame > this value
  targetFPS: number; // 30, 60, 120

  // NaN/Inf detection
  nanDetectionEnabled: boolean;
  infDetectionEnabled: boolean;

  // Bus warnings
  busWarningsEnabled: boolean;
  warnEmptyBuses: boolean; // W_BUS_EMPTY
  warnNoPublishers: boolean; // W_BUS_NO_PUBLISHERS

  // Performance monitoring
  perfMonitoringEnabled: boolean;
  frameBudgetWarningsEnabled: boolean;
}

/**
 * Default diagnostics configuration
 *
 * Users can override these defaults by modifying this object
 * or (later) through app-wide settings panel.
 */
export const DIAGNOSTICS_CONFIG: DiagnosticsConfig = {
  // Runtime health
  runtimeHealthEnabled: true,
  healthSnapshotIntervalMs: 200, // 5 Hz
  nanBatchWindowMs: 100,

  // Frame budget
  frameBudgetThresholdMs: 25, // 25ms for 60 FPS (allows some headroom)
  targetFPS: 60,

  // Detection toggles
  nanDetectionEnabled: true,
  infDetectionEnabled: true,

  // Bus warnings
  busWarningsEnabled: true,
  warnEmptyBuses: true,
  warnNoPublishers: true,

  // Performance
  perfMonitoringEnabled: true,
  frameBudgetWarningsEnabled: true,
};

/**
 * Helper to calculate frame budget threshold based on target FPS
 *
 * Returns frame time threshold with 1.5x headroom to avoid spurious warnings.
 *
 * @param fps - Target frames per second (30, 60, 120)
 * @returns Frame budget in milliseconds
 */
export function getFrameBudgetForFPS(fps: number): number {
  return Math.round((1000 / fps) * 1.5);
}
