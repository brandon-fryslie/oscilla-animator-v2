# Sprint: p0-quick-p1 - Fix unitVar Crash + Quick P1 Items
Generated: 2026-01-29-200000
Confidence: HIGH: 8, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260129-200000.md

## Sprint Goal
Unblock the entire test suite by fixing the unitVar crash, then fix 7 independent small P1 items that are unambiguous and self-contained.

## Scope
**Deliverables:**
- P0: Replace unitVar() calls in block definitions with a concrete sentinel so tests can run
- P1 #1: Fix 6 stale discriminant assertions in canonical-types.test.ts
- P1 #5: Delete AxisTag alias from bridges.ts
- P1 #8: Make cameraProjection a closed enum
- P1 #9: Add tryDeriveKind() function
- P1 #11: Rename AxisViolation.typeIndex to nodeIndex + add nodeKind
- P1 #12: Add deriveKind agreement asserts at lowering boundaries
- P1 #13: Add CI forbidden-pattern vitest test

## Work Items

### [P0] Fix unitVar Crash in Block Definitions

**Dependencies**: None (this is the first thing to fix)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 8 (Units Are Canonical) | **Status Reference**: EVALUATION-20260129-200000.md Issue 1

#### Description
`unitVar()` was converted to `throw never` per D5, but 5 callsites in block definitions still call it at module import time. This crashes 50+ test files immediately on import. The fix is to replace these calls with `unitScalar()` as a concrete placeholder -- block definitions already have polymorphic payload metadata that the constraint solver uses, and the unit is resolved from that metadata during pass1. The block definition's `type` field on ports is used as a template, not as the final type.

