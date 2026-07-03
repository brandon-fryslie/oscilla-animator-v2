/**
 * src/pillars/types/solve/index.ts
 *
 * Public API for the pillar type solver. Organized by layer:
 *
 *   - Vocabulary (shared types, substitution)
 *   - Sub-solvers (payload/unit, cardinality, adapter search)
 *   - Fixpoint driver (resolveTypes + graph helpers + result types)
 *
 * Everything exported from the sub-solver layer is pure (same input → same
 * output); the fixpoint driver composes them, owning all graph mutation.
 * [LAW:effects-at-boundaries]
 */

// Vocabulary
export * from './shared';
export * from './substitution';

// Sub-solvers
export * from './payload-unit';
export * from './cardinality';
export * from './adapters';

// Core data model
export type {
  DraftPortDirection,
  DraftPortKey,
  DraftPortParts,
  MutableBlockId,
  ObligationId,
  MutableBlock,
  MutableEdge,
  MutableGraph,
  BlockOrigin,
  EdgeOrigin,
  ObligationKind,
  ObligationAnchor,
  FactDependency,
  ObligationStatus,
  Obligation,
  ElaborationPlan,
  TypeFacts,
  PortTypeHint,
  PortHintStatus,
  StrictTypedGraph,
  FixpointDiagnostic,
  FixpointDiagnosticCode,
  FixpointResult,
} from './typed-graph';
export { draftPortKey, parseDraftPortKey, mutableBlockId, obligationId, isOpen, isDischarged, discharged, blocked } from './typed-graph';

// Fixpoint driver
export { resolveTypes, makeMutableGraph } from './fixpoint';

// Post-convergence axis gate (also re-exported by ../validate for the public
// pillars/types surface; this index is the canonical source's own)
export { validateAxes } from './axis-validate';
