/**
 * src/pillars/types/solve/fixpoint.ts
 *
 * The fixpoint driver — the main entry point of the pillar type solver.
 *
 * `resolveTypes(graph, catalog, options)` runs the normalization loop until
 * convergence or `maxIterations` exhaustion. Each iteration is pure through
 * steps 1–3; step 4 (plan application) produces a new graph for the next
 * iteration. [LAW:effects-at-boundaries] [LAW:no-ambient-temporal-coupling]
 *
 * Convergence rule: no new obligations AND no plans produced this iteration.
 * Both conditions are required — a purely-obligation iteration (new obligation
 * added but not yet plannable) still needs follow-up. [LAW:dataflow-not-control-flow]
 *
 * Diagnostic strategy: only the FINAL iteration's solver diagnostics are
 * surfaced. Earlier conflicts resolved by adapter insertion would be noise.
 * [LAW:no-silent-failure]
 */

import type { DefinedBlock } from '../../block-api';
import { extractConstraints, buildPUSolveInput, buildCardSolveInput } from './extract-constraints';
import { solvePayloadUnit } from './payload-unit';
import { solveCardinality, isStructuralCardinalityConflict } from './cardinality';
import type { CardinalitySolveError } from './cardinality';
import { assembleSubstitution, computeTypeFacts, areDependenciesSatisfied, buildConflictPorts } from './type-facts';
import {
  createMissingInputObligations,
  createAdapterObligations,
  createCardinalityAdapterObligations,
  createPayloadAnchorObligations,
  createCardinalityObligations,
  createCycleBreakObligations,
} from './obligations';
import {
  defaultSourcePolicy,
  adapterPolicy,
  cardinalityAdapterPolicy,
  payloadAnchorPolicy,
  cycleBreakPolicy,
} from './policies';
import { applyAllPlans, addObligationsIfMissing } from './apply-elaboration';
import type {
  DraftPortKey,
  ElaborationPlan,
  FixpointDiagnostic,
  FixpointResult,
  MutableGraph,
  Obligation,
  ObligationId,
  StrictTypedGraph,
  TypeFacts,
} from './typed-graph';
import type { ZCanonicalType } from '../schemas';
import { isOpen } from './typed-graph';
import type { PolicyContext } from './policies/policy-types';
import { validateAxes } from './axis-validate';

