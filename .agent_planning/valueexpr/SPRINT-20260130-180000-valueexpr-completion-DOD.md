# Definition of Done: Sprint valueexpr-completion

## Per-Item Gates
- [ ] WI-1: Enforcement tests exist asserting no `instanceId` on any FieldExpr built by IRBuilderImpl; tests PASS; builder code cleaned
- [ ] WI-2: Enforcement test asserts instance names in type match registered instances; 20 failures resolved
- [ ] WI-3: Enforcement test asserts no production `deriveKind` imports; zero-cardinality test asserts `isSignalType(canonicalConst(FLOAT)) === false`; all call sites replaced
- [ ] WI-4: All 5 pre-existing test failures pass; tests assert NEW behavior not OLD
- [ ] WI-5: ValueExpr structural invariant tests exist (9 kinds, type on every variant, no op discriminant)

## Sprint-Level Gates
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` — 0 test failures
- [ ] Every structural change is locked by an enforcement test that would FAIL on the old behavior
- [ ] `grep -rn "deriveKind(" src/ --include="*.ts" | grep -v canonical-types | grep -v index.ts | grep -v __tests__` returns empty
- [ ] No `inferFieldInstance` or `inferZipInstance` methods exist in IRBuilderImpl
