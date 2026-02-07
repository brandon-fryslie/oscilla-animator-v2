/**
 * Final Normalization Fixpoint Driver
 *
 * Iterates: Solve → Derive Obligations → Plan Discharge → Apply
 * until convergence (no new obligations AND no plans apply).
 *
 * This replaces the linear pass pipeline with an iterative engine where
 * structural elaboration depends on solved types.
 *
 * // [LAW:one-source-of-truth] DraftGraph is the single mutable structure.
 * // [LAW:dataflow-not-control-flow] All steps execute unconditionally; emptiness is data.
 * // [LAW:single-enforcer] Dependency checking happens once in planDischarge.
 */

import type { DraftGraph, DraftPortRef } from './draft-graph';
import type { Obligation, ObligationId, FactDependency } from './obligations';
import { isOpen } from './obligations';
import type { ElaborationPlan } from './elaboration';
import { applyAllPlans } from './apply-elaboration';
import type { TypeFacts, PortTypeHint, StrictTypedGraph, DraftPortKey } from './type-facts';
import { EMPTY_TYPE_FACTS, draftPortKey, getPortHint } from './type-facts';
import type { PolicyContext, PolicyResult } from './policies/policy-types';
import type { BlockDef } from '../../blocks/registry';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import { extractConstraints, type ExtractedConstraints } from './extract-constraints';
import { solvePayloadUnit, buildPortVarMapping } from './solve-payload-unit';
import type { CanonicalType } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isInferenceCanonicalizable, finalizeInferenceType, applyPartialSubstitution, type Substitution, EMPTY_SUBSTITUTION } from '../../core/inference-types';
import { defaultSourcePolicyV1 } from './policies/default-source-policy';
import { adapterPolicyV1 } from './policies/adapter-policy';
import { createDerivedObligations } from './create-derived-obligations';

// =============================================================================
// Options
// =============================================================================

export interface FixpointOptions {
  readonly maxIterations: number;
  readonly trace?: boolean;
}

// =============================================================================
// Result
// =============================================================================

export interface FixpointResult {
  readonly graph: DraftGraph;
  readonly facts: TypeFacts;
  readonly strict: StrictTypedGraph | null;
  readonly diagnostics: readonly unknown[];
  readonly iterations: number;
}

// =============================================================================
// Fixpoint Driver
// =============================================================================

/**
 * Run the normalization fixpoint loop.
 *
 * Iterates: Solve → Derive Obligations → Plan Discharge → Apply
 * until convergence (no new plans AND no new obligations).
 */
export function finalizeNormalizationFixpoint(
  input: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
  options: FixpointOptions,
): FixpointResult {
  const diagnostics: unknown[] = [];
  let g = input;
  let lastFacts: TypeFacts = EMPTY_TYPE_FACTS;

  for (let i = 0; i < options.maxIterations; i++) {
    let didMutateGraph = false;

    // 1) Solve (pure) — extract constraints + run payload/unit solver + compute TypeFacts
    const { facts, solveDiagnostics } = solveAndComputeFacts(g, registry);
    lastFacts = facts;
    diagnostics.push(...solveDiagnostics);

    // 2) Create derived obligations (pure) — adapter obligations from type mismatches
    const derivedObs = createDerivedObligations(g, facts);
    const { graph: g2, added } = addObligationsIfMissing(g, derivedObs);
    if (added > 0) didMutateGraph = true;
    g = g2;

    // 3) Plan discharge — stub: no plans
    const plans = planDischarge(g, facts, registry);

    // 4) Apply — stop when no plans AND no new obligations were added
    if (plans.length === 0 && !didMutateGraph) {
      const strict = tryFinalizeStrict(g, facts);
      return { graph: g, facts, strict, diagnostics, iterations: i + 1 };
    }

    if (plans.length > 0) {
      g = applyAllPlans(g, plans);
    }
  }

  // Non-convergence
  diagnostics.push({
    kind: 'NonConvergence',
    message: `Fixpoint did not converge after ${options.maxIterations} iterations`,
  });

  return { graph: g, facts: lastFacts, strict: null, diagnostics, iterations: options.maxIterations };
}

// =============================================================================
// Solve Step
// =============================================================================