const DEFAULT_MAX_ITERATIONS = 20;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveTypes(
  graph: MutableGraph,
  catalog: readonly DefinedBlock[],
  options?: { readonly maxIterations?: number },
): FixpointResult {
  const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let g = graph;
  const accumulatedDiagnostics: FixpointDiagnostic[] = [];
  let lastSolveDiagnostics: FixpointDiagnostic[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // ------------------------------------------------------------------ (1) Solve (pure)
    const extracted = extractConstraints(g, catalog);
    const puResult = solvePayloadUnit(buildPUSolveInput(extracted));
    const cardResult = solveCardinality(buildCardSolveInput(extracted));
    const subst = assembleSubstitution(puResult, cardResult);
    const conflictPorts = buildConflictPorts(puResult);
    const facts = computeTypeFacts(extracted.portBaseTypes, subst, conflictPorts);

    // Partition cardinality errors: structural → obligations; terminal → diagnostics.
    const structuralCardErrors: CardinalitySolveError[] = [];
    const terminalCardDiags: FixpointDiagnostic[] = [];
    for (const err of cardResult.errors) {
      if (isStructuralCardinalityConflict(err)) {
        structuralCardErrors.push(err);
      } else {
        terminalCardDiags.push({
          code: 'TypeConflict',
          message: err.message,
          stableKey: `CardinalityError:${[...err.ports].sort().join(',')}`,
          ports: err.ports as DraftPortKey[],
        });
      }
    }

    // The sub-solvers emit informational diagnostics (defaulted units/
    // cardinalities, post-solve edge mismatches) precisely so defaulting is
    // never silent magic; fold them in so convergence surfaces the final
    // iteration's signals alongside terminal conflicts. [LAW:no-silent-failure]
    const solverInfoDiags: FixpointDiagnostic[] = [...puResult.diagnostics, ...cardResult.diagnostics].map((d) => ({
      code: d.code,
      message: d.message,
      stableKey: d.stableKey,
      ports: d.ports as DraftPortKey[],
    }));

    lastSolveDiagnostics = [...terminalCardDiags, ...solverInfoDiags];

    // ------------------------------------------------------------------ (2) Create obligations
    const adapterObs = createAdapterObligations(g, facts, catalog);
    const cardAdapterObs = createCardinalityAdapterObligations(g, facts, catalog);
    const anchorObs = createPayloadAnchorObligations(facts);
    const cardObs = createCardinalityObligations(g, structuralCardErrors);
    const cycleObs = createCycleBreakObligations(g);
    const missingObs = createMissingInputObligations(g, catalog);

    const merged = addObligationsIfMissing(g, [...adapterObs, ...cardAdapterObs, ...anchorObs, ...cardObs, ...cycleObs, ...missingObs]);
    const didMutateObligations = merged.added > 0;
    g = merged.graph;

    // ------------------------------------------------------------------ (3) Plan discharge
    const { plans, blockedReasons } = planDischarge(g, facts, catalog);

    // ------------------------------------------------------------------ (4) Convergence check
    // Note: an open obligation whose deps are satisfied but whose policy
    // returns 'blocked' does not prevent convergence — it is deliberately
    // left open and surfaces below as an OpenObligation diagnostic.
    if (plans.length === 0 && !didMutateObligations) {
      // Converged. Surface final diagnostics.
      accumulatedDiagnostics.push(...lastSolveDiagnostics);
      for (const ob of g.obligations) {
        if (!isOpen(ob)) continue;
        // The final iteration's policy-blocked reason is the actionable part
        // of an OpenObligation — surface it, not just the fact of openness.
        // [LAW:no-silent-failure]
        const reason = blockedReasons.get(ob.id);
        accumulatedDiagnostics.push({
          code: 'OpenObligation',
          message: `Obligation ${ob.kind} for ${ob.anchor.kind === 'edge' ? `edge ${ob.anchor.edgeId}` : `port ${ob.anchor.blockId}:${ob.anchor.slotName}`} could not be discharged${reason !== undefined ? ` (${reason})` : ''}`,
          stableKey: `OpenObligation:${ob.id}`,
          obligationId: ob.id,
        });
      }

      let strict = tryFinalizeStrict(g, facts, accumulatedDiagnostics);

      // Terminal cardinality conflicts (e.g. two concrete lane sets) can leave
      // every port individually canonicalizable, so port status alone cannot
      // catch them: strict must MEAN conflict-free. [LAW:types-are-the-program]
      if (terminalCardDiags.length > 0) {
        strict = null;
      }

      // [LAW:single-enforcer] — axis invariants validated once, here, after convergence.
      if (strict !== null) {
        const axisViolations = validateAxes(strict, catalog);
        if (axisViolations.length > 0) {
          accumulatedDiagnostics.push(...axisViolations);
          strict = null;
        }
      }

      return {
        graph: g,
        facts,
        strict,
        diagnostics: dedup(accumulatedDiagnostics),
        iterations: i + 1,
      };
    }

    // ------------------------------------------------------------------ (5) Apply
    if (plans.length > 0) {
      // Collect plan-level diagnostics (e.g., CheaterAdapterUsed)
      for (const plan of plans) {
        accumulatedDiagnostics.push(...(plan.diagnostics ?? []));
      }
      g = applyAllPlans(g, plans);
    }
  }

  // Exhausted maxIterations
  const nonConvergenceDiag: FixpointDiagnostic = {
    code: 'NonConvergence',
    message: `Type solver did not converge within ${maxIterations} iterations`,
    stableKey: 'NonConvergence',
  };

  return {
    graph: g,
    facts: emptyFacts(),
    strict: null,
    diagnostics: [nonConvergenceDiag, ...accumulatedDiagnostics],
    iterations: maxIterations,
  };
}

// ---------------------------------------------------------------------------
// Plan discharge
// ---------------------------------------------------------------------------

