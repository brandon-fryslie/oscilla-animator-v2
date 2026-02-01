# SUPERSEDED — See SPRINT-20260201-140000-purity-authority-PLAN.md
# Sprint: Housekeeping - Cleanup and Enforcement Hardening

Generated: 2026-02-01T12:00:00Z
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260201-120000.md

## Sprint Goal

Delete stale backup files and add enforcement tests that prevent regression on the two remaining critical violations (isTypeCompatible purity, backend type rewriting).

## Scope

**Deliverables:**
- Delete 7 backup/patch files from src/
- Tighten instanceId enforcement test threshold (currently passing, reduce tolerance)
- Add skipped enforcement test for isTypeCompatible purity (will fail until Sprint B fixes it)
- Add skipped enforcement test for backend read-only contract (will fail until Sprint C fixes it)
- Optional: Rename ExpressionCompileError to ExprCompileError

## Work Items

### P0: Delete Backup Files [HIGH]

**Dependencies**: None
**Spec Reference**: Naming/legacy cleanup | **Status Reference**: SUMMARY.md trivial section, trivial/topic-naming-legacy.md T1

#### Description
Seven backup/patch files exist in the source tree. They inflate the repo, create confusion about canonical files, and may contain outdated legacy patterns. All valuable content is preserved in git history.

Files to delete:
1. `src/compiler/ir/types.ts.bak` (604 lines)
2. `src/compiler/ir/types.ts.backup2` (604 lines)
3. `src/compiler/ir/__tests__/bridges.test.ts.bak`
4. `src/runtime/__tests__/FieldKernels-placement.test.ts.bak`
5. `src/runtime/__tests__/PlacementBasis.test.ts.bak`
6. `src/runtime/__tests__/PlacementBasis.test.ts.bak2`
7. `src/ui/components/BlockInspector.tsx.patch`

#### Acceptance Criteria
- [ ] All 7 files are deleted from the working tree
- [ ] `git ls-files --others src/ | grep -E '\.(bak|backup|patch)' | wc -l` returns 0
- [ ] Build passes (`npm run build`)
- [ ] All tests pass (`npm run test`)

#### Technical Notes
Straightforward `rm` commands. No code changes required.

---

### P1: Add isTypeCompatible Purity Enforcement Test [HIGH]

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #6, critical/topic-compiler-adapters.md GAP #1 | **Status Reference**: SUMMARY.md P1 #1

#### Description
Add a skipped (`it.skip`) enforcement test in `src/compiler/__tests__/no-legacy-types.test.ts` (or a new sibling file) that verifies `isTypeCompatible` does NOT accept block-name parameters. The test should:
1. Grep for `isTypeCompatible` function signature in `analyze-type-graph.ts`
2. Assert the signature has exactly 2 parameters (from, to) with no optional block-type params
3. Mark as `it.skip` with a comment referencing Sprint B

This test will FAIL today (the violation exists). It becomes a gate for Sprint B completion.

#### Acceptance Criteria
- [ ] Test file exists with `it.skip` test for isTypeCompatible purity
- [ ] Test clearly documents what it checks and references the spec violation
- [ ] Running the test in non-skip mode fails against current code (verified manually)
- [ ] All existing tests continue to pass

#### Technical Notes
Follow the pattern in `no-legacy-types.test.ts` which uses `execSync` + grep to check source code patterns. The new test should grep for `sourceBlockType|targetBlockType` in the function signature.

---

### P1: Add Backend Read-Only Contract Enforcement Test [HIGH]

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #14, critical/topic-compiler-adapters.md HIGH #2 | **Status Reference**: SUMMARY.md P1 #2

#### Description
Add a skipped (`it.skip`) enforcement test that verifies the backend (lower-blocks.ts) does not call `withInstance()` to rewrite types. The test should:
1. Grep `src/compiler/backend/lower-blocks.ts` for calls to `withInstance`
2. Assert zero matches (backend should read types, not rewrite them)
3. Mark as `it.skip` with a comment referencing Sprint C

#### Acceptance Criteria
- [ ] Test file exists with `it.skip` test for backend type immutability
- [ ] Test clearly documents what it checks and references the spec violation
- [ ] Running the test in non-skip mode fails against current code (verified manually)
- [ ] All existing tests continue to pass

#### Technical Notes
Can be in the same test file as the purity test. Check for both `withInstance` and `makeInstanceRef` imports/calls in backend files.

---

### P2: Tighten instanceId Enforcement Test Threshold [HIGH]

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md Guardrail #10 | **Status Reference**: SUMMARY.md housekeeping section

#### Description
The instance-unification test suite verifies that instanceId is derived from type (not stored as separate field). The current threshold may be looser than necessary given completed cleanup. Review and tighten.

#### Acceptance Criteria
- [ ] Review `src/compiler/__tests__/instance-unification.test.ts` for any threshold or count assertions
- [ ] If thresholds exist, tighten to match current actual counts
- [ ] All tests pass after tightening

#### Technical Notes
This may be a no-op if the test has no explicit threshold. In that case, add a count-based assertion that captures current state as the new baseline.

---

### P3: Rename ExpressionCompileError to ExprCompileError (Optional) [HIGH]

**Dependencies**: None
**Spec Reference**: Naming convention "Expr" not "Expression" | **Status Reference**: trivial/topic-naming-legacy.md T2

#### Description
`src/expr/index.ts` exports `ExpressionCompileError` while the rest of the codebase uses "Expr" prefix. Rename for consistency.

Affected locations:
- `src/expr/index.ts:35` - interface declaration
- `src/expr/index.ts:47` - result type union
- `src/expr/index.ts:102` - error conversion comment

#### Acceptance Criteria
- [ ] `ExpressionCompileError` renamed to `ExprCompileError` in `src/expr/index.ts`
- [ ] All references updated (grep confirms zero remaining `ExpressionCompileError`)
- [ ] Build passes
- [ ] Tests pass

#### Technical Notes
Only 3 occurrences in one file. Straightforward find-and-replace.

## Dependencies
None -- all items are independent.

## Risks
- **Risk**: Backup file deletion could remove something not in git. **Mitigation**: Verify files are tracked or stale before deletion; git history preserves everything.
- **Risk**: Enforcement tests incorrectly pass/fail. **Mitigation**: Manually verify each test in both skip and non-skip mode.
