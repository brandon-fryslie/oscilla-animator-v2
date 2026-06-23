# V1 Type Solver Walkthrough — Fixpoint Normalization Architecture

**Purpose.** This document captures how V1's type solver actually works end-to-end, as a reference for porting it to the pillar system. V1's solver in `src/compiler/frontend/` works correctly and is the ground truth for what the pillar replacement must achieve. The pillar port (epic `oscilla-pillars-types-ds8`) will reuse this architecture with pillar-appropriate types (`ZInferenceCanonicalType`, port contracts from `ZBlockContract`, etc.) and will drop V1's ad-hoc `TypePattern` dialect in favor of structural variables in the inference type.

This is a walkthrough, not a line-by-line reference. Its goal is to give a future agent enough mental model to propose a correct decomposition for the pillar version without re-reading ~5,500 lines of V1 TypeScript.

**Scope.** The "type solver" for V1 is really a **normalization fixpoint driver** that owns:

- Building constraints from a graph of typed blocks
- Running pure sub-solvers (payload/unit, cardinality) to resolve variables
- Computing per-port type facts from solver output
- Generating *obligations* — deferred work items — from graph state + facts
- *Planning* obligations into concrete graph mutations via per-kind *policies*
- *Applying* plans to produce a mutated graph
- Looping until convergence
- Either producing a `StrictTypedGraph` (success) or reporting diagnostics (failure)

Everything upstream of this (composite expansion, `buildDraftGraph`) feeds the fixpoint; everything downstream (`axis-validate`, backend lowering) consumes its `StrictTypedGraph` output.

---

## 1. High-level flow

```
              ┌──────────────────────────────────────────────────────────┐
              │                     UPSTREAM                             │
              │  Patch → compositeExpansion → buildDraftGraph            │
              │                                                          │
              │  buildDraftGraph converts the user-authored Patch into   │
              │  a DraftGraph: blocks + edges + initial obligations.     │
              │  The initial obligations are all missingInputSource      │
              │  obligations for exposed input ports that have no        │
              │  incoming edge. Defaults have not yet been wired.        │
              └──────────────────────────┬───────────────────────────────┘
                                         │
                                         ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │                          FIXPOINT DRIVER                              │
 │                                                                       │
 │  finalizeNormalizationFixpoint(draftGraph, registry, {maxIterations}) │
 │                                                                       │
 │  for i in 0..maxIterations:                                           │
 │    (1) Solve (pure)                                                   │
 │        • extractConstraints(graph, registry)                          │
 │        • solvePayloadUnit(constraints)                                │
 │        • solveCardinality(constraints)                                │
 │        • compute TypeFacts (per-port resolved hints + instances +     │
 │          portAcceptance)                                              │
 │    (2) Create obligations (pure)                                      │
 │        • createDerivedObligations (adapters + payload anchors)        │
 │        • createCardinalityAdapterObligations (from solver conflicts)  │
 │        • createCycleBreakObligations                                  │
 │        • createMissingInputObligations (newly-added blocks too)       │
 │        • addObligationsIfMissing(graph, derived) — dedup by ID        │
 │    (3) Plan discharge                                                 │
 │        • for each OPEN obligation with satisfied deps:                │
 │          call its policy → PolicyResult (plan | blocked)              │
 │        • collect all plans                                            │
 │    (4) Check convergence                                              │
 │        • if plans.length === 0 AND no new obligations added:          │
 │          → try finalize StrictTypedGraph and RETURN                   │
 │    (5) Apply plans                                                    │
 │        • applyAllPlans(graph, plans) → new DraftGraph                 │
 │        • each plan marks its obligation as DISCHARGED                 │
 │        • loop to next iteration                                       │
 │                                                                       │
 │  If maxIterations exhausted without convergence → NonConvergence.     │
 └─────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────────┐
              │                  DOWNSTREAM                  │
              │  StrictTypedGraph → axis-validate → backend  │
              └──────────────────────────────────────────────┘
```

Each loop iteration is pure up to step (5) — the solvers never mutate, obligations are generated from current state, plans are data, and `applyElaborationPlan` produces a new immutable `DraftGraph` with an incremented revision. Only step (5) changes the graph; the rest of the iteration reads from it.

---

## 2. Data model

### 2.1 DraftGraph — the mutable graph

`src/compiler/frontend/draft-graph.ts`

```ts
interface DraftGraph {
  readonly blocks: readonly DraftBlock[];
  readonly edges: readonly DraftEdge[];
  readonly obligations: readonly Obligation[];
  readonly meta: { readonly revision: number; readonly provenance: string };
}
```

- **Arrays are always sorted by id** for determinism. Bit-identical output across runs is a hard requirement.
- **Revision** bumps once per applied plan, used for idempotency checks.
- **Blocks and edges carry origin** fields distinguishing user-authored content from fixpoint-elaborated content. Obligation-derived blocks and edges have `origin: { kind: 'elaboration', obligationId, role }` so the fixpoint can skip its own output when creating new obligations (prevents infinite loops).

`DraftEdge.role` is one of:
- `userWire` — authored by user
- `defaultWire` — emitted by `defaultSourcePolicyV1` to satisfy a missingInputSource obligation
- `implicitCoerce` — emitted by adapter / cardinality adapter / payload anchor policies
- `internalHelper` — emitted by cycle break policy

`DraftBlock.role` carries a similar `BlockRole` discriminator; derived blocks record `{ kind: 'derived', meta: { kind: 'adapter' | 'defaultSource' | 'cycleBreak' | ..., ... } }` so downstream code can distinguish them semantically without string-matching on block types.

### 2.2 Obligation — deferred work

`src/compiler/frontend/obligations.ts`

An obligation is a record saying "this work needs doing but I can't do it yet." Obligations are created deterministically (same graph + same facts → same obligations), evaluated repeatedly, and discharged when their dependencies are satisfied.