function planDischarge(
  graph: MutableGraph,
  facts: TypeFacts,
  catalog: readonly DefinedBlock[],
): { readonly plans: ElaborationPlan[]; readonly blockedReasons: ReadonlyMap<ObligationId, string> } {
  const plans: ElaborationPlan[] = [];
  const blockedReasons = new Map<ObligationId, string>();
  // Per-iteration mutual exclusion on replaced edges: the first plan claims
  // an edge; a second plan targeting the same edge this iteration is skipped
  // (its obligation stays open and re-plans against the rewired graph next
  // iteration). Two plans replacing one edge would otherwise leave parallel
  // adapter chains. [LAW:no-ambient-temporal-coupling]
  const claimedEdges = new Set<string>();

  for (const obligation of graph.obligations) {
    if (!isOpen(obligation)) continue;
    if (!areDependenciesSatisfied(obligation.deps, facts)) continue;

    const ctx: PolicyContext = { graph, facts, catalog, obligation };
    const result = callPolicy(obligation, ctx);
    if (result?.kind === 'plan') {
      const removes = (result.plan.replaceEdges ?? []).map((r) => r.remove);
      if (removes.some((id) => claimedEdges.has(id))) {
        blockedReasons.set(obligation.id, 'edge already claimed by another plan this iteration');
        continue;
      }
      for (const id of removes) claimedEdges.add(id);
      plans.push(result.plan);
    } else if (result?.kind === 'blocked') {
      // Blocked obligations stay open for retry next iteration; the reason is
      // carried to the convergence surfacing rather than persisted on status
      // (a persisted 'blocked' status would end the retry loop).
      blockedReasons.set(obligation.id, result.reason);
    }
  }

  return { plans, blockedReasons };
}

function callPolicy(obligation: Obligation, ctx: PolicyContext) {
  switch (obligation.policy.name) {
    case 'defaultSources.v1':
      return defaultSourcePolicy(ctx);
    case 'adapters.v1':
      return adapterPolicy(ctx);
    case 'cardinalityAdapters.v1':
      return cardinalityAdapterPolicy(ctx);
    case 'payloadAnchor.v1':
      return payloadAnchorPolicy(ctx);
    case 'cycleBreak.v1':
      return cycleBreakPolicy(ctx);
    default:
      return { kind: 'blocked' as const, reason: `unknown policy ${obligation.policy.name}` };
  }
}

// ---------------------------------------------------------------------------
// StrictTypedGraph finalization
// ---------------------------------------------------------------------------

function tryFinalizeStrict(
  graph: MutableGraph,
  facts: TypeFacts,
  diagnostics: FixpointDiagnostic[],
): StrictTypedGraph | null {
  // Fail if any obligations are open
  const openObs = graph.obligations.filter(isOpen);
  if (openObs.length > 0) return null;

  // Fail if any port is not 'ok'
  const portTypes = new Map<DraftPortKey, ZCanonicalType>();
  let allOk = true;
  for (const [key, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) {
      diagnostics.push({
        code: 'UnresolvedPort',
        message: `Port ${key} is not fully resolved (status: ${hint.status})`,
        stableKey: `UnresolvedPort:${key}`,
        ports: [key],
      });
      allOk = false;
    } else {
      portTypes.set(key, hint.canonical);
    }
  }

  if (!allOk) return null;

  return { graph, portTypes, diagnostics: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyFacts(): TypeFacts {
  return { ports: new Map(), instances: new Map(), portAcceptance: new Map() };
}

function dedup(diags: FixpointDiagnostic[]): FixpointDiagnostic[] {
  const seen = new Set<string>();
  return diags.filter((d) => {
    if (seen.has(d.stableKey)) return false;
    seen.add(d.stableKey);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Public graph construction helper
// ---------------------------------------------------------------------------

/** Build an initial MutableGraph from block/edge arrays, with no obligations. */
export function makeMutableGraph(
  blocks: readonly import('./typed-graph').MutableBlock[],
  edges: readonly import('./typed-graph').MutableEdge[],
): MutableGraph {
  const sortById = <T extends { readonly id: string }>(arr: readonly T[]): T[] =>
    [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    blocks: sortById(blocks),
    edges: sortById(edges),
    obligations: [],
    revision: 0,
  };
}
