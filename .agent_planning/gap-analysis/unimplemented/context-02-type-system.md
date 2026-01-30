---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t3_const-value.md
category: unimplemented
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
priority: P4
---

# Context: Topic 02 — Type System (Unimplemented)

## What the Spec Requires

1. `canonicalConst(payload, unit)` constructor — creates cardinality=zero, temporality=continuous type
2. `ValueExprConst = { kind: 'const', type: CanonicalType, value: ConstValue }` — IR constant expression shape
3. EventExprNever pattern — `{ kind: 'const', type: canonicalEventOne(), value: { kind: 'bool', value: false } }`

## Current State (Topic-Level)

### How It Works Now

There is no `canonicalConst()` constructor. The `worldToAxes('static')` function produces zero-cardinality axes but doesn't create a full CanonicalType. The `canonicalType()` generic constructor can produce zero-cardinality types with explicit extent overrides.

ConstValue is fully defined and `constValueMatchesPayload()` exists. The IR expression system does have constant expressions but the exact discriminant shape has not been verified against the spec pattern.

### Patterns to Follow

- Canonical constructors in `src/core/canonical-types.ts` follow the pattern: `function canonicalX(payload, unit?, ...): CanonicalType`
- Each constructor produces a fully instantiated type with all 5 axes set

## Work Items

### WI-1: Add canonicalConst() constructor
**Category**: UNIMPLEMENTED
**Priority**: P4
**Spec requirement**: `canonicalConst(payload, unit)` creates type with cardinality=zero
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | Add constructor | near line 680 |
| `src/types/index.ts` | Re-export | near line 57 |

**Current state**: No `canonicalConst` function exists
**Required state**: `canonicalConst(payload, unit)` returns `CanonicalType` with cardinality=zero, temporality=continuous, default binding/perspective/branch
**Suggested approach**: Add the function following the same pattern as `canonicalSignal`. Require explicit unit (like canonicalField) since const values are semantically significant. Export through types/index.ts.
**Depends on**: none
**Blocks**: nothing critical — generic constructor can be used in the meantime

### WI-2: Verify ValueExprConst pattern in IR
**Category**: UNIMPLEMENTED
**Priority**: P5
**Spec requirement**: Value expressions for constants follow `{ kind: 'const', type: CanonicalType, value: ConstValue }` shape
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/types.ts` | IR expression types | various |

**Current state**: Unknown — needs audit
**Required state**: IR const expressions use CanonicalType and ConstValue with kind-matching enforced
**Suggested approach**: Read IR expression types, verify const variant shape, add type guard if missing
**Depends on**: none
**Blocks**: nothing
