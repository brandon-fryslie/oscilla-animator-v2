# Cardinality Solver for Final Normalization Fixpoint

## Context

The fixpoint loop in `final-normalization.ts` only solves payload/unit. Cardinality solving is explicitly deferred (line 160: "Cardinality solving is deferred"). This plan adds the cardinality solver as a pure, substitution-based component that integrates into the fixpoint without per-port overrides, placeholder instances, or legacy broadcast hacks.

## Core Architecture Decisions

**1. Substitution-only output.** The solver returns `Map<CardinalityVarId, CardinalityValue>` + `Map<InstanceVarId, InstanceRef>` — no per-port overrides. Ports that can vary must be `axisVar`, not `axisInst(one)`.

**2. axisVar for solvable ports.** `extractConstraints()` assigns `axisVar(cardVarIdForPort(key))` to all ports whose block cardinality mode allows variation. Only structurally-fixed ports keep `axisInst`. Explicit rules per block mode:
- **signalOnly** → all ports: `axisInst(one)`, emit `clampOne(port)`
- **transform outputs** → `axisInst(many(instanceRef(meta.domainType, blockId)))` (deterministic, no placeholder)
- **transform inputs** → `axisVar(cardVarIdForPort(key))`
- **preserve** → all ports: `axisVar(cardVarIdForPort(key))`
- **fieldOnly inputs** → `axisVar(cardVarIdForPort(key))`, emit `forceMany(port, var(instanceVarId(...)))`
- **fieldOnly outputs** (if any) → `axisVar(cardVarIdForPort(key))`

**3. No placeholder instances.** `extractConstraints()` generates deterministic instance refs for transform outputs: `instanceRef(meta.domainType, blockId)`. No `{domainTypeId:'default', instanceId:'default'}` reaches the solver.

**4. Edges are equality constraints.** No separate `edgePairs` input. `extractConstraints()` emits `equal(fromKey, toKey)` cardinality constraints for each edge.

**5. Clean 5-phase algorithm.** No `pendingOne` deferral, no suppressed conflicts, no "external zip output safety check." With proper `axisVar`, the algorithm is clean and monotone.

**6. Signal→field: Option 2 (adapter-resolvable mismatch).** When a `clampOne` port is in a zip group where another member is `many`, the solver reports a conflict. TypeFacts distinguishes hard conflicts (truly unsatisfiable) from adapter-resolvable mismatches (individually canonicalizable endpoints whose pairing is incompatible). The adapter/obligation system can create `needsAdapter` for the mismatch, insert a Broadcast block, and re-solve on the next fixpoint iteration.

**7. TypeFacts.instances index.** The solver's `instances` map enables a canonical instance→ports index in TypeFacts, powering debugging ("show all ports sharing this instance") and future policies (lane alignment, domain elaboration).

---

## Files to Create

### `src/compiler/frontend/cardinality/solve.ts`

**Types:**

```ts
// ---- InstanceTerm (constraint representation, solver-internal) ----
type InstanceTerm =
  | { kind: 'inst'; ref: InstanceRef }      // concrete
  | { kind: 'var'; id: InstanceVarId }       // existential

// ---- Constraints ----
type CardinalityConstraint =
  | { kind: 'equal'; a: DraftPortKey; b: DraftPortKey }
  | { kind: 'clampOne'; port: DraftPortKey }
  | { kind: 'forceMany'; port: DraftPortKey; instance: InstanceTerm }
  | { kind: 'zipBroadcast'; ports: readonly DraftPortKey[] }

// ---- Input ----
interface CardinalitySolveInput {
  ports: readonly DraftPortKey[];    // stable sorted
  baseCardinalityAxis: ReadonlyMap<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>;
  constraints: readonly CardinalityConstraint[];
  trace?: boolean;
}

// ---- Output ----
interface CardinalitySolveResult {
  cardinalities: ReadonlyMap<CardinalityVarId, CardinalityValue>;
  instances: ReadonlyMap<InstanceVarId, InstanceRef>;
  errors: readonly CardinalitySolveError[];
}
```

**Determinism requirements:**
- `zipBroadcast.ports` arrays: sorted and deduped by the solver before processing
- UF tie-breakers: union by rank; when ranks equal, lower lexicographic node ID wins
- Diagnostic anchoring: smallest DraftPortKey in the conflict group

**Algorithm (5 phases):**

