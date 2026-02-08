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
import type { TypeFacts, PortTypeHint, StrictTypedGraph, DraftPortKey, InstancePorts } from './type-facts';
import { EMPTY_TYPE_FACTS, draftPortKey, getPortHint, instanceKey } from './type-facts';
import type { PolicyContext, PolicyResult } from './policies/policy-types';
import type { BlockDef } from '../../blocks/registry';
import { BLOCK_DEFS_BY_TYPE } from '../../blocks/registry';
import { extractConstraints, type ExtractedConstraints } from './extract-constraints';
import { solvePayloadUnit, buildPortVarMapping } from './payload-unit/solve';
import type { CanonicalType, InstanceRef } from '../../core/canonical-types';
import { isAxisInst, isAxisVar } from '../../core/canonical-types';
import type { InferenceCanonicalType } from '../../core/inference-types';
import { isPayloadVar, isUnitVar, isInferenceCanonicalizable, finalizeInferenceType, applyPartialSubstitution, type Substitution, EMPTY_SUBSTITUTION } from '../../core/inference-types';
import { solveCardinality, type CardinalitySolveError } from './cardinality/solve';
import { defaultSourcePolicyV1 } from './policies/default-source-policy';
import { adapterPolicyV1 } from './policies/adapter-policy';
import { payloadAnchorPolicyV1 } from './policies/payload-anchor-policy';
import { cardinalityAdapterPolicyV1 } from './policies/cardinality-adapter-policy';
import { cycleBreakPolicyV1 } from './policies/cycle-break-policy';
import { createDerivedObligations } from './create-derived-obligations';
import { createCardinalityAdapterObligations } from './create-cardinality-obligations';
import { createCycleBreakObligations } from './create-cycle-break-obligations';

// =============================================================================
// Options
// =============================================================================

export interface FixpointOptions {
  readonly maxIterations: number;
  readonly trace?: boolean;
}

// =============================================================================
// Trace Events
// =============================================================================

export type TraceEvent =
  | { readonly kind: 'PlanDefaultSource'; readonly obligationId: string; readonly targetPortKey: string; readonly strategyBlockType: string }
  | { readonly kind: 'ApplyDefaultSource'; readonly obligationId: string; readonly addedBlocks: readonly string[]; readonly addedEdges: readonly string[] };

// =============================================================================
// Result
// =============================================================================

export interface FixpointResult {
  readonly graph: DraftGraph;
  readonly facts: TypeFacts;
  readonly strict: StrictTypedGraph | null;
  readonly diagnostics: readonly unknown[];
  readonly iterations: number;
  readonly trace?: readonly TraceEvent[];
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
  const trace: TraceEvent[] = options.trace ? [] : [];
  const tracing = options.trace === true;
  let g = input;
  let lastFacts: TypeFacts = EMPTY_TYPE_FACTS;

