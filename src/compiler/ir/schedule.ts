/**
 * Schedule IR Types
 *
 * Time models and schedule types for compiled programs.
 */

// =============================================================================
// Time Model IR
// =============================================================================

/** Canonical runtime time model (single model only). */
export interface TimeModelIR {
  /** Period for phase A in milliseconds */
  periodAMs: number;
  /** Period for phase B in milliseconds */
  periodBMs: number;
}

// =============================================================================
// Schedule Types (re-exported from types.ts)
// =============================================================================

// Schedule step types are defined in types.ts
// This file provides TimeModelIR which is used by the IR builder
