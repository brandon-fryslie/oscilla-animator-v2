/**
 * src/pillars/types/solve/policies/policy-types.ts
 *
 * The shared vocabulary for all obligation policies: the context they receive
 * and the result they return. [LAW:decomposition]
 *
 * Every policy is a pure function `(ctx: PolicyContext) → PolicyResult`. The
 * fixpoint driver calls the appropriate policy AFTER confirming that the
 * obligation's `deps` are all satisfied. Policies therefore never have to
 * handle the "deps not yet ready" case. [LAW:effects-at-boundaries]
 */

import type { DefinedBlock } from '../../../block-api';
import type { ElaborationPlan, FixpointDiagnostic, MutableGraph, Obligation, TypeFacts } from '../typed-graph';

export interface PolicyContext {
  readonly graph: MutableGraph;
  readonly facts: TypeFacts;
  readonly catalog: readonly DefinedBlock[];
  readonly obligation: Obligation;
}

export type PolicyResult =
  | { readonly kind: 'plan'; readonly plan: ElaborationPlan }
  | { readonly kind: 'blocked'; readonly reason: string; readonly diagnostics?: readonly FixpointDiagnostic[] };
