# Definition of Done: Sprint valueexpr-completion

## Per-Item Gates
- [x] WI-1: Enforcement tests exist asserting no `instanceId` on any FieldExpr built by IRBuilderImpl; tests PASS; builder code cleaned
- [x] WI-2: Enforcement test asserts instance names in type match registered instances; 20 failures resolved
- [x] WI-3: Enforcement test asserts no production `deriveKind` imports; zero-cardinality test asserts `isSignalType(canonicalConst(FLOAT)) === false`; all call sites replaced
- [x] WI-4: All 5 pre-existing test failures pass; tests assert NEW behavior not OLD
- [x] WI-5: ValueExpr structural invariant tests exist (9 kinds, type on every variant, no op discriminant)

## Sprint-Level Gates
- [x] `npx tsc --noEmit` exits 0
- [x] `npx vitest run` — 0 test failures (127 test files, 2004 tests passed)
- [x] Every structural change is locked by an enforcement test that would FAIL on the old behavior
- [x] `grep -rn "deriveKind(" src/ --include="*.ts" | grep -v canonical-types | grep -v index.ts | grep -v __tests__` returns empty (only comments remain)
- [x] No `inferFieldInstance` or `inferZipInstance` methods exist in IRBuilderImpl

## Sprint Completion Status: ✓ COMPLETE

All work items and gates verified as complete on 2026-01-30.

### Completed Commits
- `2cc3f2c` - WI-1: fix(ir): Remove phantom instanceId from IRBuilderImpl field builders
- `01473ed` - WI-2: fix(types): Resolve instance name mismatch between block definitions and runtime
- `78d28ab` - WI-3: refactor(types): Replace all deriveKind consumers with direct axis checks
- `0013b52` - WI-4: fix(tests): Resolve 3 pre-existing test failures
- `103c022` - WI-5: test(ir): Add ValueExpr structural invariant tests

### Enforcement Tests in Place
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/__tests__/no-instanceid-on-fieldexpr.test.ts` - 10 tests passing
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/no-deriveKind-imports.test.ts` - 1 test passing
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/__tests__/value-expr-invariants.test.ts` - 8 tests passing

All enforcement tests are actively preventing regressions to the old behavior.
