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
import type { FixpointDiagnostic } from './fixpoint-diagnostic';
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
import { isAxisInst, isAxisVar, resolveCardinalityPolicy } from '../../core/canonical-types';
import type { CardinalityAcceptance } from '../../core/canonical-types/cardinality';
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
  readonly diagnostics: readonly FixpointDiagnostic[];
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
  const diagnostics: FixpointDiagnostic[] = [];
  const trace: TraceEvent[] = options.trace ? [] : [];
  const tracing = options.trace === true;
  let g = input;
  let lastFacts: TypeFacts = EMPTY_TYPE_FACTS;
  // [LAW:dataflow-not-control-flow] Track last iteration's solver diagnostics separately.
  // Earlier iterations may report conflicts that the fixpoint resolves structurally
  // (e.g., adapter insertion resolves ConflictingUnits). Only the final iteration's
  // solver diagnostics reflect the converged state.
  let lastSolveDiagnostics: FixpointDiagnostic[] = [];

  for (let i = 0; i < options.maxIterations; i++) {
    let didMutateGraph = false;

    // 1) Solve (pure) — extract constraints + run payload/unit solver + compute TypeFacts
    const { facts, solveDiagnostics, cardinalityConflicts, collectPorts } = solveAndComputeFacts(g, registry);
    lastFacts = facts;
    lastSolveDiagnostics = solveDiagnostics;

    // 2) Create derived obligations (pure) — adapter + cardinality adapter + cycle break + missing input obligations
    const derivedObs = createDerivedObligations(g, facts);
    const cardObs = createCardinalityAdapterObligations(g, cardinalityConflicts);
    const cycleObs = createCycleBreakObligations(g, registry);
    const missingInputObs = createMissingInputObligations(g, registry);
    const { graph: g2, added } = addObligationsIfMissing(g, [...derivedObs, ...cardObs, ...cycleObs, ...missingInputObs]);
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
      // Push final iteration's solver diagnostics (converged state)
      diagnostics.push(...lastSolveDiagnostics);
      // Emit remaining cardinality conflicts as diagnostics (could not resolve structurally)
      for (const conflict of cardinalityConflicts) {
        // [LAW:dataflow-not-control-flow] Extract ports uniformly; each conflict type names them differently.
        const ports = 'ports' in conflict
          ? conflict.ports
          : [...conflict.zipPorts, ...conflict.clampOneMembers];
        diagnostics.push({
          diagnosticFlagCode: conflict.kind,
          message: conflict.message,
          stableKey: `${conflict.kind}:${ports.join(',')}`,
          ports,
        });
      }
      const strict = tryFinalizeStrict(g, facts, collectPorts);
      if (!strict) {
        diagnostics.push(...collectStrictFailureDiagnostics(g, facts, collectPorts));
      }
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

  // Non-convergence — push last iteration's solver diagnostics before reporting
  diagnostics.push(...lastSolveDiagnostics);
  diagnostics.push({
    diagnosticFlagCode: 'NonConvergence',
    message: `Fixpoint did not converge after ${options.maxIterations} iterations`,
    stableKey: 'NonConvergence',
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
): { facts: TypeFacts; solveDiagnostics: FixpointDiagnostic[]; cardinalityConflicts: readonly CardinalitySolveError[]; collectPorts: ReadonlySet<DraftPortKey> } {
  const solveDiagnostics: FixpointDiagnostic[] = [];

  // [LAW:dataflow-not-control-flow] No empty-graph guard — extractConstraints + solvers handle empty inputs.

  // 1) Extract constraints
  const extracted = extractConstraints(g, registry);
  // [LAW:dataflow-not-control-flow] Policy diagnostics flow unconditionally into solve output.
  solveDiagnostics.push(...extracted.policyDiagnostics);

  // 2) Build port-to-var mapping
  const portVarMapping = buildPortVarMapping(extracted.portBaseTypes);

  // 3) Run payload/unit solver
  const puResult = solvePayloadUnit(extracted.payloadUnit, portVarMapping);

  // Collect payload/unit errors as FixpointDiagnostic
  for (const error of puResult.errors) {
    solveDiagnostics.push({
      diagnosticFlagCode: error.kind,
      message: error.message,
      stableKey: `${error.kind}:${error.port}`,
      port: error.port,
      origins: error.origins,
      errorClass: error.errorClass,
    });
  }

  // Collect PU escape hatch diagnostics (already FixpointDiagnostic)
  solveDiagnostics.push(...puResult.diagnostics);

  // 4) Run cardinality solver
  const cardResult = solveCardinality({
    ports: [...extracted.portBaseTypes.keys()].sort(),
    baseCardinalityAxis: extracted.baseCardinalityAxis,
    constraints: extracted.cardinality,
  });

  // Separate cardinality errors: PromoteToManyClampOneConflict and ClampManyConflict
  // are structural issues resolved via obligations (Broadcast insertion), not terminal errors.
  const cardinalityConflicts: CardinalitySolveError[] = [];
  for (const error of cardResult.errors) {
    if (error.kind === 'PromoteToManyClampOneConflict' || error.kind === 'ClampManyConflict') {
      cardinalityConflicts.push(error);
    } else {
      solveDiagnostics.push({
        diagnosticFlagCode: error.kind,
        message: error.message,
        stableKey: `${error.kind}:${error.ports.join(',')}`,
        ports: error.ports,
      });
    }
  }

  // Collect cardinality escape hatch diagnostics (already FixpointDiagnostic)
  solveDiagnostics.push(...cardResult.diagnostics);

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

  // 8) Build portAcceptance from solver-facing cardinality axes
  // // [LAW:one-source-of-truth] Acceptance derives from CT/ICT axis policy, extracted once here.
  const portAcceptance = buildPortAcceptance(extracted.baseCardinalityAxis);

  return { facts: { ports, instances, portAcceptance }, solveDiagnostics, cardinalityConflicts, collectPorts: extracted.collectPorts };
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

    // Call policy by canonical policy name.
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

  // Check all ports resolved; empty facts is valid for an empty graph.
  // (empty graph = trivially strict)
  const portTypes = new Map<DraftPortKey, import('../../core/canonical-types').CanonicalType>();
  for (const [key, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) {
      // [LAW:one-type-per-behavior] Collect ports are edge-typed; their port node
      // does not need a single resolved canonical type in strict output.
      if (collectPortKeys?.has(key)) continue;
      return null;
    }
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

function collectStrictFailureDiagnostics(
  g: DraftGraph,
  facts: TypeFacts,
  collectPortKeys?: ReadonlySet<DraftPortKey>,
): FixpointDiagnostic[] {
  const diagnostics: FixpointDiagnostic[] = [];
  const openObligations = g.obligations.filter((o) => isOpen(o));

  for (const obligation of openObligations) {
    const depsReady = areDependenciesSatisfied(obligation.deps, facts);
    const reason = depsReady
      ? 'depsReadyNoPlan'
      : 'depsNotReady';
    diagnostics.push({
      diagnosticFlagCode: 'OpenObligation',
      message: `Open obligation '${obligation.id}' (${obligation.kind}, policy=${obligation.policy.name}, ${reason})`,
      stableKey: `OpenObligation:${obligation.id}:${reason}`,
    });
  }

  for (const [key, hint] of facts.ports) {
    if (hint.status === 'ok') continue;
    if (collectPortKeys?.has(key)) continue;
    diagnostics.push({
      diagnosticFlagCode: 'UnresolvedPortType',
      message: `Port '${key}' is unresolved at strict finalization (${hint.status})`,
      stableKey: `UnresolvedPortType:${key}:${hint.status}`,
      port: key,
    });
  }

  return diagnostics;
}

// =============================================================================
// Diagnostic Deduplication
// =============================================================================

/**
 * Deduplicate diagnostics using stableKey.
 * Fixpoint iterations can emit the same diagnostic multiple times;
 * this removes duplicates while preserving order.
 */
function deduplicateDiagnostics(diagnostics: readonly FixpointDiagnostic[]): FixpointDiagnostic[] {
  const seen = new Set<string>();
  const result: FixpointDiagnostic[] = [];
  for (const d of diagnostics) {
    if (!seen.has(d.stableKey)) {
      seen.add(d.stableKey);
      result.push(d);
    }
  }
  return result;
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

// =============================================================================
// Port Acceptance Builder
// =============================================================================

/**
 * Build a port acceptance map from solver-facing cardinality axes.
 *
 * Only includes ports whose cardinality axis is a var with at least one
 * explicitly declared policy field (relation, acceptance, instanceBinding).
 * Ports without declared policy are excluded — matching the prior semantics
 * where undeclared vars were not considered broadcast-flexible.
 *
 * // [LAW:one-source-of-truth] Derives acceptance from CT/ICT axis data.
 * // [LAW:single-enforcer] This is the single place that materializes acceptance into TypeFacts.
 */
function buildPortAcceptance(
  baseCardinalityAxis: ReadonlyMap<DraftPortKey, import('../../core/canonical-types').Axis<import('../../core/canonical-types').CardinalityValue, import('../../core/ids').CardinalityVarId>>,
): ReadonlyMap<DraftPortKey, CardinalityAcceptance> {
  const result = new Map<DraftPortKey, CardinalityAcceptance>();

  for (const [key, axis] of baseCardinalityAxis) {
    if (!isAxisVar(axis)) continue;

    // Only include ports with explicitly declared policy — bare vars are not flexible.
    const cardAxis = axis as import('../../core/canonical-types/cardinality').CardinalityVarAxis;
    const hasDeclaredPolicy =
      cardAxis.relation !== undefined ||
      cardAxis.acceptance !== undefined ||
      cardAxis.instanceBinding !== undefined;
    if (!hasDeclaredPolicy) continue;

    const policy = resolveCardinalityPolicy(axis);
    if (policy) {
      result.set(key, policy.acceptance);
    }
  }

  return result;
}

// =============================================================================
// Missing Input Obligation Scanner
// =============================================================================

/**
 * Scan all blocks in the DraftGraph for exposed ports with no inbound edge
 * and create missingInputSource obligations for them.
 *
 * This is the fixpoint-loop counterpart to buildDraftGraph's initial obligation
 * creation. When elaboration plans add new blocks (e.g., Ellipse as a default
 * source for Array.element), those blocks' unconnected ports also need
 * missingInputSource obligations so the fixpoint can wire their defaults too.
 *
 * Idempotent: addObligationsIfMissing deduplicates by obligation ID.
 *
 * // [LAW:single-enforcer] Uses the same obligation ID scheme as buildDraftGraph.
 */
function createMissingInputObligations(
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): readonly Obligation[] {
  const obligations: Obligation[] = [];

  for (const block of g.blocks) {
    const blockDef = registry.get(block.type);
    if (!blockDef) continue;

    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      // Skip config-only inputs
      if (inputDef.exposedAsPort === false) continue;
      // Skip collect ports (explicit connections only)
      if (inputDef.collectAccepts) continue;
      // Skip if defaulting is forbidden (buildDraftGraph emits a diagnostic for these)
      if (inputDef.defaulting === 'forbidden') continue;

      // Skip if already connected
      const hasEdge = g.edges.some(
        (e) => e.to.blockId === block.id && e.to.port === portId,
      );
      if (hasEdge) continue;

      const oblId = `missingInput:${block.id}:${portId}` as ObligationId;
      obligations.push({
        id: oblId,
        kind: 'missingInputSource',
        anchor: {
          port: { blockId: block.id, port: portId, dir: 'in' },
          blockId: block.id,
        },
        status: { kind: 'open' },
        deps: [],
        policy: { name: 'defaultSources.v1', version: 1 },
        debug: { createdBy: 'createMissingInputObligations' },
      });
    }
  }

  return obligations;
}
