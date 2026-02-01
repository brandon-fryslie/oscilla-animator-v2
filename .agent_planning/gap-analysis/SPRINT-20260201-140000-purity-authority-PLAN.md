# Sprint 1: Purity & Authority Hardening

Generated: 2026-02-01T14:00:00Z
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION
Supersedes: SPRINT-20260201-120000-housekeeping, SPRINT-20260201-120000-type-compat-purity (partial)

## Sprint Goal

Remove both P1 critical violations (isTypeCompatible impurity + backend type rewriting) and add enforcement tests that mechanically prevent them from returning. Also clean up housekeeping debt. This is surgical -- remove the impurities now, replace them with real constraints in Sprint 2.

## Rationale

Sprints B and C from the previous plan are both "purity boundary violations" solvable with the same mechanism: stop block-specific and instance-specific reasoning from leaking into type compatibility and the backend. Fix the boundary first, then fill in the correct frontend logic.

## Scope

**Deliverables:**
1. `isTypeCompatible(from: CanonicalType, to: CanonicalType)` becomes a pure 2-arg function
2. Backend type rewriting deleted from `lower-blocks.ts`
3. Enforcement tests added for boundary invariants
4. Housekeeping debt cleared (backup files, test thresholds)

## Work Items

### P0: Make isTypeCompatible Pure [HIGH]

**File:** `src/compiler/frontend/analyze-type-graph.ts:55-100`

**What to do:**
1. Remove `sourceBlockType?: string` and `targetBlockType?: string` parameters
2. Remove lines 79-97 (block-name cardinality lookups)
3. The function becomes: `(from: CanonicalType, to: CanonicalType) => boolean`
4. Fix all callers to stop passing block-name args

**What happens to the removed logic:**
- Cardinality-generic blocks (Mul, Add, etc.) will temporarily fail type checking for signal+field mixed connections
- This is ACCEPTABLE -- Sprint 2 adds proper constraint-based cardinality resolution
- Programs using only same-cardinality connections continue working
- Any newly failing programs are correct rejections (the old code was hiding real mismatches)

**Acceptance Criteria:**
- [ ] `isTypeCompatible` has exactly 2 parameters (CanonicalType, CanonicalType)
- [ ] No imports from block registry in `analyze-type-graph.ts`
- [ ] No `getBlockCardinalityMetadata` calls in type compatibility logic
- [ ] All callers updated
- [ ] TypeScript compiles

### P0: Delete Backend Type Rewriting [HIGH]

**File:** `src/compiler/backend/lower-blocks.ts:411-428`

**What to do:**
1. Delete the `if (inferredInstance)` block that calls `withInstance()` to rewrite output types
2. Backend reads `portTypes` from TypedPatch -- never modifies them
3. If any downstream code depends on the rewritten types, it will fail at compile time (good -- those are the places Sprint 2 must fix)

**What happens:**
- Blocks with inferred instances may produce incorrect output types temporarily
- Sprint 2 adds frontend instance constraint solving to produce correct types upfront
- Any runtime failures from this deletion are signals about where frontend logic is missing

**Acceptance Criteria:**
- [ ] No `withInstance()` calls in `src/compiler/backend/`
- [ ] No type mutation functions called in backend passes
- [ ] TypeScript compiles (or failures are in expected places, documented)

### P1: Add Enforcement Tests [HIGH]

**Tests to add:**

1. **Backend cannot mutate types** -- grep `src/compiler/backend/` for `withInstance`, `withCardinality`, `withTemporality`, or any `with*()` type mutators. Assert zero hits.

2. **Backend cannot import frontend modules** -- grep `src/compiler/backend/` for imports from `../frontend/`. Assert zero hits.

3. **isTypeCompatible is pure** -- grep `analyze-type-graph.ts` for `getBlockCardinalityMetadata`, `isCardinalityGeneric`, `sourceBlockType`, `targetBlockType`. Assert zero hits. Alternatively: import `isTypeCompatible` and assert `isTypeCompatible.length === 2`.

4. **Schedule steps contain no evalSig/evalEvent** -- `it.skip` for now. Un-skip after Sprint 3. Grep `src/compiler/ir/types.ts` for `evalSig|evalEvent`. Assert zero hits.

5. **Adapter insertion uses only types** -- `it.skip` for now. Grep adapter insertion code for block-name lookups outside of the adapter registry pattern. Assert zero hits.

**Acceptance Criteria:**
- [ ] Tests 1-3 pass (green)
- [ ] Tests 4-5 are skipped with clear TODO referencing Sprint 3
- [ ] All 29 existing enforcement tests still pass

### P2: Housekeeping [HIGH]

1. Delete backup files:
   - `src/compiler/ir/types.ts.bak`
   - `src/compiler/ir/types.ts.backup2`
   - `src/ui/components/BlockInspector.tsx.patch`
   - `src/runtime/__tests__/FieldKernels-placement.test.ts.bak`
   - `src/runtime/__tests__/PlacementBasis.test.ts.bak`
   - `src/compiler/ir/__tests__/bridges.test.ts.bak`

2. Tighten instanceId enforcement test threshold from 12 to match actual count (6), or rewrite to assert zero instanceId on expression types specifically.

**Acceptance Criteria:**
- [ ] Zero `.bak`/`.backup2`/`.patch` files in `src/`
- [ ] instanceId enforcement test tightened

### P3: Document Temporary Regressions [MEDIUM]

After removing the impurities, some programs may fail type checking or produce incorrect results. Document:
- Which block combinations are affected (cardinality-generic blocks with mixed signal+field inputs)
- Which tests fail (if any) and why
- That Sprint 2 addresses all of them

**Acceptance Criteria:**
- [ ] Failing tests documented with `// TODO: Sprint 2 - frontend solver will resolve cardinality/instance`
- [ ] No silent failures (all new failures are compile-time or test-time, not runtime)

## Dependencies
- None. This sprint has no external dependencies.

## Risks
- **Risk**: Removing impurities causes cascading test failures. **Mitigation**: Document failures as "expected regressions" with Sprint 2 TODO markers. The important thing is the boundary is clean.
- **Risk**: Some programs become uncompilable. **Mitigation**: This is correct behavior -- they were only compiling due to block-name exceptions. Sprint 2 adds the proper mechanism.