  for (let i = 0; i < options.maxIterations; i++) {
    let didMutateGraph = false;

    // 1) Solve (pure) — extract constraints + run payload/unit solver + compute TypeFacts
    const { facts, solveDiagnostics, cardinalityConflicts, collectPorts } = solveAndComputeFacts(g, registry);
    lastFacts = facts;
    diagnostics.push(...solveDiagnostics);

    // 2) Create derived obligations (pure) — adapter + cardinality adapter + cycle break obligations
    const derivedObs = createDerivedObligations(g, facts);
    const cardObs = createCardinalityAdapterObligations(g, cardinalityConflicts);
    const cycleObs = createCycleBreakObligations(g, registry);
    const { graph: g2, added } = addObligationsIfMissing(g, [...derivedObs, ...cardObs, ...cycleObs]);
    if (added > 0) didMutateGraph = true;
    g = g2;

    // 3) Plan discharge
    const plans = planDischarge(g, facts, registry);

    // Trace plan events
    if (tracing) {
      for (const plan of plans) {
        const obl = g.obligations.find((o) => o.id === plan.obligationId);
        if (obl && plan.role === 'defaultSource') {
          const portKey = obl.anchor.port
            ? `${obl.anchor.port.blockId}:${obl.anchor.port.port}`
            : 'unknown';
          const strategyBlockType = plan.addBlocks?.[0]?.type
            ?? plan.addEdges?.[0]?.from.blockId
            ?? 'unknown';
          trace.push({
            kind: 'PlanDefaultSource',
            obligationId: plan.obligationId,
            targetPortKey: portKey,
            strategyBlockType,
          });
        }
      }
    }

    // 4) Apply — stop when no plans AND no new obligations were added
    if (plans.length === 0 && !didMutateGraph) {
      // Emit remaining cardinality conflicts as diagnostics (could not resolve structurally)
      for (const conflict of cardinalityConflicts) {
        diagnostics.push({
          kind: 'CardinalityConstraintError',
          subKind: conflict.kind,
          ports: conflict.kind === 'ZipBroadcastClampOneConflict' ? conflict.zipPorts : [],
          message: conflict.message,
        });
      }
      const strict = tryFinalizeStrict(g, facts, collectPorts);
      const deduped = deduplicateDiagnostics(diagnostics);
      return { graph: g, facts, strict, diagnostics: deduped, iterations: i + 1, ...(tracing ? { trace } : {}) };
    }

    if (plans.length > 0) {
      // Trace apply events
      if (tracing) {
        for (const plan of plans) {
          if (plan.role === 'defaultSource') {
            trace.push({
              kind: 'ApplyDefaultSource',
              obligationId: plan.obligationId,
              addedBlocks: (plan.addBlocks ?? []).map((b) => b.id),
              addedEdges: (plan.addEdges ?? []).map((e) => e.id),
            });
          }
        }
      }

      // Collect diagnostics from plans
      for (const plan of plans) {
        if (plan.diagnostics) {
          diagnostics.push(...plan.diagnostics);
        }
      }

      g = applyAllPlans(g, plans);
    }
  }

  // Non-convergence
  diagnostics.push({
    kind: 'NonConvergence',
    message: `Fixpoint did not converge after ${options.maxIterations} iterations`,
  });

