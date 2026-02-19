/**
 * ElaborationPlan — Describes structural mutations derived from obligations.
 *
 * Plans are produced by policies and applied by apply-elaboration.ts.
 * Each plan is tied to a specific obligation and describes what blocks/edges to add.
 *
 * // [LAW:one-source-of-truth] ObligationId is the single key linking plan to deferred work.
 */

import type { ObligationId, ElaboratedArtifactRefs } from './obligations';
import type { DraftBlock, DraftEdge, ElaboratedRole } from './draft-graph';
import type { FixpointDiagnostic } from './fixpoint-diagnostic';

// =============================================================================
// ElaborationPlan
// =============================================================================

export interface EdgeReplacement {
  /** Edge ID to remove */
  readonly remove: string;
  /** New edges to add in its place */
  readonly add: readonly DraftEdge[];
}

export interface ElaborationPlan {
  /** The obligation this plan discharges */
  readonly obligationId: ObligationId;
  /** Role of the elaborated structure */
  readonly role: ElaboratedRole;
  /** Blocks to add */
  readonly addBlocks?: readonly DraftBlock[];
  /** Edges to add */
  readonly addEdges?: readonly DraftEdge[];
  /** Edges to replace (remove old, add new) */
  readonly replaceEdges?: readonly EdgeReplacement[];
  /** Block IDs to remove (along with all their connected edges) */
  readonly removeBlockIds?: readonly string[];
  /** Diagnostics emitted by this plan (warnings, info) */
  readonly diagnostics?: readonly FixpointDiagnostic[];
  /** Human-readable notes for debugging */
  readonly notes?: string;
}

// Re-export for convenience
export type { ElaboratedArtifactRefs } from './obligations';
