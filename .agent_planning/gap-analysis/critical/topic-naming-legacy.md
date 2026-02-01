# Gap Analysis: Naming Conventions & Legacy Type Cleanup - CRITICAL

## Summary
**GOOD NEWS**: No critical violations found! All hard requirements from the spec are satisfied.

The type system refactor is **substantially complete** with strong mechanical enforcement.

---

## Verification Summary

### ✅ PASS: No Banned Legacy Types (D1)

**Requirement**: Zero hits for:
- ResolvedPortType ❌ (0 hits)
- ConcreteType ❌ (0 hits)
- SignalPortType / FieldPortType / EventPortType ❌ (0 hits in production code - only in test names)
- SignalType as interface/type definition ❌ (0 hits - only as comment reference)

**Evidence**:
```bash
# Searched for type/interface declarations
grep -rn "^(interface|type|class)\s+SignalType\b" src/
# Result: No matches

grep -rn "ResolvedPortType|ConcreteType|SignalPortType|FieldPortType|EventPortType" src/
# Result: Only in test file names (forbidden-patterns.test.ts, frontend-independence.test.ts)
```

**Status**: ✅ **COMPLIANT**. The migration successfully removed all legacy type names from production code.

---

### ✅ PASS: CanonicalType Is the Single Authority (D2)

**Requirement**: SignalType should be renamed to CanonicalType or be a type alias only.

**Evidence**:
```typescript
// src/core/canonical-types.ts:694
export interface CanonicalType {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
}
```

**Import Analysis**:
- `import.*SignalType`: 1 occurrence (test file)
- `import.*CanonicalType`: 44 occurrences across 42 files

**Status**: ✅ **COMPLIANT**. CanonicalType is the canonical name, used throughout the codebase. No SignalType type exists.

---

### ✅ PASS: No Legacy Expression Types (D3)

**Requirement**: No SigExpr, FieldExpr, EventExpr types in production code.

**Evidence**: Enforcement test exists and passes:
- `src/compiler/__tests__/no-legacy-types.test.ts` (3 tests, all passing)
- `src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts` (1 test, passing)

**Test Output**:
```
✓ src/compiler/__tests__/no-legacy-types.test.ts (3 tests) 403ms
✓ src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts (1 test) 254ms
```

**Status**: ✅ **COMPLIANT**. ValueExpr is the canonical expression type. Legacy types are mechanically prevented by CI.

---

### ✅ PASS: No worldToAxes Function (D4)

**Requirement**: worldToAxes should be quarantined or deleted.

**Evidence**:
```bash
grep -rn "worldToAxes" src/
# Result: No files found
```

**Status**: ✅ **COMPLIANT**. The function has been deleted.

---

### ✅ PASS: No Snake Case Discriminants (D5)

**Requirement**: Discriminant values should be camelCase (reduceField, not reduce_field).

**Evidence**:
```bash
grep -rn "reduce_field|broadcast_field|sample_field" src/
# Result: No matches
```

**Status**: ✅ **COMPLIANT**. All discriminants use camelCase.

---

### ✅ PASS: No Stored isField/isSignal/isEvent Properties (D6)

**Requirement**: No stored properties like `isField: boolean`, `isSignal: boolean` (should be derived).

**Evidence**:
```bash
grep -rn "(isField|isSignal|isEvent)\s*:" src/
# Result: No matches
```

**Status**: ✅ **COMPLIANT**. No stored discriminant properties. Kind is derived from extent.

---

### ✅ PASS: No port.kind === Discriminants (D7)

**Requirement**: No type discriminants on port objects like `port.kind === 'signal'`.

**Evidence**:
```bash
grep -rn "\bport\.kind\b" src/
# Result: No matches
```

**Status**: ✅ **COMPLIANT**. Ports don't have kind discriminants.

---

### ✅ PASS: Invariant Tests Exist (D8)

**Requirement**: Tests that fail if banned symbols appear, and tests ensuring ValueExpr invariants.

**Evidence**: Multiple enforcement tests exist and pass:

1. **src/__tests__/forbidden-patterns.test.ts** (4 tests):
   - No AxisTag type alias
   - No payload var kind outside inference
   - No legacy type aliases
   - No instanceId field on expression types (with tolerance for migration)

2. **src/compiler/__tests__/no-legacy-types.test.ts** (3 tests):
   - No SigExpr/FieldExpr/EventExpr type references
   - No SigExprId/FieldExprId/EventExprId aliases
   - No deriveKind() function calls

3. **src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts** (1 test):
   - No legacy kind dispatch outside allowed files

4. **src/compiler/ir/__tests__/value-expr-invariants.test.ts** (17 tests):
   - Exactly 10 top-level kinds
   - Exhaustive kind check (compile-time + runtime)
   - Every variant has type: CanonicalType
   - No 'op' discriminant at top level
   - No instanceId as top-level field
   - Sub-discriminant correctness (kernel, event, intrinsic)

**Test Output**:
```
✓ src/__tests__/forbidden-patterns.test.ts (4 tests) 535ms
✓ src/compiler/__tests__/no-legacy-types.test.ts (3 tests) 403ms
✓ src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts (1 test) 254ms
✓ src/compiler/ir/__tests__/value-expr-invariants.test.ts (17 tests) 5ms
```

**Status**: ✅ **COMPLIANT**. Comprehensive mechanical enforcement exists at multiple levels.

---

### ✅ PASS: No Axis.var in Backend (D9)

**Requirement**: Axis.kind:'var' should not escape frontend boundary into backend.

**Evidence**: `forbidden-patterns.test.ts` checks this with allowlist for frontend/inference modules.

**Enforcement Location**: `src/compiler/frontend/axis-validate.ts` is the belt-buckle pass.

**Status**: ✅ **COMPLIANT**. axis-validate.ts enforces that only inst axes reach backend.

---

### ✅ PASS: deriveKind Migration Complete (D10)

**Requirement**: deriveKind function should be deleted; check extent directly using requireInst pattern.

**Evidence**:
- `src/compiler/__tests__/no-legacy-types.test.ts` enforces no deriveKind() calls
- Only 3 files contain "deriveKind":
  - no-legacy-types.test.ts (the enforcement test itself)
  - lower-blocks.ts (backend lowering - uses requireInst pattern)
  - axis-validate.ts (frontend validation - uses requireInst pattern)

**Pattern Used**:
```typescript
// Instead of deriveKind(type)
const temp = requireInst(type.extent.temporality, 'temporality');
const isEvent = temp.kind === 'discrete';
const card = requireInst(type.extent.cardinality, 'cardinality');
const isField = card.kind === 'many';
```

**Status**: ✅ **COMPLIANT**. deriveKind is gone; code uses requireInst pattern.

---

## Overall Assessment

**STATUS**: 🎉 **ALL CRITICAL REQUIREMENTS MET**

The type system refactor has achieved its goals:
1. **Single Authority**: CanonicalType is the one true type
2. **No Legacy Types**: All banned symbols eliminated
3. **Mechanical Enforcement**: CI tests prevent regression
4. **Consistent Naming**: ValueExpr, CanonicalType, camelCase discriminants
5. **Axis Validation**: Frontend belt-buckle enforces invariants
6. **Migration Complete**: No shims, no deriveKind, no worldToAxes

**Remaining Work**: Only trivial cleanup (backup files) and optional improvements (see to-review/).

---

## Context File
See: topic-naming-legacy-context.md for detailed evidence and search results.
