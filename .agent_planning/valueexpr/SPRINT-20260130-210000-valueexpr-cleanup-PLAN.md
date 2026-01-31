# Sprint: valueexpr-cleanup - Type System Cleanup

Generated: 2026-01-30T21:00:00
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260130-203000.md

## Sprint Goal

Eliminate one-source-of-truth violations, dead code, and test fragility left over from the ValueExpr canonical table sprint.

## Scope

**Deliverables:**
- ValueExprId single-source-of-truth (remove duplicate definition)
- Dead deriveKind helper functions deleted from canonical-types.ts
- bridges.ts.bak backup file deleted
- Compile-time exhaustiveness in value-expr-invariants.test.ts

## Work Items

### P0 - ValueExprId Duplication Fix [HIGH]

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 1 (Single Authority) | **Status Reference**: EVALUATION-20260130-203000.md "Missing Checks" item 1, "New Work Items" item 1

#### Description

`ValueExprId` is defined identically in both `src/compiler/ir/value-expr.ts:35` and `src/compiler/ir/Indices.ts:45`, with factory functions `valueExprId()` duplicated in both files. This violates ONE SOURCE OF TRUTH. Keep the definition in `Indices.ts` (where all other branded IDs live: `SigExprId`, `FieldExprId`, `EventExprId`, `StateSlotId`, etc.) and import it in `value-expr.ts`.

#### Acceptance Criteria
- [ ] `ValueExprId` type is defined in exactly one file (`src/compiler/ir/Indices.ts`)
- [ ] `valueExprId()` factory function is defined in exactly one file (`src/compiler/ir/Indices.ts`)
- [ ] `src/compiler/ir/value-expr.ts` imports and re-exports `ValueExprId` and `valueExprId` from `./Indices`
- [ ] All existing tests pass (2004 tests, 0 TS errors)
- [ ] `grep -r "type ValueExprId" src/` returns exactly one match (in Indices.ts)

#### Technical Notes
- The two definitions are byte-identical (`number & { readonly __brand: 'ValueExprId' }`), so this is purely removing the duplicate
- The test file `value-expr-invariants.test.ts` imports from `../value-expr`, so the re-export must be present
- No production code imports `ValueExprId` yet (only test code), so import chain impact is minimal

---

### P1 - Dead Code Cleanup: deriveKind Helpers [HIGH]

**Dependencies**: None (independent of WI-1)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 1 (Single Authority), rule 5 (One Enforcement Gate) | **Status Reference**: EVALUATION-20260130-203000.md WI-3 issues, "New Work Items" item 2

#### Description

Six functions in `canonical-types.ts` have ZERO consumers and internally call `deriveKind`/`tryDeriveKind`:
- `requireSignalType` (line 815)
- `requireFieldType` (line 826)
- `requireEventType` (line 838)
- `isSignalType` (line 848)
- `isFieldType` (line 856)
- `isEventType` (line 864)

These are dead code. The ValueExpr migration deliberately eliminated the need for these helpers (type family is derived from extent axes, not checked via these wrappers). Delete them. Also delete `deriveKind` and `tryDeriveKind` function exports since they have no production consumers (only the dead helpers above called them).

#### Acceptance Criteria
- [ ] `requireSignalType`, `requireFieldType`, `requireEventType` deleted from `canonical-types.ts`
- [ ] `isSignalType`, `isFieldType`, `isEventType` deleted from `canonical-types.ts`
- [ ] `deriveKind` function body remains (used in tests) but is NOT exported if no external consumer exists; OR is deleted entirely if test coverage doesn't need it
- [ ] `tryDeriveKind` function is deleted (only consumer was the `is*Type` helpers)
- [ ] No file in `src/` imports any of the deleted functions (verified by grep)
- [ ] All existing tests pass (2004 tests, 0 TS errors)

#### Technical Notes
- `deriveKind` is imported in `src/compiler/__tests__/no-deriveKind-imports.test.ts` but only to verify no production imports exist. If we delete the function, that test needs to be updated or removed.
- `derivedKindLabel()` in `axis-validate.ts` is a LOCAL function (not `deriveKind`) and must NOT be touched.
- `assertKindAgreement` in `lowerTypes.ts` uses direct axis dispatch (no `deriveKind`) -- already clean.
- Check whether any test files import these helpers before deleting. If test files use them, assess whether the tests should also be deleted (they test dead code).

---

### P2 - Delete bridges.ts.bak [HIGH]

**Dependencies**: None
**Spec Reference**: N/A (file hygiene) | **Status Reference**: EVALUATION-20260130-203000.md "New Work Items" item 3

#### Description

Leftover backup file at `src/compiler/ir/bridges.ts.bak`. This is a vestigial artifact from a previous refactor. Delete it.

#### Acceptance Criteria
- [ ] `src/compiler/ir/bridges.ts.bak` does not exist
- [ ] No references to `bridges.ts.bak` in any file

#### Technical Notes
- This is a `.bak` file, so it is not compiled or imported. Pure deletion.

---

### P2 - Strengthen Invariant Test Exhaustiveness [HIGH]

**Dependencies**: WI-1 (ValueExprId fix, since we're editing value-expr imports)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 17 (Tests That Make Cheating Impossible) | **Status Reference**: EVALUATION-20260130-203000.md WI-5 issues

#### Description

The exhaustive kind check in `value-expr-invariants.test.ts` (line 45-52) uses `{ kind } as ValueExpr` which is a cast, not a narrowing check. TypeScript will not error if a kind is added to the union but not to `EXPECTED_KINDS`. The test relies on array length (9) to catch additions -- this is fragile.

Replace with a compile-time exhaustiveness pattern using a conditional type that produces a TS error when the union and the array diverge.

#### Acceptance Criteria
- [ ] Adding a new kind to the `ValueExpr` union without updating `EXPECTED_KINDS` causes a **compile-time error** (not just a runtime test failure)
- [ ] Removing a kind from `EXPECTED_KINDS` without updating the union causes a **compile-time error**
- [ ] The test file compiles and all 8 tests pass
- [ ] The exhaustiveness mechanism does not use `as` casts on the kind field

#### Technical Notes
- Pattern: Use `satisfies` or a helper type like `type AssertExhaustive<T extends never> = T` combined with `Exclude<ValueExpr['kind'], typeof EXPECTED_KINDS[number]>` to ensure the two sets are equal.
- Example approach:
  ```typescript
  type _MissingKinds = Exclude<ValueExpr['kind'], typeof EXPECTED_KINDS[number]>;
  type _ExtraKinds = Exclude<typeof EXPECTED_KINDS[number], ValueExpr['kind']>;
  type _AssertEmpty<T extends never> = T;
  type _Check1 = _AssertEmpty<_MissingKinds>;
  type _Check2 = _AssertEmpty<_ExtraKinds>;
  ```
- This makes the compiler enforce bidirectional coverage.

## Dependencies

- No external dependencies. All 4 items can be worked in parallel (except WI-4 depends on WI-1 for clean imports).

## Risks

- **Risk**: Deleting `deriveKind` breaks a test that imports it.
  **Mitigation**: The `no-deriveKind-imports.test.ts` test verifies no production imports. If it imports `deriveKind` itself (e.g., to check the function exists), it needs updating. Check before deleting.
- **Risk**: Some file indirectly depends on the dead helpers via re-exports.
  **Mitigation**: Grep for all 6 function names across the entire repo before deletion.