#### Acceptance Criteria
- [ ] All 5 unitVar() calls replaced with unitScalar() (or another concrete unit)
- [ ] `npx vitest run` shows 50+ previously-crashing test files can now import block definitions
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit` exits 0
- [ ] No remaining calls to unitVar() anywhere in src/blocks/

#### Technical Notes
The block definitions use `payloadVar()` for polymorphic payload and `unitVar()` for polymorphic unit. Since `payloadVar()` still works (returns a PayloadType with kind 'var'), but `unitVar()` throws, the fix is asymmetric. The constraint solver (pass1) already resolves the final type from the block's `polymorphicPayload` metadata -- the `type` field on the port definition is a template used for non-polymorphic blocks. For polymorphic blocks, pass1 overrides it entirely. Using `unitScalar()` as the placeholder is safe because it will be overwritten.

---

### [P1] Fix Broken Canonical Type Tests (#1)

**Dependencies**: None
**Spec Reference**: Axis<T,V> pattern uses 'inst' discriminant | **Status Reference**: EVALUATION-20260129-200000.md Verified #1

#### Description
6 test assertions in `canonical-types.test.ts` use the old discriminant value `'instantiated'` instead of the current `'inst'`. These are simple string replacements.

#### Acceptance Criteria
- [ ] All assertions using `'instantiated'` changed to `'inst'`
- [ ] `npx vitest run src/core/__tests__/canonical-types.test.ts` passes
- [ ] No remaining `'instantiated'` string literals in test files

#### Technical Notes
The Axis type uses `kind: 'inst' | 'var'` as its discriminant. Old tests expected `'instantiated'`. Grep for `'instantiated'` in test files and replace with `'inst'`.

---

### [P1] Delete AxisTag Alias (#5)

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 16 (Migration Hygiene) | **Status Reference**: EVALUATION-20260129-200000.md Verified #5

#### Description
`type AxisTag<T> = Axis<T, never>` exists at `bridges.ts:36` as a backward-compat alias. It should be removed. Any usages should use `Axis<T, never>` directly.

#### Acceptance Criteria
- [ ] `AxisTag` type alias deleted from bridges.ts
- [ ] Zero grep matches for `AxisTag` in entire src/ directory
- [ ] TypeScript compiles cleanly

#### Technical Notes
Check for any usages of `AxisTag` before deleting. If found, replace inline with `Axis<T, never>`.

---

### [P1] cameraProjection to Closed Enum (#8)

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 7 (Const Values Must Be Payload-Shaped) | **Status Reference**: EVALUATION-20260129-200000.md Verified #8

#### Description
`cameraProjectionConst(value: string)` accepts any string. It should accept only `'orthographic' | 'perspective'` via a `CameraProjection` type.

#### Acceptance Criteria
- [ ] `CameraProjection` type exported from canonical-types.ts
- [ ] `cameraProjectionConst()` parameter typed as `CameraProjection`
- [ ] TypeScript rejects `cameraProjectionConst('invalid')` at compile time
- [ ] Existing callers updated if needed

#### Technical Notes
Also update the ConstValue variant for cameraProjection to use the closed type instead of `string`.

---

### [P1] Add tryDeriveKind() (#9)

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 2 (Derived Kind Must Be Total) | **Status Reference**: EVALUATION-20260129-200000.md Verified #9

#### Description
`deriveKind()` throws on uninstantiated axes. A safe variant `tryDeriveKind()` should return `DerivedKind | null` when axes are var.

#### Acceptance Criteria
- [ ] `tryDeriveKind(t: CanonicalType): DerivedKind | null` exported from canonical-types.ts
- [ ] Returns null when any required axis is var (not inst)
- [ ] Unit test covering: inst axes -> returns kind, var axes -> returns null

#### Technical Notes
Place directly after `deriveKind()` function. Same logic but returns null instead of throwing.

---

### [P1] Rename AxisViolation Fields (#11)

**Dependencies**: None
**Spec Reference**: Diagnostic context should identify node, not just array index | **Status Reference**: EVALUATION-20260129-200000.md Verified #11

#### Description
`AxisViolation.typeIndex` is opaque. Rename to `nodeIndex` and add `nodeKind: string` field for the violation category.

#### Acceptance Criteria
- [ ] `AxisViolation` has `nodeIndex` (not `typeIndex`) and `nodeKind` fields
- [ ] All consumers of AxisViolation updated
- [ ] TypeScript compiles cleanly

#### Technical Notes
Small interface change. Check for consumers in axis-validate.ts and any test files.

---

### [P1] Add deriveKind Agreement Asserts (#12)

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 2 | **Status Reference**: EVALUATION-20260129-200000.md Verified #12

#### Description
Where IR variants have both a `.kind` tag (e.g., 'signal', 'field') and a `.type: CanonicalType`, assert that the tag matches `deriveKind(type)`. This catches type system drift.

#### Acceptance Criteria
- [ ] Assert exists at block lowering boundary (pass6 or equivalent)
- [ ] Assert exists at debug/inspection boundary if applicable
- [ ] Test that intentional mismatch triggers the assert

#### Technical Notes
Use `console.assert` or a debug-only assert utility. The assert should fire during development but not add overhead in production builds if possible.

---

### [P1] CI Forbidden-Pattern Test (#13)

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 16, 17 | **Status Reference**: EVALUATION-20260129-200000.md Verified #13

#### Description
Add a vitest test that greps the codebase for forbidden patterns and fails if found. Patterns: `AxisTag<` in non-test files, payload var in backend IR, legacy type names (`SignalType`, `ResolvedPortType`) in backend files.

#### Acceptance Criteria
- [ ] Test file exists (e.g., `src/core/__tests__/forbidden-patterns.test.ts`)
- [ ] Test fails if `AxisTag<` appears in src/ (excluding test files)
- [ ] Test fails if legacy type names appear in compiler/runtime directories
- [ ] Test passes in current codebase (after Sprint 1 fixes applied)

#### Technical Notes
Use `fs.readFileSync` + regex or glob to scan files. Keep patterns in an array for easy extension.

## Dependencies
- No external dependencies. All items are independent of each other.
- P0 (unitVar fix) should be done FIRST because it unblocks test verification for all other items.

## Risks
- **unitVar replacement strategy**: Using `unitScalar()` as placeholder assumes the constraint solver fully overrides port types for polymorphic blocks. If some code path reads the placeholder type literally, it would get wrong unit. Mitigation: grep for direct reads of block definition port types outside of pass1.
- **Forbidden-pattern test maintenance**: Patterns list needs to be kept current. Mitigation: document the pattern list in the test file with rationale for each.