```ts
interface Obligation {
  readonly id: ObligationId;            // deterministic, derived from semantic target
  readonly kind: ObligationKind;
  readonly anchor: ObligationAnchor;    // port? edge? block? laneGroup?
  readonly status: ObligationStatus;    // open | discharged | blocked
  readonly deps: readonly FactDependency[];
  readonly policy: ObligationPolicyRef; // { name, version }
  readonly debug: ObligationDebug;      // createdBy, note
}

type ObligationKind =
  | 'missingInputSource'        // unconnected input port
  | 'needsAdapter'              // edge with resolved-but-mismatched endpoints
  | 'needsCardinalityAdapter'   // cardinality conflict group
  | 'needsCycleBreak'           // algebraic cycle
  | 'needsLaneAlignment'        // (reserved; not seen in main loop)
  | 'needsDomainElaboration'    // (reserved)
  | 'needsPayloadAnchor';       // polymorphic chain with no concrete payload evidence

type ObligationStatus =
  | { kind: 'open' }
  | { kind: 'discharged'; elaborated: { blockIds; edgeIds } }
  | { kind: 'blocked'; reason: string; diagIds: readonly string[] };

type FactDependency =
  | { kind: 'portCanonicalizable'; port }       // port's type is fully resolved
  | { kind: 'portPayloadResolved'; port }       // port's payload is concrete
  | { kind: 'portUnitResolved'; port }          // port's unit is concrete
  | { kind: 'portAxisResolved'; port; axis }    // axis-specific resolution
  | { kind: 'portHasUnresolvedPayload'; port }; // port is KNOWN to still have a var
```

**Key property: deterministic IDs.** Obligation IDs encode the semantic target, not a graph-local identifier. Examples:

- `missingInput:${blockId}:${portId}`
- `needsAdapter:${fromBlockId}:${fromPort}->${toBlockId}:${toPort}`
- `needsCardinalityAdapter:${semanticKey}` where semanticKey is `${from}:${out}->${to}:${in}`
- `needsPayloadAnchor:${edgeSemanticKey}`

Because IDs are deterministic, `addObligationsIfMissing` dedupes trivially with a Set lookup: the same obligation can be "re-generated" every iteration and only the first insertion sticks. No bookkeeping of "have I already added this?" outside the ID itself.

**Dependencies gate policy calls.** The fixpoint driver checks `areDependenciesSatisfied(obligation.deps, facts)` BEFORE calling the policy. A policy never has to handle the "deps not ready yet" case — the driver skips the obligation until next iteration. This keeps policies simple: they either produce a plan or return `blocked` with a reason.

### 2.3 Constraints — what the solvers consume

`extract-constraints.ts` transforms `DraftGraph + registry` into an `ExtractedConstraints` bundle:

```ts
interface ExtractedConstraints {
  // Port types from block definitions (after template var instantiation).
  readonly portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>;

  // Payload+unit constraints consumed by the payload/unit solver.
  readonly payloadUnit: readonly PayloadUnitConstraint[];

  // Cardinality constraints consumed by the cardinality solver.
  readonly cardinality: readonly CardinalityConstraint[];

  // Solver-facing cardinality axes (normalized for solver convenience).
  readonly baseCardinalityAxis: ReadonlyMap<
    DraftPortKey, Axis<CardinalityValue, CardinalityVarId>
  >;

  // Ports that opted out of union-find (each edge validated independently).
  readonly collectPorts: ReadonlySet<DraftPortKey>;

  // Diagnostics for contradictory CT/ICT policy declarations within a block.
  readonly policyDiagnostics: readonly FixpointDiagnostic[];

  // Edge-level verifications run after union-find completes (safety net).
  readonly payloadUnitEdgeVerifications: readonly PayloadUnitEdgeVerification[];
}
```

**Extraction is two-phase:**

- **Phase A — per-block processing.** For each block: instantiate template vars into block-scoped IDs; apply auto-derivation from `BlockPayloadMetadata` (replaces concrete payload with a var + emits `requirePayloadIn` when the block declares polymorphism); emit equality constraints for ports that share a var inside the same block; rewrite cardinality axes from the block's declared CT/ICT policy.

- **Phase B — per-edge processing.** For each edge: emit `payloadEq(from, to)` + `unitEq(from, to)` + cardinality `equal(from, to)` + a matching `EdgeVerification`. Edges targeting collect ports skip unification and instead emit `requirePayloadIn` / `requireUnitless` from the port's `AcceptsSpec`.

**Template var instantiation** is critical: block definitions use template IDs like `payloadVar('const_payload')` shared across block instances. Without alpha-renaming to `p:${blockId}:${templateId}`, two instances of the same block type would collide in the substitution map (last-write-wins). `instantiateTemplateVars` is the single enforcer of this rule.

#### Constraint taxonomy

**Payload/unit constraints** (`PayloadUnitConstraint` in `payload-unit/solve.ts`):

| Kind | Meaning |
|---|---|
| `payloadEq { a, b }` | Two ports must have the same resolved payload |
| `unitEq { a, b }` | Two ports must have the same resolved unit |
| `concretePayload { port, value }` | Port's payload is a fixed concrete value |
| `concreteUnit { port, value }` | Port's unit is a fixed concrete value |
| `requirePayloadIn { port, allowed: PayloadType[] }` | Port's payload must be in an allowed set |
| `requireUnitless { port }` | Port's unit must be `none` (for trig/mul/div/etc.) |

**Cardinality constraints** (`CardinalityConstraint` in `cardinality/solve.ts`):

| Kind | Meaning |
|---|---|
| `equal { a, b }` | Two ports share a cardinality group (UF union) |
| `clampOne { port }` | Port's cardinality is strictly `one` (even in promoteToMany groups) |
| `forceMany { port, instance }` | Port's cardinality is strictly `many(instance)`; instance may be a var |
| `promoteToMany { ports }` | Zip group: one port can stay one while others become many; many evidence propagates across the group via fixpoint |

Every constraint carries a `ConstraintOrigin` (`edge`, `blockRule`, `portDef`, `payloadMetadata`) used for error classification and diagnostic attribution.

### 2.4 Substitution — the solvers' output

Both sub-solvers produce a `Substitution` fragment:

