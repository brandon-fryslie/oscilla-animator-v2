/**
 * src/pillars/types/solve/shared.ts
 *
 * Cross-cutting vocabulary the two pure sub-solvers share but neither owns:
 * the opaque port identity, the provenance an emitted error/diagnostic points
 * back to, and the diagnostic record itself. Defined once here so payload/unit
 * and cardinality reference one `ConstraintOrigin` rather than two that drift.
 * [LAW:one-source-of-truth]
 *
 * This module imports nothing from the schema layer — these are solver-machinery
 * types, not type-algebra. The solvers compose: each consumes a constraint set
 * (carrying these origins) and returns a substitution fragment plus errors and
 * diagnostics shaped uniformly here. [LAW:decomposition]
 */

/**
 * A port's identity, opaque to the solvers. They only compare it for equality
 * and use it as a map key; they never parse structure out of it. The concrete
 * key format (`${nodeId}:${portId}:${dir}` or similar) is owned by the graph /
 * constraint-extraction layer (wzm3.5) — a value branded there stays assignable
 * here, so keeping this a bare alias couples nothing. [LAW:decomposition]
 */
export type PortKey = string;

/**
 * Where a constraint came from. Carried on every constraint so an error can be
 * attributed and classified: an edge origin means the user wired incompatible
 * types (their patch is wrong); a payloadMetadata origin means a block declared
 * a polymorphism its concrete value contradicts (the block def is too specific);
 * anything else is an internal unresolved. The kind is the only field the
 * classifier reads — the rest is for human-facing diagnostic attribution.
 * [FRAMING:representation]
 */
export type ConstraintOrigin =
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'blockRule'; readonly blockId: string; readonly rule: string }
  | { readonly kind: 'portDef'; readonly blockId: string; readonly port: string; readonly dir: 'in' | 'out' }
  | { readonly kind: 'payloadMetadata'; readonly blockId: string; readonly port: string };

/**
 * The non-fatal signals a solver emits unconditionally — a defaulting decision
 * the user might want to know about, or a post-solve edge mismatch the safety
 * net caught. Severity is NOT decided here; the fixpoint driver (wzm3.5) owns
 * that. `stableKey` lets the driver dedupe the same signal re-emitted across
 * iterations without bookkeeping. [LAW:no-silent-failure]
 */
export type SolveDiagnosticCode =
  | 'UnitDefaultedToNone'
  | 'PostSolveEdgeTypeMismatch'
  | 'CardinalityDefaultedToOne'
  | 'CardinalityPromotedToMany';

export interface SolveDiagnostic {
  readonly code: SolveDiagnosticCode;
  readonly message: string;
  readonly ports: readonly PortKey[];
  readonly origins: readonly ConstraintOrigin[];
  readonly stableKey: string;
}
