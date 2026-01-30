---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: critical
audited: 2026-01-29
item_count: 5
priority_reasoning: >
  These gaps affect type system correctness. deriveKind() silently misclassifies zero-cardinality types,
  axis-validate is dead code (never called in compile pipeline), DEFAULTS_V0 uses wrong types for
  perspective/branch, constValueMatchesPayload is never invoked, and 6 canonical type tests are broken.
---

# Topic 03: Axes -- Critical Gaps

## Items

### C-1: deriveKind() does not handle cardinality=zero
**Problem**: The spec defines three cardinality values: `zero`, `one`, `many`. `deriveKind()` only checks for `many` and `discrete` -- cardinality `zero` falls through to return `'signal'`, which is wrong. Zero-cardinality values are compile-time-only constants with no runtime lanes; classifying them as signals violates spec.
**Evidence**: `src/core/canonical-types.ts:698-715` -- the function checks `many` then returns `signal` for everything else (both `one` and `zero`). The `DerivedKind` union is `'signal' | 'field' | 'event'` and has no `'const'` variant.
**Obvious fix?**: No. Requires deciding whether `DerivedKind` should include `'const'` or whether `zero` cardinality types should be excluded from `deriveKind`. This cascades to `assertSignalType()` which asserts `cardinality=one`, meaning a zero-cardinality type would fail assertion but is classified as signal by `deriveKind`. The validate pass calls `deriveKind` then asserts based on result, so zero-cardinality types would throw confusing errors.

### C-2: axis-validate.ts is dead code -- never integrated into compile pipeline
**Problem**: Spec Invariant I3 requires "exactly one enforcement gate" for axis validation. `axis-validate.ts` exists with `validateTypes()` and `validateType()`, but no file in the entire `src/compiler/` directory imports it. The function is never called during compilation.
**Evidence**: `grep -r 'axis-validate\|import.*axis.validate' src/compiler/` returns zero matches outside the file itself. `src/compiler/compile.ts` does not import or call any axis validation function.
**Obvious fix?**: Yes -- integrate `validateTypes()` into the compile pipeline after type resolution. However, needs C-1 fixed first since validateType calls deriveKind which mishandles zero.

### C-3: DEFAULTS_V0 uses string types for perspective and branch axes
**Problem**: `DEFAULTS_V0.perspective` is `'global'` (string) and `DEFAULTS_V0.branch` is `'main'` (string). The spec defines `PerspectiveValue = { kind: 'default' }` and `BranchValue = { kind: 'default' }`. Code that falls back to DEFAULTS_V0 (e.g., `analyze-type-graph.ts`, `typeValidation.ts`) only uses cardinality and temporality from it, but the perspective/branch values are semantically wrong and create a second source of truth.
**Evidence**: `src/core/canonical-types.ts:890-905` -- comments say `// TODO: DEFAULTS_V0 should use PerspectiveValue/BranchValue`. `src/ui/reactFlowEditor/typeValidation.ts:78-79` falls back to `DEFAULTS_V0.cardinality`/`temporality` but never reads perspective/branch from it.
**Obvious fix?**: Yes -- change DEFAULTS_V0 perspective to `{ kind: 'default' }` and branch to `{ kind: 'default' }`, update tests, and update type from `string` to the proper value types.

### C-4: constValueMatchesPayload() exists but is never called
**Problem**: Spec Invariant I5 requires that `ConstValue.kind` matches `CanonicalType.payload.kind`, enforced by `constValueMatchesPayload()`. The function is defined but never called anywhere in the codebase -- not in axis-validate, not in the compiler, not in IR construction.
**Evidence**: `grep -r 'constValueMatchesPayload' src/` shows only the definition and JSDoc references in `src/core/canonical-types.ts:289-320`. Zero call sites.
**Obvious fix?**: Yes -- call it in `IRBuilderImpl.sigConst()` and `IRBuilderImpl.fieldConst()` which accept both a ConstValue and CanonicalType.

### C-5: 6 canonical type tests use stale discriminant values and fail
**Problem**: Multiple tests in `canonical-types.test.ts` expect axis `.kind` to be `'instantiated'` or `'default'`, but the actual `Axis<T,V>` discriminant is `'inst'`. This causes 6 test failures. Tests are the last line of defense for invariants -- broken tests mean broken enforcement.
**Evidence**: `src/core/__tests__/canonical-types.test.ts:190,290,291,328,329,353,359,365,367,382,388,404` -- assertions like `expect(card.kind).toBe('instantiated')` fail because actual value is `'inst'`. Running `npx vitest run src/core/__tests__/canonical-types.test.ts` shows 6 failures, 15 passes.
**Obvious fix?**: Yes -- change all `'instantiated'` to `'inst'` and `'default'` (on axis kind) to `'inst'` in test expectations. Line 190 expects `'default'` for `canonicalType(FLOAT).extent.cardinality.kind` but it is `'inst'`.