```ts
interface Substitution {
  readonly payloads: ReadonlyMap<string /* var id */, PayloadType>;
  readonly units:    ReadonlyMap<string /* var id */, UnitType>;
  readonly cardinalities: ReadonlyMap<CardinalityVarId, CardinalityValue>;
}
```

(V1 assembles it as `{ payloads, units, cardinalities }` from `solvePayloadUnit` and `solveCardinality` outputs.)

The substitution is **per-variable, not per-port** — multiple ports can share a var via equality constraints, and the solver records one binding for the var rather than one per port. A separate `portPayloads` / `portUnits` map records per-port resolutions (for ports that had a var resolved, OR concrete ports — both paths converge to a concrete value).

### 2.5 TypeFacts — per-port resolved hints

`type-facts.ts`

```ts
interface TypeFacts {
  readonly ports: ReadonlyMap<DraftPortKey, PortTypeHint>;
  readonly instances: ReadonlyMap<string, InstancePorts>;  // InstanceRef → ports
  readonly portAcceptance: ReadonlyMap<DraftPortKey, CardinalityAcceptance>;
}

interface PortTypeHint {
  readonly status: 'ok' | 'unknown' | 'conflict';
  readonly canonical?: CanonicalType;         // present when status==='ok'
  readonly inference?: InferenceCanonicalType; // present when status==='unknown'
  readonly diagIds: readonly string[];
}
```

**TypeFacts is what obligation dependencies query.** It is computed fresh every iteration from the solver output; obligations from prior iterations read *this* iteration's facts when deciding whether they can discharge.

A port is `ok` iff its full `CanonicalType` is constructible from the substitution — no axis is a var, every axis is concrete. If any axis is still a var after the solver runs, the port is `unknown` with an `inference` field. If the solver detected a conflict for that port, it's `conflict`.

`instances` indexes `InstanceRef → ports sharing that instance`, which some obligation dependencies need.

`portAcceptance` pre-extracts CT/ICT-declared `CardinalityAcceptance` (`oneOrMany` / `oneOnly` / `manyOnly`) for ports whose cardinality axis is a declared var with explicit policy. This feeds the "oneOrMany flexibility defers cardinality adapter" logic in `createDerivedObligations`.

### 2.6 ElaborationPlan — the plan discharge output

`elaboration.ts`

```ts
interface ElaborationPlan {
  readonly obligationId: ObligationId;
  readonly role: ElaboratedRole;   // 'defaultSource' | 'adapter' | 'laneAlignHelper' | 'internalHelper'
  readonly addBlocks?:     readonly DraftBlock[];
  readonly addEdges?:      readonly DraftEdge[];
  readonly replaceEdges?:  readonly { remove: string; add: readonly DraftEdge[] }[];
  readonly removeBlockIds?: readonly string[];
  readonly diagnostics?:   readonly FixpointDiagnostic[];
  readonly notes?: string;
}
```

A plan is **purely structural** — it says "add these blocks, add these edges, remove these edges, attach these diagnostics." The application step (`applyElaborationPlan`) is idempotent: if every block/edge a plan would add is already present, it's a no-op. If only some are present, that's corruption (throws).

Plans never do type work. They only rewire the graph. The next iteration's solver will re-derive types from the new graph shape.

### 2.7 StrictTypedGraph — the success output

```ts
interface StrictTypedGraph {
  readonly graph: DraftGraph;
  readonly portTypes: ReadonlyMap<DraftPortKey, CanonicalType>;
  readonly collectEdgeTypes?: ReadonlyMap<string, CanonicalType>;
  readonly diagnostics: readonly unknown[];
}
```

Produced only when:
1. No open obligations remain
2. Every non-collect port has `status: 'ok'` with a concrete `canonical`
3. Collect-port edge types are also all resolved

`tryFinalizeStrict` checks these conditions. If any fail, it returns null and the fixpoint emits `OpenObligation` / unresolved-port diagnostics.

---

## 3. The fixpoint loop in detail

`finalizeNormalizationFixpoint` in `final-normalization.ts`.

```ts
for (let i = 0; i < options.maxIterations; i++) {
  // (1) Solve (pure)
  const { facts, solveDiagnostics, cardinalityConflicts, collectPorts }
    = solveAndComputeFacts(g, registry);

  // (2) Create obligations (pure)
  const derivedObs   = createDerivedObligations(g, facts);
  const cardObs      = createCardinalityAdapterObligations(g, cardinalityConflicts);
  const cycleObs     = createCycleBreakObligations(g, registry);
  const missingObs   = createMissingInputObligations(g, registry);
  const { graph: g2, added } = addObligationsIfMissing(g, [
    ...derivedObs, ...cardObs, ...cycleObs, ...missingObs,
  ]);
  const didMutateObligations = added > 0;
  g = g2;

  // (3) Plan discharge
  const plans = planDischarge(g, facts, registry);

  // (4) Convergence check
  if (plans.length === 0 && !didMutateObligations) {
    // Emit final diagnostics, try StrictTypedGraph, return
    ...
    return { graph: g, facts, strict, diagnostics, iterations: i + 1 };
  }

  // (5) Apply
  if (plans.length > 0) {
    g = applyAllPlans(g, plans);
  }
}

// Exhausted maxIterations → NonConvergence diagnostic
```

### 3.1 Step (1) — Solve

`solveAndComputeFacts` is a pure function that:

1. Calls `extractConstraints(g, registry)` → `ExtractedConstraints`.
2. Builds a port-to-var mapping from `portBaseTypes`.
3. Calls `solvePayloadUnit(payloadUnit, portVarMapping, edgeVerifications)`.
4. Calls `solveCardinality({ ports, baseCardinalityAxis, constraints })`.
5. Partitions cardinality errors into "structural conflicts" (`PromoteToManyClampOneConflict`, `ClampManyConflict` — these become obligations via `createCardinalityAdapterObligations`) and "terminal errors" (others — these become diagnostics directly).
6. Assembles a `Substitution` from both solver outputs.
7. Computes `PortTypeHint` for every port by calling `computePortHint(key, baseType, subst, ...)` — apply substitution, check full canonicalizability, classify as `ok` / `unknown` / `conflict`.
8. Builds the `instances` index from resolved hints.
9. Builds `portAcceptance` from the CT/ICT-declared cardinality axes.

