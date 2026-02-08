/**
 * Policy System Types — Interfaces for obligation discharge policies.
 *
 * Policies encapsulate HOW obligations are discharged. They receive a context
 * with solved type facts and produce elaboration plans.
 *
 * Policies are NEVER responsible for dependency checking. The fixpoint driver
 * checks deps before calling a policy. Policies only deal with "facts are
 * available but I can't satisfy this obligation" (returning blocked).
 *
 * // [LAW:single-enforcer] Dependency checking is done once in planDischarge, not in each policy.
 */

import type { DraftGraph, DraftPortRef } from '../draft-graph';
import type { TypeFacts, PortTypeHint } from '../type-facts';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { BlockDef } from '../../../blocks/registry';

// =============================================================================
// PolicyContext
// =============================================================================

export interface PolicyContext {
  readonly graph: DraftGraph;
  readonly registry: ReadonlyMap<string, BlockDef>;
  readonly facts: TypeFacts;
  readonly getHint: (port: DraftPortRef) => PortTypeHint;
}

// =============================================================================
// PolicyResult
// =============================================================================

export type PolicyResult =
  | { readonly kind: 'plan'; readonly plan: ElaborationPlan }
  | { readonly kind: 'blocked'; readonly reason: string; readonly diagIds: readonly string[] };

// =============================================================================
// Policy Interfaces
// =============================================================================

export interface DefaultSourcePolicy {
  readonly name: 'defaultSources.v1';
  readonly version: 1;
  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult;
}

export interface AdapterPolicy {
  readonly name: 'adapters.v1';
  readonly version: 1;
  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult;
}

export interface PayloadAnchorPolicy {
  readonly name: 'payloadAnchor.v1';
  readonly version: 1;
  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult;
}

export interface CardinalityAdapterPolicy {
  readonly name: 'cardinalityAdapters.v1';
  readonly version: 1;
  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult;
}

export interface CycleBreakPolicy {
  readonly name: 'cycleBreak.v1';
  readonly version: 1;
  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult;
}

/** Union of all policy types for the fixpoint driver. */
export type NormalizationPolicy = DefaultSourcePolicy | AdapterPolicy | PayloadAnchorPolicy | CardinalityAdapterPolicy | CycleBreakPolicy;
