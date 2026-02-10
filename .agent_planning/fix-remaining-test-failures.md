# fix-remaining-test-failures

## Context

After the type system refactor (fixpoint normalization, payload/unit solver rewrite, composite expansion rewrite, unit audit, adapter system), ~60 non-HCL tests are failing across 19 test files. HCL demo failures are being handled by another agent.

The failures cluster into 5 distinct root causes. The highest-impact fix (RC1) alone resolves ~50 tests.

---

## RC1: Domain hierarchy in cardinality solver (~50 tests)

**Root cause**: The cardinality solver's `unify()` at `src/compiler/frontend/cardinality/solve.ts:244-248` does strict equality on `domainTypeId`. When `Broadcast` (uses `DOMAIN_SHAPE`) and `Array` (uses `DOMAIN_CIRCLE`) appear in the same graph, they produce conflicting instance refs (`shape:bN` vs `circle:bN`). The solver doesn't understand that `DOMAIN_CIRCLE` is a child of `DOMAIN_SHAPE` per the domain registry (`src/core/domain-registry.ts:109-113`).

**Affected tests**: All tests using Ellipse+Array+Layout+RenderInstances2D+Broadcast patterns (StepDebugSession, executeFrameStepped, conditional-breakpoints, temporal-comparison, why-not-evaluated, render-scale-offset, compile.test, expr-to-block-mapping, steel-thread, value-expr-cardinality-invariants, math-field-paths, CompilationInspectorService).

**Fix**: In `unify()`, when two concrete instances have different `domainTypeId` values, check if one is an ancestor of the other via the domain registry. If so, resolve to the child (more specific) domain:

```
// src/compiler/frontend/cardinality/solve.ts:244-248
if (va.kind === 'inst' && vb.kind === 'inst') {
  if (va.ref.instanceId !== vb.ref.instanceId) {
    // Different instances — always conflict
    return `Instance conflict: ...`;
  }
  if (va.ref.domainTypeId !== vb.ref.domainTypeId) {
    // Same instanceId, different domain — check hierarchy
    const resolved = resolveByDomainHierarchy(va.ref.domainTypeId, vb.ref.domainTypeId);
    if (!resolved) {
      return `Instance conflict: ...`;
    }
    // Use the child (more specific) domain
    // Update the winning value's ref to use the resolved domain
  }
}
```

Need a helper `resolveByDomainHierarchy(a, b)` that walks `DOMAIN_TYPES` parents to check if one is an ancestor of the other, returning the child if so.

**Files to modify**:
- `src/compiler/frontend/cardinality/solve.ts` — update `unify()` and add domain hierarchy resolution
- `src/core/domain-registry.ts` — add exported `isAncestorDomain(ancestor, descendant)` helper (using existing `DOMAIN_TYPES` map)

---

## RC2: Auto cycle-break prevents illegal cycle detection (2 tests)

**Root cause**: The fixpoint engine creates `needsCycleBreak` obligations and inserts `UnitDelay` blocks to break cycles BEFORE `analyzeCycles()` runs (Step 7). By the time cycle analysis runs, cycles are already legal-feedback (because UnitDelay is stateful). Tests expect illegal cycles but get legal-feedback.

**Affected tests**:
- `src/compiler/frontend/__tests__/frontend-independence.test.ts` — "reports illegal cycles without backend failure"
- `src/compiler/backend/__tests__/backend-preconditions.test.ts` — "fails when Frontend indicates backendReady=false"

**Fix**: Update test expectations. The fixpoint correctly auto-resolves cycles — this is the intended behavior. Tests should:
1. Verify that cycles are resolved as `legal-feedback` (not illegal)
2. Or test cycle detection at the DraftGraph level (before fixpoint) if testing the raw cycle classifier

**Files to modify**:
- `src/compiler/frontend/__tests__/frontend-independence.test.ts` — update cycle assertion
- `src/compiler/backend/__tests__/backend-preconditions.test.ts` — update to test a different backend precondition failure mode (not cycle-dependent)

---

## RC3: Adapter BFS picks UnitCast over Broadcast (2 tests)

**Root cause**: `findAdapterChain()` BFS in `src/blocks/adapter-spec.ts:660-705` checks `isRuleOutputCompatibleWithDest()` which uses the rule's `to` pattern (not actual output type). UnitCast has `to: { extent: 'any' }` so it matches any destination extent pattern — even field (many cardinality). But UnitCast has `cardinality: 'preserve'`, so its ACTUAL output stays signal (one). The BFS treats it as a valid 1-step signal→field conversion when it isn't.

Separately, the multi-step degrees→phase01 test gets a 1-step match because an overly broad adapter (like ScalarToPhase01 with `from.unit: 'any'`) matches degrees as a valid input.