/**
 * Extract constraints from the graph, run solvers, and compute TypeFacts.
 *
 * Pure function: same graph + same registry → same output.
 *
 * Strategy:
 * 1. Extract constraints (portBaseTypes, payload/unit, cardinality)
 * 2. Run payload/unit union-find solver → payloads/units substitutions
 * 3. Build a Substitution from solver results
 * 4. Compute TypeFacts: for each port, apply substitution and check canonicalizability
 */
function solveAndComputeFacts(
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): { facts: TypeFacts; solveDiagnostics: unknown[] } {
  const solveDiagnostics: unknown[] = [];

  // Empty graph → empty facts
  if (g.blocks.length === 0) {
    return { facts: EMPTY_TYPE_FACTS, solveDiagnostics };
  }

  // 1) Extract constraints
  const extracted = extractConstraints(g, registry);

  // 2) Build port-to-var mapping
  const portVarMapping = buildPortVarMapping(extracted.portBaseTypes);

  // 3) Run payload/unit solver
  const puResult = solvePayloadUnit(extracted.payloadUnit, portVarMapping);

  // Collect payload/unit errors
  for (const error of puResult.errors) {
    solveDiagnostics.push({
      kind: 'TypeConstraintError',
      subKind: error.kind,
      port: error.port,
      message: error.message,
    });
  }

  // 4) Build Substitution from solver output
  const subst: Substitution = {
    payloads: puResult.payloads,
    units: puResult.units,
    // Cardinality solving is deferred — will be added when cardinality solver
    // is adapted for DraftGraph. For now, axis vars stay unresolved.
  };

  // 5) Compute TypeFacts
  const ports = new Map<DraftPortKey, PortTypeHint>();

  for (const [key, baseType] of extracted.portBaseTypes) {
    const hint = computePortHint(key, baseType, subst, puResult.portPayloads, puResult.portUnits);
    ports.set(key, hint);
  }

  return { facts: { ports }, solveDiagnostics };
}

/**
 * Compute a PortTypeHint for a single port.
 *
 * - If finalizeInferenceType would succeed → status:'ok' with canonical
 * - If partially resolved → status:'unknown' with partial inference type
 * - Otherwise → status:'unknown' with base inference type
 */
function computePortHint(
  key: DraftPortKey,
  baseType: InferenceCanonicalType,
  subst: Substitution,
  portPayloads: ReadonlyMap<DraftPortKey, import('../../core/canonical-types').PayloadType>,
  portUnits: ReadonlyMap<DraftPortKey, import('../../core/canonical-types').UnitType>,
): PortTypeHint {
  // Build a port-specific substitution that includes per-port resolved types
  // For ports with concrete types (not vars), we still need to check canonicalizability
  // via the substitution. But for ports whose vars were resolved by the UF solver,
  // the per-port payloads/units give us the concrete values.
  const resolvedPayload = portPayloads.get(key);
  const resolvedUnit = portUnits.get(key);

  // Try to build a fully-resolved type directly
  // If payload and unit are both resolved (either concrete in def or solved by UF),
  // and all axis vars are resolved, we can finalize.

  // First: apply partial substitution
  const partial = applyPartialSubstitution(baseType, subst);

  // Override payload/unit with per-port resolved values from solver
  let effectiveType = partial;
  if (resolvedPayload && isPayloadVar(effectiveType.payload)) {
    effectiveType = { ...effectiveType, payload: resolvedPayload };
  }
  if (resolvedUnit && isUnitVar(effectiveType.unit)) {
    effectiveType = { ...effectiveType, unit: resolvedUnit };
  }

  // Check if fully canonicalizable
  if (isInferenceCanonicalizable(effectiveType, EMPTY_SUBSTITUTION)) {
    // All vars resolved — finalize
    const canonical = finalizeInferenceType(effectiveType, EMPTY_SUBSTITUTION);
    return { status: 'ok', canonical, diagIds: [] };
  }

  // Partially resolved
  const hasAnyResolution =
    !isPayloadVar(effectiveType.payload) ||
    !isUnitVar(effectiveType.unit);

  if (hasAnyResolution) {
    return { status: 'unknown', inference: effectiveType, diagIds: [] };
  }

  // Completely unresolved
  return { status: 'unknown', inference: baseType, diagIds: [] };
}

// =============================================================================
// Obligation Management
// =============================================================================

/**
 * Add obligations to the graph if they don't already exist.
 * Returns updated graph and count of newly added obligations.
 */