All of this is pure: same graph + same registry → same output. The solver output can be tested in isolation without needing to run the fixpoint.

### 3.2 Step (2) — Create obligations

Four obligation creators run per iteration. Each is a pure function `(graph, facts) → Obligation[]`:

| Creator | Inputs | Produces | Notes |
|---|---|---|---|
| `createDerivedObligations(g, facts)` | DraftGraph + TypeFacts | `needsAdapter`, `needsPayloadAnchor` | Adapter obligations: batched (all mismatched edges). Payload anchor obligations: **at most ONE per iteration** (one polymorphic component at a time). |
| `createCardinalityAdapterObligations(g, cardinalityConflicts)` | DraftGraph + solver conflicts | `needsCardinalityAdapter` | **At most ONE per iteration** (monotone strategy to prevent oscillation). |
| `createCycleBreakObligations(g, registry)` | DraftGraph + registry | `needsCycleBreak` | (Not read in detail for this doc; structure mirrors the others — detect algebraic cycles, pick one boundary edge per iteration.) |
| `createMissingInputObligations(g, registry)` | DraftGraph + registry | `missingInputSource` | Idempotent. Generates obligations for every unconnected exposed port on every block, every iteration. New blocks added by prior-iteration plans get their missing inputs picked up here. |

Results are merged into the graph via `addObligationsIfMissing`, which dedupes by obligation ID.

#### The monotone-one-at-a-time pattern

This is load-bearing and worth highlighting:

- **Adapter obligations** are batched because they are independent — each edge's type mismatch can be fixed in parallel without affecting the others' resolution.
- **Payload anchor obligations** are emitted one per iteration because anchoring one polymorphic component (by inserting `Adapter_PayloadAnchorFloat` on one edge, committing the whole UF group to `float`) changes what the solver can resolve in the next iteration. Anchoring two at once could commit two groups to conflicting types if they secretly shared a variable.
- **Cardinality adapter obligations** are emitted one per iteration because inserting a `Broadcast` block on one boundary edge changes which groups are still in conflict. Inserting multiple simultaneously could over-broadcast.

The rule is: **when a single discharge can invalidate or resolve other pending discharges, emit one per iteration and let convergence unfold gradually.** When discharges are independent, batching is safe.

### 3.3 Step (3) — Plan discharge

`planDischarge(g, facts, registry)` iterates the obligations in deterministic order and, for each OPEN obligation whose deps are satisfied, calls the appropriate policy:

```ts
for (const obligation of g.obligations) {
  if (!isOpen(obligation)) continue;
  if (!areDependenciesSatisfied(obligation.deps, facts)) continue;

  const result = callPolicy(obligation, ctx);
  if (result?.kind === 'plan') plans.push(result.plan);
  // 'blocked' results are ignored in the current code (reserved).
}
```

`callPolicy` dispatches by `obligation.policy.name`:

| Policy name | Handles obligation kind | Location |
|---|---|---|
| `defaultSources.v1` | `missingInputSource` | `policies/default-source-policy.ts` |
| `adapters.v1` | `needsAdapter` | `policies/adapter-policy.ts` |
| `payloadAnchor.v1` | `needsPayloadAnchor` | `policies/payload-anchor-policy.ts` |
| `cardinalityAdapters.v1` | `needsCardinalityAdapter` | `policies/cardinality-adapter-policy.ts` |
| `cycleBreak.v1` | `needsCycleBreak` | `policies/cycle-break-policy.ts` |

Each policy returns `{ kind: 'plan', plan }` with structural mutations, or `{ kind: 'blocked', reason, diagIds }` when it can't proceed even though deps are nominally satisfied (e.g., "no adapter chain found for these types").

**Dependency checking is centralized** in `areDependenciesSatisfied` — policies never have to re-check whether types are resolved. The fixpoint driver is the single enforcer of the "don't call a policy until its deps are ready" rule.

#### Policy behaviors (quick reference)

- **`defaultSourcePolicyV1`** — resolves strategy via `resolveDefaultStrategy(inputDef, perInstance)` (per-instance portDefaults → `InputDef.defaultSource` → polymorphic `DefaultSource` fallback, with `DefaultSourceEvent` for discrete ports). Guards against `UnexpectedConnectedInput` (port already has an edge → blocked, obligation is stale). Two plan shapes: new derived block + edge, OR (time-source path) edge-only wiring to an existing time source block.