  const deduped = deduplicateDiagnostics(diagnostics);
  return { graph: g, facts: lastFacts, strict: null, diagnostics: deduped, iterations: options.maxIterations, ...(tracing ? { trace } : {}) };
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
): { facts: TypeFacts; solveDiagnostics: unknown[]; cardinalityConflicts: readonly CardinalitySolveError[]; collectPorts: ReadonlySet<DraftPortKey> } {
  const solveDiagnostics: unknown[] = [];

  // [LAW:dataflow-not-control-flow] No empty-graph guard — extractConstraints + solvers handle empty inputs.

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
      errorClass: error.errorClass,
      port: error.port,
      message: error.message,
    });
  }

  // 4) Run cardinality solver
  const cardResult = solveCardinality({
    ports: [...extracted.portBaseTypes.keys()].sort(),
    baseCardinalityAxis: extracted.baseCardinalityAxis,
    constraints: extracted.cardinality,
  });

  // Separate cardinality errors: ZipBroadcastClampOneConflict are structural
  // issues resolved via obligations, not terminal errors.
  const cardinalityConflicts: CardinalitySolveError[] = [];
  for (const error of cardResult.errors) {
    if (error.kind === 'ZipBroadcastClampOneConflict') {
      cardinalityConflicts.push(error);
    } else {
      solveDiagnostics.push({
        kind: 'CardinalityConstraintError',
        subKind: error.kind,
        ports: error.ports,
        message: error.message,
      });
    }
  }

  // 5) Build Substitution from solver outputs
  const subst: Substitution = {
    payloads: puResult.payloads,
    units: puResult.units,
    cardinalities: cardResult.cardinalities,
  };

  // 6) Compute TypeFacts port hints
  const ports = new Map<DraftPortKey, PortTypeHint>();

  for (const [key, baseType] of extracted.portBaseTypes) {
    const hint = computePortHint(key, baseType, subst, puResult.portPayloads, puResult.portUnits);
    ports.set(key, hint);
  }

  // 7) Build instance index from resolved port hints
  const instances = buildInstanceIndex(ports);

  return { facts: { ports, instances }, solveDiagnostics, cardinalityConflicts, collectPorts: extracted.collectPorts };
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
  // [LAW:dataflow-not-control-flow] Empty arrays flow through naturally.
  const existingIds = new Set(g.obligations.map((o) => o.id));
  const toAdd = newObligations.filter((o) => !existingIds.has(o.id));
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
      case 'portHasUnresolvedPayload': {
        // Port must have an unresolved payload var (that's what we're anchoring)
        if (hint.status === 'ok') return false; // Already fully resolved
        if (hint.status !== 'unknown' || !hint.inference) return false;
        if (hint.inference.payload.kind !== 'var') return false; // Already resolved or concrete
        break;
      }
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
    case 'payloadAnchor.v1':
      return payloadAnchorPolicyV1.plan(obligation, ctx);
    case 'cardinalityAdapters.v1':
      return cardinalityAdapterPolicyV1.plan(obligation, ctx);
    case 'cycleBreak.v1':
      return cycleBreakPolicyV1.plan(obligation, ctx);
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
function tryFinalizeStrict(
  g: DraftGraph,
  facts: TypeFacts,
  collectPortKeys?: ReadonlySet<DraftPortKey>,
): StrictTypedGraph | null {
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

  // Build collectEdgeTypes: for each edge targeting a collect port,
  // the edge's type is the source output's resolved type.
  let collectEdgeTypes: Map<string, import('../../core/canonical-types').CanonicalType> | undefined;
  if (collectPortKeys && collectPortKeys.size > 0) {
    collectEdgeTypes = new Map();
    // Group edges by target collect port and assign per-edge indices
    const edgesByTarget = new Map<string, typeof g.edges[number][]>();
    for (const edge of g.edges) {
      const toKey = draftPortKey(edge.to.blockId, edge.to.port, 'in');
      if (!collectPortKeys.has(toKey)) continue;
      const targetId = `${edge.to.blockId}:${edge.to.port}`;
      const list = edgesByTarget.get(targetId) ?? [];
      list.push(edge);
      edgesByTarget.set(targetId, list);
    }

    for (const [, edges] of edgesByTarget) {
      // Edges are already in graph insertion order; use index as edge position
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const sourceKey = draftPortKey(edge.from.blockId, edge.from.port, 'out');
        const sourceType = portTypes.get(sourceKey);
        if (sourceType) {
          // Key format matches CollectEdgeKey when translated through bridge
          const edgeKey = `${edge.to.blockId}:${edge.to.port}:${i}`;
          collectEdgeTypes.set(edgeKey, sourceType);
        }
      }
    }
  }

  return {
    graph: g,
    portTypes,
    collectEdgeTypes: collectEdgeTypes && collectEdgeTypes.size > 0 ? collectEdgeTypes : undefined,
    diagnostics: [],
  };
}

// =============================================================================
// Diagnostic Deduplication
// =============================================================================

/**
 * Deduplicate diagnostics using a stable key.
 * Fixpoint iterations can emit the same diagnostic multiple times;
 * this removes duplicates while preserving order.
 */
function deduplicateDiagnostics(diagnostics: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const d of diagnostics) {
    const key = diagKey(d);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(d);
    }
  }
  return result;
}

function diagKey(d: unknown): string {
  if (typeof d !== 'object' || d === null) return String(d);
  const o = d as Record<string, unknown>;
  return `${o.kind ?? ''}:${o.subKind ?? ''}:${o.port ?? ''}:${o.message ?? ''}`;
}

// =============================================================================
// Instance Index Builder
// =============================================================================

/**
 * Build an index of InstanceRef → ports from resolved port hints.
 * Only includes ports with status 'ok' and cardinality many(instance).
 */
function buildInstanceIndex(
  portHints: ReadonlyMap<DraftPortKey, PortTypeHint>,
): ReadonlyMap<string, InstancePorts> {
  const byKey = new Map<string, { ref: InstanceRef; ports: DraftPortKey[] }>();

  for (const [port, hint] of portHints) {
    if (hint.status !== 'ok' || !hint.canonical) continue;
    const card = hint.canonical.extent.cardinality;
    if (!isAxisInst(card) || card.value.kind !== 'many') continue;
    const key = instanceKey(card.value.instance);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { ref: card.value.instance, ports: [] };
      byKey.set(key, entry);
    }
    entry.ports.push(port);
  }

  const instances = new Map<string, InstancePorts>();
  for (const [k, v] of byKey) {
    instances.set(k, { ref: v.ref, ports: v.ports.sort() });
  }
  return instances;
}
