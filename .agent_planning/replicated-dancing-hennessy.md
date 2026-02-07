# Cardinality Solver for Final Normalization Fixpoint

## Context

The fixpoint loop in `final-normalization.ts` runs Solve → Derive Obligations → Plan Discharge → Apply, but only solves payload/unit constraints today. Cardinality solving is explicitly deferred (line 160-161: "Cardinality solving is deferred — will be added when cardinality solver is adapted for DraftGraph").

An old solver exists at `solve-cardinality.ts` operating on legacy `PortKey` (blockIndex-based). This plan creates a new solver for `DraftPortKey` (blockId-based) that plugs into the fixpoint.

## Files to Create

### `src/compiler/frontend/solve-draft-cardinality.ts` — New solver

**Input/Output types:**

```ts
interface DraftCardinalitySolveInput {
  portBaseTypes: ReadonlyMap<DraftPortKey, InferenceCanonicalType>;
  constraints: readonly DraftCardinalityConstraint[];
  edgePairs: readonly { from: DraftPortKey; to: DraftPortKey }[];
  trace?: boolean;
}

interface DraftCardinalitySolveResult {
  portCardinalities: ReadonlyMap<DraftPortKey, CardinalityValue>;  // per-port overrides
  cardinalityVars: ReadonlyMap<CardinalityVarId, CardinalityValue>; // axis var substitutions
  errors: readonly DraftCardinalitySolveError[];
}
```

Why both outputs: Most ports have concrete `axisInst(one)` cardinality in their base type (from `inferType()` defaults). Preserve blocks like Add need per-port overrides when the solver resolves them to `many`. The `cardinalityVars` map handles the rare `axisVar` case (only Expression block uses it).

**Algorithm (5 phases, adapted from old solver):**

| Phase | Purpose | Key detail |
|-------|---------|------------|
| 1 | Create UF nodes, process constraints | `equal` → union ports; `zipBroadcast` → record group, keep independent; `fixed` → assign value |
| 2 | Seed from port base types | Read `extent.cardinality` from `InferenceCanonicalType`. Defer `one` for zip members as `pendingOne` |
| 3 | Edge propagation | Union edge endpoints. Suppress one-vs-many on zip members (broadcast case) |
| 4 | ZipBroadcast fixpoint | Propagate best `many` to group. Safety: don't commit `pendingOne` to UF root shared with external zip output. Phase 4b: commit remaining deferred ones |
| 5 | Finalization | Read resolved cardinality per port. Emit `portCardinalities` + `cardinalityVars`. Unresolved → error |

**Internal UF:** `DraftCardinalityUnionFind` class (same structure as old `CardinalityUnionFind`), keyed by `DraftPortKey`-derived node IDs. Reuses `cardinalitiesEqual()` and `preferConcreteCardinality()` helpers from old solver (placeholder-aware comparison).

**Placeholder instances:** Block defs (Array, Broadcast) use `{ domainTypeId: 'default', instanceId: 'default' }` as placeholders that get upgraded to concrete refs during solving. The spec says "no placeholders" but block defs embed them — we retain the placeholder pattern for now, matching the old solver. Tracked as future cleanup.

### `src/compiler/frontend/__tests__/solve-draft-cardinality.test.ts` — Unit tests

Test scenarios:
1. Empty input → empty output
2. `signalOnly` (fixed one) → all ports resolve to `one`
3. Transform block → output resolves to `many(concrete instance)`
4. Preserve block edge propagation: `many` source → preserve block becomes `many`
5. ZipBroadcast: signal + field inputs → all resolve to `many`
6. Pending-one deferral for zip members
7. External zip output safety check (Phase 4 critical path)
8. Placeholder → concrete instance upgrade
9. `axisVar` cardinality resolution (Expression block pattern)
10. Instance mismatch → `CardinalityConflict` error
11. Unresolved cardinality → `UnresolvedCardinality` error

## Files to Modify

### `src/compiler/frontend/final-normalization.ts` — Wire solver into fixpoint

**In `solveAndComputeFacts()` (after line 154):**

```ts
// 3.5) Run cardinality solver
const cardResult = solveDraftCardinality({
  portBaseTypes: extracted.portBaseTypes,
  constraints: extracted.cardinality,
  edgePairs: extracted.edgePairs,
});

for (const error of cardResult.errors) {
  solveDiagnostics.push({
    kind: 'CardinalityConstraintError',
    subKind: error.kind,
    port: error.port,
    message: error.message,
  });
}
```

**In substitution construction (line 157-162):**

```ts
const subst: Substitution = {
  payloads: puResult.payloads,
  units: puResult.units,
  cardinalities: cardResult.cardinalityVars, // NEW
};
```

**In `computePortHint()` — add `portCardinalities` param:**

After payload/unit override (line 210), override cardinality axis:

```ts
const portCard = portCardinalities.get(key);
if (portCard) {
  effectiveType = {
    ...effectiveType,
    extent: { ...effectiveType.extent, cardinality: axisInst(portCard) },
  };
}
```

Update call site in loop (line 168) to pass `cardResult.portCardinalities`.

### `src/compiler/frontend/__tests__/final-normalization.test.ts` — Integration tests

Add tests verifying TypeFacts include correct cardinality:
- Const → Add: both stay `one`
- Array → Add: Add becomes `many`
- `StrictTypedGraph` entries have correct cardinality axis

## Key Reuse

| Existing code | Reused how |
|---|---|
| `extractConstraints()` | Already produces `DraftCardinalityConstraint[]` + `edgePairs` — consumed directly |
| `Substitution.cardinalities` | Already in interface, already handled by `applyPartialSubstitution()` and `finalizeInferenceType()` |
| `CardinalityUnionFind` pattern | Algorithm and helpers adapted from `solve-cardinality.ts` |
| `isAxisInst()` / `isAxisVar()` | Used to read port base type cardinalities |
| `axisInst()` | Used to construct override cardinality in `computePortHint` |

## Implementation Order

1. Create `solve-draft-cardinality.ts` — types + algorithm (self-contained, pure function)
2. Create `__tests__/solve-draft-cardinality.test.ts` — unit tests
3. Modify `final-normalization.ts` — wire solver + update `computePortHint`
4. Extend `__tests__/final-normalization.test.ts` — integration tests
5. Verify: `npm run typecheck && npx vitest run src/compiler/frontend/__tests__/`

## Verification

```bash
npm run typecheck                                           # no type errors
npx vitest run src/compiler/frontend/__tests__/solve-draft-cardinality.test.ts  # new solver tests
npx vitest run src/compiler/frontend/__tests__/final-normalization.test.ts      # integration tests
npx vitest run src/compiler/frontend/__tests__/              # all frontend tests
npx vitest run src/compiler/__tests__/                       # compiler tests
npm run test                                                 # full suite
```
