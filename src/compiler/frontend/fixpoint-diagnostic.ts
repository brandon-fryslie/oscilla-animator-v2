/**
 * FixpointDiagnostic — Typed diagnostic from the fixpoint engine.
 *
 * Replaces `unknown[]` throughout the fixpoint pipeline. Every configurable
 * fixpoint diagnostic carries `diagnosticFlagCode` at creation time for
 * severity override lookup.
 *
 * // [LAW:one-source-of-truth] diagnosticFlagCode is the primary key that links
 * a diagnostic to its entry in DIAGNOSTIC_FLAGS.
 * // [LAW:dataflow-not-control-flow] Solvers emit diagnostics unconditionally;
 * severity decides visibility downstream.
 */

import type { DraftPortKey } from './type-facts';
import type { ConstraintOrigin, PUSolveErrorClass } from './payload-unit/solve';

export interface FixpointDiagnostic {
  /** Matches a code in DIAGNOSTIC_FLAGS — primary key for severity overrides */
  readonly diagnosticFlagCode: string;
  /** Human-readable description */
  readonly message: string;
  /** Stable dedup key, computed at emission time (e.g. "ConflictingUnits:rootA:angle:time") */
  readonly stableKey: string;
  /** Single port context (payload-unit errors) */
  readonly port?: DraftPortKey;
  /** Multi-port context (cardinality errors) */
  readonly ports?: readonly DraftPortKey[];
  /** Constraint origins that caused this diagnostic */
  readonly origins?: readonly ConstraintOrigin[];
  /** Error classification (PU solver only) */
  readonly errorClass?: PUSolveErrorClass;
}