function addObligationsIfMissing(
  g: DraftGraph,
  newObligations: readonly Obligation[],
): { graph: DraftGraph; added: number } {
  if (newObligations.length === 0) {
    return { graph: g, added: 0 };
  }

  const existingIds = new Set(g.obligations.map((o) => o.id));
  const toAdd = newObligations.filter((o) => !existingIds.has(o.id));

  if (toAdd.length === 0) {
    return { graph: g, added: 0 };
  }

  const obligations = [...g.obligations, ...toAdd].sort((a, b) => a.id.localeCompare(b.id));

  return {
    graph: { ...g, obligations },
    added: toAdd.length,
  };
}

// =============================================================================
// Plan Discharge
// =============================================================================

/**
 * Iterate obligations, check deps against TypeFacts, call policies.
 *
 * - Skip discharged obligations
 * - If deps NOT satisfied: obligation stays open, do not call policy
 * - If deps satisfied: call policy, collect plans or mark blocked
 */
function planDischarge(
  g: DraftGraph,
  facts: TypeFacts,
  registry: ReadonlyMap<string, BlockDef>,
): ElaborationPlan[] {
  const plans: ElaborationPlan[] = [];
  const ctx: PolicyContext = {
    graph: g,
    registry,
    facts,
    getHint: (port: DraftPortRef) => getPortHint(facts, port.blockId, port.port, port.dir),
  };

  // Iterate obligations in deterministic order (sorted by id)
  for (const obligation of g.obligations) {
    if (!isOpen(obligation)) continue;

    // Check deps
    if (!areDependenciesSatisfied(obligation.deps, facts)) continue;

    // Call policy (stub — no policies registered yet)
    const result = callPolicy(obligation, ctx);
    if (!result) continue;

    if (result.kind === 'plan') {
      plans.push(result.plan);
    }
    // 'blocked' results will be handled when policies are implemented
  }

  return plans;
}

/**
 * Check if all dependencies for an obligation are satisfied.
 */
function areDependenciesSatisfied(deps: readonly FactDependency[], facts: TypeFacts): boolean {
  for (const dep of deps) {
    const hint = getPortHint(facts, dep.port.blockId, dep.port.port, dep.port.dir);

    switch (dep.kind) {
      case 'portCanonicalizable':
        if (hint.status !== 'ok') return false;
        break;
      case 'portPayloadResolved':
        if (hint.status !== 'ok' && hint.status !== 'unknown') return false;
        // For unknown, check if payload is at least resolved
        if (hint.status === 'unknown' && hint.inference) {
          if (hint.inference.payload.kind === 'var') return false;
        }
        break;
      case 'portUnitResolved':
        if (hint.status !== 'ok' && hint.status !== 'unknown') return false;
        if (hint.status === 'unknown' && hint.inference) {
          if (hint.inference.unit.kind === 'var') return false;
        }
        break;
      case 'portAxisResolved':
        // For now, require full canonicalizability for axis deps
        if (hint.status !== 'ok') return false;
        break;
    }
  }
  return true;
}

/**
 * Call the appropriate policy for an obligation.
 *
 * Dispatches based on obligation.policy.name.
 * Returns null if no matching policy exists.
 */
function callPolicy(obligation: Obligation, ctx: PolicyContext): PolicyResult | null {
  switch (obligation.policy.name) {
    case 'defaultSources.v1':
      return defaultSourcePolicyV1.plan(obligation, ctx);
    case 'adapters.v1':
      return adapterPolicyV1.plan(obligation, ctx);
    default:
      return null;
  }
}

// =============================================================================
// Strict Finalization
// =============================================================================

/**
 * Try to produce a StrictTypedGraph from the current state.
 * Returns null if any ports are unresolved or obligations remain open.
 */
function tryFinalizeStrict(g: DraftGraph, facts: TypeFacts): StrictTypedGraph | null {
  // Check no open obligations
  const hasOpenObligations = g.obligations.some((o) => isOpen(o));
  if (hasOpenObligations) return null;

  // Check all ports resolved — for the stub, if facts is empty, that's OK
  // (empty graph = trivially strict)
  const portTypes = new Map<DraftPortKey, import('../../core/canonical-types').CanonicalType>();
  for (const [key, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) return null;
    portTypes.set(key, hint.canonical);
  }

  return {
    graph: g,
    portTypes,
    diagnostics: [],
  };
}