- **`adapterPolicyV1`** — looks up the edge, confirms both endpoints are resolved and non-assignable. Calls `findAdapterChain(fromType, toType)` (BFS over V1's adapter rules, supports multi-step chains). If no chain found → blocked with reason. Otherwise emits a plan with N adapter blocks and N+1 edges replacing the original edge.

- **`cardinalityAdapterPolicyV1`** — two strategies based on the source block's identity:
  1. If source is a one-only `DefaultSource` → `buildDefaultSourceFieldReplacementPlan`: remove the `DefaultSource` block entirely, add a `DefaultSourceField` (many-default), wire it to the target port.
  2. Otherwise → `buildBroadcastPlan`: insert a `Broadcast` block on the boundary edge (`source → Broadcast.one`, `Broadcast.field → target`).

- **`payloadAnchorPolicyV1`** — verifies at least one endpoint still has an unresolved payload (otherwise blocked). Inserts `Adapter_PayloadAnchorFloat` on the edge, which provides concrete `float` evidence that anchors the polymorphic chain. Always attaches a `CheaterAdapterUsed` diagnostic (warning; the anchor is a "didn't quite figure it out, defaulted to float" signal).

- **`cycleBreakPolicyV1`** — inserts a `UnitDelay` block on the cycle boundary edge, same shape as the cardinality adapter's broadcast path but with `role: 'internalHelper'`.

### 3.4 Step (4) — Convergence check

```ts
if (plans.length === 0 && !didMutateObligations) {
  // converged
  diagnostics.push(...lastSolveDiagnostics);
  // cardinality conflicts that weren't resolved structurally become diagnostics:
  for (const conflict of cardinalityConflicts) { diagnostics.push(...) }
  const strict = tryFinalizeStrict(g, facts, collectPorts);
  if (!strict) diagnostics.push(...collectStrictFailureDiagnostics(g, facts, collectPorts));
  return { graph: g, facts, strict, diagnostics: dedup(diagnostics), iterations: i + 1 };
}
```

Convergence means: **no new obligations created this iteration AND no plans produced**. Both conditions are required — a purely-obligation iteration (e.g., discovering a new `missingInput` on a newly-added block without being able to plan anything yet) still needs a follow-up iteration to plan it.

If the fixpoint converges with no strict graph, the driver explains why: open obligations (with "depsReady but no plan produced" or "depsNotReady" reasons), plus unresolved ports, become `OpenObligation` / unresolved diagnostics. The return value carries `strict: null` and the caller knows the compile failed.

**Diagnostic handling during iteration** deserves a note: only the FINAL iteration's solver diagnostics are pushed into the final result. Earlier iterations may report `ConflictingUnits` / `ConflictingPayloads` that are resolved structurally by adapter insertion in a subsequent iteration — those "stale" conflicts would be noise if surfaced. `lastSolveDiagnostics` is a rolling buffer of the most recent iteration's solver output, flushed into `diagnostics` only at convergence.

### 3.5 Step (5) — Apply

`applyAllPlans(g, plans)` loops over plans and calls `applyElaborationPlan` for each. Every plan application:

1. Checks idempotency: if all added blocks/edges already exist, no-op. If some exist, throw (corruption).
2. Removes blocks in `removeBlockIds` (and any edges connected to them).
3. Adds blocks in `addBlocks`.
4. Adds edges in `addEdges`.
5. Replaces edges in `replaceEdges` (remove listed IDs, add new ones).
6. Sorts blocks and edges by ID for determinism.
7. Marks the plan's obligation as `{ kind: 'discharged', elaborated: { blockIds, edgeIds } }`.
8. Bumps `meta.revision`.

All operations are non-destructive to the original graph — `applyElaborationPlan` returns a new DraftGraph.

---

## 4. The two pure sub-solvers

Both sub-solvers are self-contained pure functions that can be tested without the fixpoint. This is the decomposition that matters for the pillar port: the solvers don't know about obligations, plans, or fixpoint iteration — they consume a constraint set and return a resolution result.

### 4.1 `solvePayloadUnit` — union-find for payload and unit

`payload-unit/solve.ts`, ~780 lines.

Two independent union-find structures:
- `payloadUF: UnionFind<PayloadType>` over "payload nodes"
- `unitUF:    UnionFind<UnitType>` over "unit nodes"

A "node" is either a **port node** (for ports without a var) or a **var node** (for ports that declare a var). `getPayloadNode(portKey, varInfo)` produces the right one. Using var nodes lets multiple ports unify into one group via the var even when they don't have an explicit `payloadEq` constraint between them.

**Per-group metadata** is tracked by root node id:

```ts
interface PayloadGroupMeta {
  allowedPayloads: PayloadType[] | null;      // intersection of allowed sets
  allowedOrigins: ConstraintOrigin[];
}

interface UnitGroupMeta {
  mustBeUnitless: boolean;
  unitlessOrigins: ConstraintOrigin[];
}
```

When two groups merge via `union`, their metadata merges too: allowed sets intersect, unitless flags OR, origin lists concatenate.

**Phase 1 — constraint processing.** Iterate constraints in order:
- `concretePayload` / `concreteUnit` → `assign` on the port's node. Conflicting concrete values → `ConflictingPayloads` / `ConflictingUnits` error.
- `payloadEq` / `unitEq` → save metadata for both groups, `union`, then merge metadata to winner.
- `requirePayloadIn` → intersect `allowedPayloads` on the group; record origin.
- `requireUnitless` → flip `mustBeUnitless`; record origin.

**Phase 2 — finalization.** For each port:
- Look up the resolved payload. If unresolved but `allowedPayloads.length === 1` → assign that single allowed payload as the resolution. If `allowedPayloads.length === 0` (empty intersection) → `EmptyAllowedSet` error.
- Validate resolved payload against allowed set; error `PayloadNotInAllowedSet` if outside.
- For units: if unresolved and `mustBeUnitless` → assign `unitNone()`. If still unresolved after that → **default to `unitNone()`** and emit a `UnitDefaultedToNone` diagnostic (so polymorphic chains with no unit evidence are treated as unitless). Validate against `mustBeUnitless` otherwise.

**Phase 3 — edge verification (safety net).** For each `EdgeVerification`, look up resolved types for both endpoints and check compatibility. If the verification fails, emit a `PostSolveEdgeTypeMismatch` diagnostic (catches dropped/unapplied constraints). Collect-edge verifications check against `AcceptsSpec` allowed sets.

**Output:**
```ts
interface PayloadUnitSolveResult {
  payloads:     ReadonlyMap<string, PayloadType>;      // var id → resolved
  units:        ReadonlyMap<string, UnitType>;
  portPayloads: ReadonlyMap<DraftPortKey, PayloadType>; // per-port resolved
  portUnits:    ReadonlyMap<DraftPortKey, UnitType>;
  errors:       readonly PUSolveError[];
  diagnostics:  readonly FixpointDiagnostic[];
}
```

Errors are classified:
- `UserPatchTypeError` — origin includes an `edge` (user wired wrong types)
- `BlockDefTooSpecific` — origin includes `payloadMetadata` (block metadata declares polymorphism but concrete value doesn't fit)
- `Unresolved` — everything else

### 4.2 `solveCardinality` — 5-phase cardinality resolver

`cardinality/solve.ts`, ~700 lines.

Two UFs: `CardinalityUF` over ports (groups ports that must share cardinality) and `InstanceUF` over `InstanceTerm`s (unifies concrete `inst` references with `var` references). Group facts per root:

```ts
interface GroupFacts {
  forcedOne: boolean;                 // from clampOne constraints
  forcedManyTerms: InstanceTerm[];    // from forceMany constraints + base axis
  resolved: CardinalityValue | null;  // set in phase 3+
  clampOneOrigins: ConstraintOrigin[];
  forceManyOrigins: ConstraintOrigin[];
}
```

**Phase 1 — Equality UF.** Process `equal(a, b)` constraints; union ports into groups. Merge facts to winner on each union.

**Phase 2 — Collect group facts.**
- From constraints: `clampOne` → `forcedOne = true`; `forceMany` → push instance term onto `forcedManyTerms`.
- From base axis: concrete `many(ref)` entries count as forcedMany evidence (NOT forcedOne — concrete `one` in base types does not clampOne; only explicit constraints do).

**Phase 3 — Local group resolution.** For each root:
- `forcedOne && hasForcedMany` → **`ClampManyConflict`** error. The fixpoint driver will turn this into a `needsCardinalityAdapter` obligation (structural conflict, not terminal error).
- `forcedOne` → `resolved = { kind: 'one' }`.
- `hasForcedMany` → unify all `forcedManyTerms` via `instanceUF.unify(...)` (unification may return an `InstanceConflict` error if two concrete refs disagree). If resolved to an `inst` → `resolved = { kind: 'many', instance }`. If resolved to a `var` → sentinel `resolved = { kind: 'many', instance: { domainTypeId: '__var__', instanceId: varId } }` to be patched in phase 5.
- No evidence → default to `one` and emit `CardinalityDefaultedToOne` diagnostic if the group had any vars (concrete-one ports are intentional).

**Phase 4 — PromoteToMany fixpoint.** Inner fixpoint (while changed) over `promoteToMany` zip sets: for each zip set, find any group resolved to `many`, propagate its `many` to other groups in the same zip set (unless they are `clampOne`, which stay at one and are handled at runtime via `kernelZipPromote`). This phase iterates until no group changes. It is a nested fixpoint INSIDE the outer fixpoint driver — the cardinality solver converges internally before returning to the driver.

If two unrelated groups are both resolved to `many` but have incompatible instance terms, emit `InstanceConflict`.

**Phase 5 — Finalize.** For each group, resolve `many(var)` sentinels by looking up the var in `instanceUF.resolvedVars()`. If unresolved AND the group allows `inherit` instance binding → keep as `UNBOUND_INSTANCE` (backend repair pass handles it later). Otherwise → `UnresolvedInstanceVar` error. Write substitutions: for each port with `axisVar`, map `var → resolved value`.

**The structural-conflict vs terminal-error distinction** is how the solver communicates with the fixpoint driver: conflicts that adapter insertion can fix (`PromoteToManyClampOneConflict`, `ClampManyConflict`) are returned as errors the driver will package into obligations; conflicts that are genuinely terminal (`InstanceConflict`, `UnresolvedInstanceVar`) become diagnostics directly.

---

## 5. Error and diagnostic flow

Every layer produces typed diagnostics with a `diagnosticFlagCode` that links to a severity override table. The fixpoint driver collects them across iterations, dedupes by `stableKey`, and returns them in the result.

**Solver-layer errors:**
- `PUSolveError` (payload/unit) has `errorClass` for classification.
- `CardinalitySolveError` splits into "structural" (become obligations) and "terminal" (become diagnostics).

**Driver-layer diagnostics:**
- `lastSolveDiagnostics` — rolling buffer; only the final iteration's values are pushed to the result, to avoid noise from intermediate conflicts resolved by adapter insertion.
- `cardinalityConflicts` — any cardinality conflict that wasn't resolved structurally after convergence becomes a diagnostic.
- `OpenObligation` — emitted for each still-open obligation at convergence, with a reason of `depsReadyNoPlan` or `depsNotReady`.
- `NonConvergence` — emitted when `maxIterations` is exhausted.

**Dedup** is via `stableKey`. The same conflict detected across iterations produces the same key; `deduplicateDiagnostics` keeps only the first occurrence.

**Post-convergence gate.** After the fixpoint returns, the frontend entry point (`frontend/index.ts`) runs an additional check: for every non-collect, non-forbidden exposed input, verify an inbound edge exists. Missing edges produce `MissingRequiredInput` errors. This is redundant with the fixpoint's own work but serves as a safety net — if the fixpoint somehow leaves an unwired port, the backend never runs.

---

## 6. Graph mutation rules

Several invariants keep the fixpoint from looping or corrupting state:

1. **Elaborated blocks/edges are never re-elaborated.** Obligation creators skip edges with `origin.kind === 'elaboration'`. The one exception: `createMissingInputObligations` processes newly-added blocks (regardless of origin) because a default-source policy might add a block with its own unconnected input that needs wiring.

2. **Obligations are discharged, not deleted.** `applyElaborationPlan` marks the obligation as `{ kind: 'discharged', elaborated }` rather than removing it from the list. The `isOpen` check skips discharged obligations in subsequent iterations.

3. **Deterministic IDs prevent duplicates.** Re-generating the same obligation across iterations is a no-op because `addObligationsIfMissing` dedupes by id.

4. **Idempotent plan application.** If an iteration somehow produces a plan that's already been applied, `applyElaborationPlan` detects it and returns the graph unchanged.

5. **Deterministic ordering.** Block and edge lists are always sorted by id. Obligation iteration in `planDischarge` follows the sorted obligation list. This guarantees bit-identical output across runs — important for reproducibility and diagnostics.

6. **Structural adapter edges ARE elaboration origin, and they bypass new obligation creation.** The `isCardinalityAdapterEdge` helper in `create-cardinality-obligations.ts` checks `edge.origin.obligationId.startsWith('needsCardinalityAdapter:')` to avoid inserting broadcasts on broadcasts in subsequent iterations (infinite loop prevention).

---

## 7. Pillar port guidance

### What maps cleanly

Most of V1's architecture translates directly:

| V1 concept | Pillar equivalent |
|---|---|
| `InferenceCanonicalType` | `ZInferenceCanonicalType` (ds8.1) |
| `CanonicalType` | `ZCanonicalType` (ds8.1) |
| `InputDef.type` + `outputs.type` on BlockDef | `ZBlockContract.inputs[slot].shape` / `outputs[slot].shape` (ds8.2) |
| `DraftGraph` (blocks + edges + obligations + meta) | New pillar equivalent — a mutable version of `NormalizedGraph` with obligations |
| `DraftPortKey` | Pillar equivalent — `${nodeId}:${portId}:${dir}` |
| `Substitution` (`{payloads, units, cardinalities}`) | Direct port; cardinality var ids stay `CardinalityVarId`, payload/unit var ids are branded strings |
| `TypeFacts.ports: Map<DraftPortKey, PortTypeHint>` | Same shape; feed from pillar resolver |
| `TypeFacts.portAcceptance` | Derive from `ZInputFieldContract`-level combine/acceptance (TBD design) |
| `Obligation` | Same shape; pillar policies may differ |
| `ElaborationPlan` | Same shape; pillar blocks instead of V1 DraftBlocks |
| `applyElaborationPlan` | Same mechanism; just works on pillar graph types |
| `finalizeNormalizationFixpoint` | Same loop structure; swap sub-solver invocations for pillar versions |
| Payload/unit union-find solver | Direct port; swap `PayloadType`/`UnitType` for pillar `ZPayloadType`/`ZUnitType` |
| Cardinality solver (5 phases) | Direct port; swap cardinality value types for pillar equivalents |
| Constraint extraction | New pillar version; reads from `ZBlockContract` instead of `BlockDef` |

### What changes

- **No `TypePattern` / `findAdapter(from, to)` dialect.** V1's `src/blocks/adapter-spec.ts` has a parallel type-matching vocabulary with `'same' | 'any'` magic literals. The pillar version does NOT reproduce this. Adapter matching is "iterate catalog, unify input contract against source, unify output contract against target" — the unifier is the matching mechanism. Polymorphism in adapter blocks is expressed via type variables in the adapter's declared port contracts, including nested variables inside concrete unit variants (e.g. `{kind: 'angle', unit: unitVar('U')}`). See `memory/project_pillar_adapters_are_blocks.md`.

- **No separate `AdapterRegistry`.** The catalog of `ZBlockContract`-having blocks IS the registry. Filter by `adapterSpec?` presence to get adapter candidates. `findAdapterCandidates(sourceType, targetType, catalog)` is a pure function in ds8.4 that iterates and tries unification.

- **No `narrowToCanonical` public API.** The "inference → concrete" commit step is a single `ZCanonicalTypeSchema.safeParse` call inside the pillar resolver. The ds8.1 schemas already enforce at parse time that a concrete value contains no variables.

- **Combine mode is a first-class pillar concept on input field contracts.** V1 has `combineMode` on ports but didn't fully integrate it with the type solver; pillar puts it per-field in `ZInputFieldContract.combine` with ds8.2's minimum set (`first | last | sum`). The resolver in ds8.5 must emit the appropriate reducing IR per combine mode — forwarding for `first`/`last` (zero new IR nodes), emitting for `sum` (Add tree). See `memory/project_combine_mode_execution_model.md`.

- **No `layer`, no `collect`/`array`.** V1 has both. Pillar drops `collect` entirely (variadic ports solve what collect hacked around) and defers `layer` until OKLab has a real consumer.

- **Pillar payload kinds are fewer.** V1 has 9 payload kinds including `shape` and `cameraProjection`. Pillar has 7 — no `shape` (new shape system is manifest-level, not a bundle-field payload), no `cameraProjection` (camera system being reworked). See ds8.1 schemas.

- **Pillar unit kinds drop `count`.** V1 declares it but has no producer (unitCount() returns `{kind: 'none'}`). Pillar omits it; integer counts are `int + none`.

- **Template var instantiation still applies.** Pillar blocks declaring variables in their contracts need the same alpha-renaming to block-scoped IDs to prevent substitution-map collisions across instances.

### Decomposition for the pillar solver epic

Rewriting the ds8 epic decomposition to match V1's actual structure:

| Ticket | Scope |
|---|---|
| **ds8.3 — Pure solvers + substitution utilities** | Port `solvePayloadUnit` and `solveCardinality` as pure functions consuming pillar constraint types and producing a `Substitution`. Include `applySubstitution(type, subst)` helper. No unifier API — union-find IS the unifier for each sub-domain. Unit tests exercise the sub-solvers with hand-rolled constraints. |
| **ds8.4 — Adapter spec + candidate search** | Add `adapterSpec?: ZAdapterSpec` to block contracts. Implement `findAdapterCandidates(source, target, catalog)` pure function: iterate adapter-marked blocks, try to unify each. Uses the sub-solvers from ds8.3 internally. Unit tests cover exact-match, variable-match, no-match, multi-candidate ranking. **No `TypePattern`, no registry.** |
| **ds8.5 — Fixpoint driver + constraint extraction + TypeFacts + resolver pass** | The big one. Port `extractConstraints` to read pillar `ZBlockContract`. Port `TypeFacts` / `PortTypeHint` / `StrictTypedGraph`. Port `finalizeNormalizationFixpoint` — the driver loop. Implement per-iteration obligation creators (adapter / cardinality adapter / payload anchor / missing input / cycle break) and per-kind policies (adapters.v1 / cardinalityAdapters.v1 / payloadAnchor.v1 / defaultSources.v1 / cycleBreak.v1). Include the monotone one-at-a-time strategy for payload anchor and cardinality adapter obligations. |
| **ds8.6 — `findInsertableBlocks` query API** | Uses `findAdapterCandidates` from ds8.4 as its core query. Port-side query: look up port's resolved type from cached TypedGraph, iterate catalog, return rankable candidates. Benchmark sub-millisecond per query. |
| **ds8.7 — `validateAxes` gate + invariants** | Port V1's `axis-validate.ts`. Runs after the fixpoint produces a `StrictTypedGraph`. Enforces 17 invariants (category gating for combine modes — e.g. `sum` on `bool` is rejected here — plus event semantics, cardinality hygiene, etc.). Produces diagnostics, does not mutate. |
| **ds8.8 — Migrate 7 existing pillar blocks to `defineBlock` + contracts** | Rewrite each block to declare a `ZBlockContract`. Remove each block's hand-rolled `readConfig` (Zod parse does it). Add `contract` as a mandatory field on `BlockDefinition` in block-api.ts. Walker/lowering consume the contract. Forbidden-pattern test ensures no imports from V1's `src/compiler/frontend/`. |

**Dependency ordering:** `ds8.3 → ds8.4 → ds8.5`, with `ds8.6` and `ds8.7` depending on `ds8.5`, and `ds8.8` at the end.

**What is NOT in these tickets:** any pairwise `unify(a, b)` public API (union-find IS the unifier inside sub-solvers); any `matchesPattern` function; any `AdapterRegistry` class; any `narrowToCanonical` bridge function.

### Risks and design questions

1. **Cardinality solver's "nested fixpoint" property.** Phase 4's inner `while (changed)` loop could in theory be folded into the outer fixpoint driver, but V1's design keeps it internal because PromoteToMany propagation converges within a single solver call without needing new graph mutations. The pillar port should preserve this structure — inner fixpoint for propagation, outer fixpoint for graph mutations.

2. **Determinism requires stable map iteration and sorted lists everywhere.** Maps that feed into the solvers MUST be iterated in insertion order (or re-sorted). V1 is consistent about this; the pillar port will need to be too. Any non-determinism in obligation id ordering, constraint extraction order, or substitution building will show up as flaky tests.

3. **The "what counts as progress" question.** V1's convergence rule is "no new plans AND no new obligations." A pathological case: iteration N adds an obligation whose deps are never satisfied and whose policy never produces a plan. The obligation remains open forever without producing new state — `didMutateObligations === false` on iteration N+1 because the obligation already exists (dedup). So convergence correctly detects this as a stable failed state. The fixpoint exits and `OpenObligation` diagnostics explain why.

4. **Diagnostic suppression vs transparency.** The "only final iteration's solver diagnostics are surfaced" rule is pragmatic but subtle. A user might see a confusing message like "ConflictingUnits" on iteration 3, then it disappears after a broadcast is inserted and the group resolves cleanly. That's correct behavior (noise suppression) but worth documenting.

5. **maxIterations = 20 in V1.** Arbitrary but has been sufficient for the V1 block library. For the pillar port, start with the same value and raise if a real graph trips it. Track iterations-to-convergence as a metric in tests.

6. **Policies can return `blocked`.** The current V1 code has comments saying `'blocked' results will be handled when policies are implemented` — in practice, blocked results are ignored in `planDischarge` and the obligation stays open, eventually producing an `OpenObligation` diagnostic at convergence. The pillar port should decide whether to surface `blocked` reasons earlier (e.g. when the reason is non-recoverable, fail fast).

---

## 8. Appendix — file map

| File | Lines | Role |
|---|---|---|
| `frontend/final-normalization.ts` | 829 | Fixpoint driver; `solveAndComputeFacts`, `planDischarge`, `tryFinalizeStrict`, diagnostic dedup |
| `frontend/extract-constraints.ts` | 606 | DraftGraph → constraints; Phase A (per-block) + Phase B (per-edge); template var instantiation; cardinality policy rewriting |
| `frontend/payload-unit/solve.ts` | 777 | Union-find sub-solver for payload + unit; per-group metadata (allowed sets, unitless); post-solve edge verification |
| `frontend/cardinality/solve.ts` | 697 | 5-phase cardinality sub-solver; port UF + instance UF; PromoteToMany inner fixpoint |
| `frontend/type-facts.ts` | 125 | `PortTypeHint`, `TypeFacts`, `StrictTypedGraph`, `draftPortKey` |
| `frontend/obligations.ts` | 129 | Obligation types + helpers (`isOpen`, `discharged`, `blocked`) |
| `frontend/fixpoint-diagnostic.ts` | 32 | Typed diagnostic for the fixpoint layer |
| `frontend/elaboration.ts` | 45 | `ElaborationPlan` shape |
| `frontend/apply-elaboration.ts` | 125 | Plan application — idempotent graph mutation |
| `frontend/create-derived-obligations.ts` | 265 | Adapter + payload anchor obligations; payload anchor is one-per-iteration |
| `frontend/create-cardinality-obligations.ts` | 195 | Cardinality adapter obligations from solver conflicts; one-per-iteration monotone |
| `frontend/create-cycle-break-obligations.ts` | 326 | Cycle break obligations (not read in detail for this doc) |
| `frontend/policies/policy-types.ts` | 74 | `PolicyContext`, `PolicyResult`, policy interfaces |
| `frontend/policies/default-source-policy.ts` | 224 | Default source strategy resolution + plan building |
| `frontend/policies/adapter-policy.ts` | 148 | Adapter insertion via `findAdapterChain` (BFS) |
| `frontend/policies/cardinality-adapter-policy.ts` | 194 | Broadcast insertion or DefaultSourceField replacement |
| `frontend/policies/payload-anchor-policy.ts` | 118 | `Adapter_PayloadAnchorFloat` insertion + CheaterAdapterUsed warning |
| `frontend/policies/cycle-break-policy.ts` | 103 | UnitDelay insertion on cycle boundary edge |
| `frontend/policies/type-compatibility.ts` | 129 | `isEdgeTypeCompatible`, `acceptsBroadcast`, `isOneManyMismatchOnly` oracle |
| `frontend/draft-graph.ts` | 385 | DraftGraph types + `buildDraftGraph` from Patch + initial obligation creation |
| `blocks/adapter-spec.ts` (V1) | 704 | Legacy `TypePattern` dialect + `findAdapter` / `findAdapterChain`. **Do NOT port. Reference for what the pillar system explicitly replaces.** |
| `frontend/axis-validate.ts` | 322 | Post-solve invariant gate (17 rules). Target for pillar ds8.7. |

Total solver code (excluding axis-validate, adapter-spec): ~5,400 lines.

---

**End of walkthrough.** Future ds8 agents: read this before proposing a decomposition. Then read `memory/project_pillar_adapters_are_blocks.md` and `memory/project_combine_mode_execution_model.md` for the two load-bearing design corrections specific to the pillar port.