**Affected tests**:
- `adapter-policy.test.ts` — "produces a plan with Broadcast adapter for signal→field mismatch"
- `adapter-policy.test.ts` — "multi-step chain: degrees → phase01 inserts 2 adapters and 3 edges"

**Fix**: In the BFS (lines 670-681), after `applyAdapterTransform()` computes the actual output type, verify assignability against the destination using `isAssignable(outputType, dst)` instead of the pattern-based `isRuleOutputCompatibleWithDest()` check:

```
// Replace lines 673-674 with:
if (isAssignable(outputType, dst)) {
```

This catches UnitCast because its actual output preserves signal extent (one), which is NOT assignable to field (many). For the degrees→phase01 case, ScalarToPhase01's `from.unit: 'any'` issue likely needs an additional fix: either tighten ScalarToPhase01's from pattern to require `unit: { kind: 'none' }`, or add priority-based tie-breaking to the BFS solution sort.

**Files to modify**:
- `src/blocks/adapter-spec.ts` — fix BFS solution check in `findAdapterChain()`
- Potentially `src/blocks/adapter/scalar-to-phase01.ts` — tighten from.unit if needed

---

## RC4: Default source fixpoint for bare blocks (4 tests)

**Root cause**: `missingInputSource` obligations have deps `[{ kind: 'portCanonicalizable', port: ... }]` (set at `src/compiler/frontend/draft-graph.ts:206`). For a bare `Add` block with no edges, the solver has no concrete evidence to fully resolve port types — payload/unit vars may default to float/none, but the `portCanonicalizable` check may still fail if the full extent isn't resolved. The default source policy itself doesn't USE type information — it just creates blocks + edges.

**Affected tests**:
- `default-source-fixpoint.test.ts` — 3 tests (dsBlocks.length=0, open obligations remain, no trace events)
- `default-source-policy.test.ts` — 1 test ("Const strategy produces plan")

**Fix**: Remove or relax the dep on missingInputSource obligations. The policy creates structural mutations (blocks + edges) that don't require type resolution. Type inference happens in subsequent fixpoint iterations after the default source block is wired in.

Change dep from `portCanonicalizable` to empty deps `[]` in `buildDraftGraph()`:

```typescript
// src/compiler/frontend/draft-graph.ts:206
deps: [],  // Default source insertion doesn't need type resolution
```

Also update the `default-source-policy.test.ts` helper that manually creates obligations with this dep.

**Files to modify**:
- `src/compiler/frontend/draft-graph.ts` — remove dep from missingInputSource obligations
- `src/compiler/frontend/__tests__/default-source-policy.test.ts` — update test obligation deps

---

## RC5: Unknown block type not rejected (2 tests)

**Root cause**: Unknown block types are only detected during backend lowering (`lower-blocks.ts:375`). The `compile.ts` reachability filter (lines 155-197) downgrades errors on unreachable blocks to warnings. A disconnected unknown block has no edges, so it's unreachable, and its error is silently downgraded.

**Affected tests**:
- `initial-compile-invariant.test.ts` — "rejects a patch with an unknown block type"
- `compile.test.ts` — "reports unknown block types"

**Fix**: Detect unknown block types in the frontend during `buildDraftGraph()`. When a block's type has no definition in the registry, emit a `BuildDiagnostic` with kind `UnknownBlockType`. Then propagate this as a frontend error (not a backend error that gets filtered by reachability).

```typescript
// src/compiler/frontend/draft-graph.ts, in buildDraftGraph loop
const blockDef = getBlockDefinition(block.type);
if (!blockDef) {
  diagnostics.push({ kind: 'UnknownBlockType', blockId, blockType: block.type });
  continue;
}
```

Then in `compileFrontend()` or `compile()`, treat `UnknownBlockType` diagnostics as errors.

**Files to modify**:
- `src/compiler/frontend/draft-graph.ts` — add UnknownBlockType diagnostic
- `src/compiler/frontend/index.ts` — convert UnknownBlockType to frontend error
- Possibly `src/compiler/compile.ts` — ensure unknown block errors bypass reachability filter

---

## Execution Order

1. **RC1** first (highest impact: ~50 tests). Small change in solve.ts + domain-registry helper.
2. **RC4** second (4 tests). Trivial dep removal + test update.
3. **RC3** third (2 tests). BFS fix in adapter-spec.ts.
4. **RC5** fourth (2 tests). Frontend unknown block detection.
5. **RC2** last (2 tests). Test expectation updates only.

## Verification

After each fix, run:
```bash
npx vitest run 2>&1 | grep "^ FAIL " | grep -v "hcl" | wc -l
```

Final verification:
```bash
npx vitest run 2>&1 | grep -E "Tests |Test Files"
```

Target: 0 non-HCL test failures.
