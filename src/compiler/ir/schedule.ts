/**
 * Schedule IR Types
 *
 * Time models and schedule types for compiled programs.
 */

// =============================================================================
// Time Model IR
// =============================================================================

/** Finite time model with fixed duration */
export interface TimeModelFinite {
  kind: "finite";
  /** Duration in milliseconds */
  durationMs: number;
}

/** Infinite time model (unbounded) */
export interface TimeModelInfinite {
  kind: "infinite";
  /** Window size hint for exports/sampling */
  windowMs?: number;
  /** Period for phase A in milliseconds (defaults to 4000ms) */
  periodAMs?: number;
  /** Period for phase B in milliseconds (defaults to 8000ms) */
  periodBMs?: number;
}

/** Time model - finite or infinite only */
export type TimeModelIR = TimeModelFinite | TimeModelInfinite;

// =============================================================================
// Schedule Types (re-exported from types.ts)
// =============================================================================

// Schedule step types are defined in types.ts
// This file provides TimeModelIR which is used by the IR builder