| Phase | Purpose | Detail |
|-------|---------|--------|
| 1 | Equality UF | Build UF from `equal(a,b)`. Each port gets a node. Equal ports share a group. |
| 2 | Collect group facts | Per equality group: scan `clampOne` → `forcedOne=true`; scan `forceMany` → `forcedManyTerms[]`; scan base axis `axisInst(many(ref))` → `forcedManyTerms[inst(ref)]`. **forcedOne comes ONLY from clampOne constraints**, never from bare `axisInst(one)` in base types — this prevents mis-annotated block defs from silently cementing mistakes. |
| 3 | Local group resolution | `forcedOne && forcedMany → conflict`. `forcedOne → one`. `forcedMany → unify instance terms → many(term)`. Else → unknown. Instance unification via instance UF. |
| 4 | ZipBroadcast fixpoint | For each zip set: if any member group is `many(term)`, propagate `many(term)` to all member groups. Unify instance terms. Conflict if any member is `one` while propagation would set `many`. No-op if nothing many. Repeat until stable. |
| 5 | Finalize | Unknown group → `UnresolvedCardinality`. `many(var)` unresolved → `UnresolvedInstanceVar`. **Var→group mapping**: for each port P in group G with resolved cardinality, if `baseCardinalityAxis(P)` is `axisVar(v)`, set `cardinalities[v] = finalCardinality`. Multiple vars can legitimately map to the same value via the group. For each instance var → resolved concrete `InstanceRef`, set `instances[varId] = ref`. |

**Internal UF classes:**
- `CardinalityUF`: groups ports, tracks `forcedOne`/`forcedManyTerms` per group. Union by rank with lexicographic tiebreak.
- `InstanceUF`: unifies `InstanceTerm` values, resolves vars to concrete refs.

### `src/compiler/frontend/cardinality/__tests__/solve.test.ts`

Test scenarios:
1. Empty graph → empty substitution
2. signalOnly → all vars bound to `one`
3. transform → outputs concrete `many(ref)`, propagates through edges to preserve inputs
4. preserve equality → many propagates across equal ports
5. zipBroadcast → var + many → all many; no-op when all unknown
6. Instance unification: two concrete refs in same zip → mismatch error
7. Unresolved cardinality → `UnresolvedCardinality`
8. Unresolved instance var → `UnresolvedInstanceVar`
9. Signal→zip conflict: `clampOne` port in zip with `many` member → conflict diagnostic
10. Multiple vars per group: two ports with different var IDs in same equality group → both map to same resolved value

---

## Files to Modify

### `src/core/ids.ts` — Add InstanceVarId

```ts
export type InstanceVarId = Brand<string, 'InstanceVarId'>;
export const instanceVarId = (s: string) => s as InstanceVarId;
```

### `src/compiler/frontend/extract-constraints.ts` — Major changes

**A. New constraint types.** Replace `DraftCardinalityConstraint` with the 4 constraint types from the solver module. Import `CardinalityConstraint`, `InstanceTerm` from `./cardinality/solve`. Update `ExtractedConstraints`:
- Replace `cardinality: readonly DraftCardinalityConstraint[]` with `cardinality: readonly CardinalityConstraint[]`
- Add `baseCardinalityAxis: ReadonlyMap<DraftPortKey, Axis<CardinalityValue, CardinalityVarId>>`
- Remove `edgePairs` field

**B. axisVar assignment for solvable ports.** After collecting port base types from block defs, rewrite cardinality axis:
- `signalOnly` → keep `axisInst(one)`, emit `clampOne(port)`
- transform outputs with `many(placeholder)` → replace with `axisInst(many(instanceRef(meta.domainType, blockId)))`
- transform inputs → replace with `axisVar(cardinalityVarId('card:' + blockId + ':' + portName + ':' + dir))`
- preserve (all ports) → replace with `axisVar(cardinalityVarId('card:' + blockId + ':' + portName + ':' + dir))`
- fieldOnly inputs → replace with `axisVar(...)`, emit `forceMany(port, var(instanceVarId('fieldOnly:' + blockId + ':' + portName)))`
- fieldOnly outputs → replace with `axisVar(...)`

**C. Edge → equal cardinality constraints.** In Phase B (edge processing), emit `{ kind: 'equal', a: fromKey, b: toKey }` into cardinality constraints for each edge.

**D. Block constraint generation.** Rewrite `gatherBlockCardinalityConstraints()`:
- `signalOnly` → `clampOne(port)` for each port
- `transform` → `forceMany(output, inst(instanceRef(meta.domainType, blockId)))` for outputs. If `allowZipSig`, `zipBroadcast` over ports with `axisVar` cardinality only (excludes fixed outputs).
- `preserve (strict)` → pairwise `equal` across all ports within block
- `preserve + allowZipSig` → `zipBroadcast` over all ports (all are `axisVar`)
- `fieldOnly` → `forceMany(input, var(instanceVarId('fieldOnly:' + blockId + ':' + portName)))` for inputs

**E. Build `baseCardinalityAxis` map.** Extract `extent.cardinality` from each rewritten `portBaseTypes` entry. Return as a separate field in `ExtractedConstraints`.

### `src/compiler/frontend/type-facts.ts` — Add instance index

```ts
interface InstancePorts {
  readonly ref: InstanceRef;
  readonly ports: readonly DraftPortKey[];
}

interface TypeFacts {
  readonly ports: ReadonlyMap<DraftPortKey, PortTypeHint>;
  readonly instances: ReadonlyMap<string, InstancePorts>; // key: `${domainTypeId}:${instanceId}`
}
```

Add helper:
```ts
function instanceKey(ref: InstanceRef): string {
  return `${ref.domainTypeId}:${ref.instanceId}`;
}
```

Update `EMPTY_TYPE_FACTS` to include `instances: new Map()`.

### `src/compiler/frontend/final-normalization.ts` — Wire solver + instance index

**In `solveAndComputeFacts()` (after payload/unit solving):**

```ts
const cardResult = solveCardinality({
  ports: [...extracted.portBaseTypes.keys()].sort(),
  baseCardinalityAxis: extracted.baseCardinalityAxis,
  constraints: extracted.cardinality,
});

for (const error of cardResult.errors) {
  solveDiagnostics.push({ kind: 'CardinalityConstraintError', ... });
}
```

**Substitution construction:**

```ts
const subst: Substitution = {
  payloads: puResult.payloads,
  units: puResult.units,
  cardinalities: cardResult.cardinalities,
};
```

**`computePortHint()` — NO changes.** `applyPartialSubstitution()` already resolves cardinality vars via `tryResolveAxis(axis, subst.cardinalities)`. With `axisVar` in base types and solved substitutions, canonicalizability works automatically.

**Build instance index after port hints:**

```ts
function buildInstanceIndex(
  portHints: ReadonlyMap<DraftPortKey, PortTypeHint>
): ReadonlyMap<string, InstancePorts> {
  const byKey = new Map<string, { ref: InstanceRef; ports: DraftPortKey[] }>();
  for (const [port, hint] of portHints) {
    if (hint.status !== 'ok' || !hint.canonical) continue;
    const card = hint.canonical.extent.cardinality;
    if (!isAxisInst(card) || card.value.kind !== 'many') continue;
    const key = instanceKey(card.value.instance);
    let entry = byKey.get(key);
    if (!entry) { entry = { ref: card.value.instance, ports: [] }; byKey.set(key, entry); }
    entry.ports.push(port);
  }
  const instances = new Map<string, InstancePorts>();
  for (const [k, v] of byKey) {
    instances.set(k, { ref: v.ref, ports: v.ports.sort() });
  }
  return instances;
}
```

Return `{ ports, instances }` as `TypeFacts`.

### `src/compiler/frontend/__tests__/final-normalization.test.ts` — Integration tests

- Const → Add: both stay `one` (Const is signalOnly → clampOne propagates through edge)
- Array → Add: Add input becomes `many` (Array output forceMany propagates through edge equality)
- `TypeFacts.instances` populated correctly with instance→ports grouping
- strict finalization succeeds when all cardinalities resolved
- strict finalization fails (returns null) when unresolved cardinality exists

---

## Key Reuse

| Existing code | Reused how |
|---|---|
| `Substitution.cardinalities` | Already in interface, handled by `applyPartialSubstitution()`, `finalizeInferenceType()`, `isInferenceCanonicalizable()` |
| `Axis<T,V>`, `axisVar()`, `axisInst()`, `isAxisVar()`, `isAxisInst()` | Base type representation + guards |
| `CardinalityValue`, `InstanceRef` | Canonical types — solver output uses these |
| `CardinalityVarId`, `cardinalityVarId()` | Factory for deterministic var IDs |
| UF pattern from `solve-payload-unit.ts` | Same generic UF structure adapted for cardinality |

## Legacy Path

The old `solve-cardinality.ts` remains for the legacy `analyze-type-constraints.ts` path. Deleted when legacy frontend is removed. New solver lives in `cardinality/solve.ts`.

## Implementation Order

1. Add `InstanceVarId` to `src/core/ids.ts`
2. Create `src/compiler/frontend/cardinality/solve.ts` — types + algorithm
3. Create `src/compiler/frontend/cardinality/__tests__/solve.test.ts` — solver unit tests
4. Modify `src/compiler/frontend/extract-constraints.ts` — new constraint types, axisVar assignment, edge→equal, deterministic instance refs
5. Modify `src/compiler/frontend/type-facts.ts` — add `InstancePorts`, instance index, `instanceKey()`
6. Modify `src/compiler/frontend/final-normalization.ts` — wire solver, build instance index, add cardinalities to substitution
7. Extend `src/compiler/frontend/__tests__/final-normalization.test.ts` — integration tests
8. Run full verification

## Verification

```bash
npm run typecheck
npx vitest run src/compiler/frontend/cardinality/__tests__/solve.test.ts
npx vitest run src/compiler/frontend/__tests__/final-normalization.test.ts
npx vitest run src/compiler/frontend/__tests__/extract-constraints.test.ts
npx vitest run src/compiler/frontend/__tests__/
npm run test
```
