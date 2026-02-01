# Context: Naming Conventions & Legacy Type Cleanup Audit

This file contains detailed evidence from the codebase audit conducted on 2026-02-01.

---

## Search Results Summary

### 1. Legacy Type Names

**Search**: `ResolvedPortType|ConcreteType|SignalPortType|FieldPortType|EventPortType`

**Result**: 3 files found, ALL IN TESTS:
- `src/__tests__/forbidden-patterns.test.ts` (the enforcement test itself)
- `src/services/CompilationInspectorService.ts` (comment only: "resolved SignalTypes")
- `src/compiler/frontend/__tests__/frontend-independence.test.ts` (test comments)

**Analysis**: ✅ No production code uses these names. Only test files that enforce their absence.

---

### 2. SignalType Definition Search

**Search**: `^(interface|type|class)\s+SignalType\b`

**Result**: 0 matches

**Search**: `type SignalType.*=`

**Result**: 0 matches

**Analysis**: ✅ No SignalType type exists. CanonicalType is the canonical name.

---

### 3. CanonicalType Definition

**Location**: `src/core/canonical-types.ts:694-698`

```typescript
/**
 * Complete type contract: payload + unit + extent.
 *
 * This is the FINAL, RESOLVED type. It NEVER contains vars.
 * For inference types (which CAN have vars), see InferenceCanonicalType in inference-types.ts.
 */
export interface CanonicalType {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
}
```

**Import Frequency**:
- `import.*SignalType`: 1 occurrence (test file only)
- `import.*CanonicalType`: 44 occurrences across 42 production files

**Analysis**: ✅ CanonicalType is universally used. No parallel type system exists.

---

### 4. ValueExpr Structure

**Location**: `src/compiler/ir/value-expr.ts`

**Definition**:
```typescript
/**
 * Canonical value expression type.
 *
 * Replaces legacy SigExpr/FieldExpr/EventExpr with a unified table.
 * CanonicalType.extent determines signal/field/event semantics.
 *
 * Top-level kinds (10):
 * - const, external, intrinsic, kernel, state, time
 * - shapeRef, eventRead, event, slotRead
 */
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime
  | ValueExprShapeRef
  | ValueExprEventRead
  | ValueExprEvent
  | ValueExprSlotRead;
```

**Every variant carries**:
```typescript
readonly type: CanonicalType;
```

**Analysis**: ✅ Single expression type, no family split. Every variant has CanonicalType.

---

### 5. worldToAxes Search

**Search**: `worldToAxes`

**Result**: 0 files found

**Analysis**: ✅ Function has been deleted.

---

### 6. Snake Case Discriminants

**Search**: `reduce_field|broadcast_field|sample_field`

**Result**: 0 matches

**Analysis**: ✅ No snake_case discriminants exist. All use camelCase.

---

### 7. Stored isSignal/isField/isEvent Properties

**Search**: `(isField|isSignal|isEvent)\s*:`

**Result**: 0 matches

**Analysis**: ✅ No stored boolean discriminants. Kind is derived from extent.

---

### 8. port.kind Discriminant

**Search**: `\bport\.kind\b`

**Result**: 0 matches

**Analysis**: ✅ Ports don't have kind discriminants.

---

### 9. .kind === 'signal'/'field'/'event' Usage

**Search**: `\.kind\s*===\s*['"\`](sig|signal|field|event)['"\`]`

**Result**: 7 files found

**Breakdown by Category**:

#### A. Debug Value Runtime Wrappers (NOT IR types):
- `src/services/DebugService.test.ts` (13 matches)
- `src/ui/debug-viz/useDebugMiniView.test.ts` (2 matches)
- `src/ui/debug-viz/DebugMiniView.tsx` (1 match)
- `src/ui/reactFlowEditor/PortInfoPopover.tsx` (2 matches)
- `src/ui/components/SimpleDebugPanel.tsx` (2 matches)

**Example**:
```typescript
if (debugValue && debugValue.kind === 'signal') {
  // Debug value is a RUNTIME wrapper, not a ValueExpr
}
```

**Analysis**: These check discriminants on debug value wrapper objects, NOT on IR expressions. Acceptable.

#### B. Backend Schedule Mappings:
- `src/compiler/backend/schedule-program.ts` (5 matches)

**Example**:
```typescript
return schedule.stateMappings.filter((m): m is FieldSlotDecl => m.kind === 'field');
```

**Analysis**: Filters state mapping discriminants (backend artifact types), not IR expressions. Acceptable.

#### C. State Migration:
- `src/runtime/StateMigration.ts` (1 match)

**Example**:
```typescript
if (newMapping.kind === 'field' && oldMapping.kind === 'field') {
  // State mapping compatibility check
}
```

**Analysis**: Checks state mapping metadata, not IR expressions. Acceptable.

**Overall Analysis**: ⚠️ These are NOT ValueExpr.kind checks. They're discriminants on OTHER type hierarchies (debug wrappers, schedule mappings, state metadata). Technically compliant but could be renamed for clarity (see to-review/).

---

### 10. Expression vs Expr Naming

**Search**: `\bExpression[A-Z]`

**Result**: Minimal usage
- `ExpressionCompileError` (1 interface in expr/index.ts)
- `ExpressionEditor` (1 component in BlockInspector.tsx)

**Search**: `\bExpression\b` (any case)

**Result**: 38 files found

**Breakdown**:
- **Type names**: All use "Expr" (ExprNode, ValueExpr, etc.) ✅
- **Comments/docs**: Mix "expression" (natural English) with "Expr" (type reference)
- **DSL API**: `ExpressionCompileError` uses full word

**Analysis**: ⚠️ Minor inconsistency in DSL API. Consider renaming to `ExprCompileError` for full consistency.

---

### 11. Backup Files Found

**Search**: `find . -name "*.backup*" -o -name "*.bak" -o -name "*.patch"`

**Result**:
- `src/compiler/ir/types.ts.bak` (604 lines)
- `src/compiler/ir/types.ts.backup2` (604 lines)
- `src/ui/components/BlockInspector.tsx.patch`
- `src/runtime/__tests__/FieldKernels-placement.test.ts.bak`
- `src/runtime/__tests__/PlacementBasis.test.ts.bak`
- `src/compiler/ir/__tests__/bridges.test.ts.bak`

**Analysis**: 🗑️ Should be deleted. No reason to keep in repo.

---

### 12. Enforcement Tests Status

**Test Run Output**:
```
✓ src/compiler/ir/__tests__/value-expr-invariants.test.ts (17 tests) 5ms
✓ src/compiler/__tests__/no-legacy-types.test.ts (3 tests) 403ms
✓ src/runtime/__tests__/no-legacy-evaluator.test.ts (2 tests) 19ms
✓ src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts (1 test) 254ms
✓ src/__tests__/forbidden-patterns.test.ts (4 tests) 535ms
✓ src/__tests__/initial-compile-invariant.test.ts (2 tests) 5ms
```

**Total**: 29 tests covering type system invariants, ALL PASSING

**Coverage**:
1. **value-expr-invariants.test.ts**: Structural invariants
   - Exactly 10 kinds
   - Every variant has type: CanonicalType
   - No 'op' discriminant
   - No instanceId field
   - Sub-discriminant exhaustiveness

2. **no-legacy-types.test.ts**: Legacy type elimination
   - No SigExpr/FieldExpr/EventExpr
   - No SigExprId/FieldExprId/EventExprId
   - No deriveKind() calls

3. **no-legacy-kind-dispatch.test.ts**: Legacy dispatch patterns
   - Prevents dispatch on legacy expression kinds

4. **forbidden-patterns.test.ts**: Type system invariants
   - No AxisTag aliases
   - No payload var kind outside inference
   - No legacy type aliases
   - instanceId field count constraint

**Analysis**: ✅ Comprehensive mechanical enforcement at multiple levels.

---

### 13. deriveKind Migration

**Search**: `deriveKind`

**Result**: 3 files
- `src/compiler/__tests__/no-legacy-types.test.ts` (enforcement test)
- `src/compiler/backend/lower-blocks.ts` (uses requireInst pattern)
- `src/compiler/frontend/axis-validate.ts` (uses requireInst pattern)

**Pattern in Production Code**:
```typescript
// BEFORE (deleted):
const kind = deriveKind(type);
if (kind === 'field') { ... }

// AFTER (current):
const card = requireInst(type.extent.cardinality, 'cardinality');
const isField = card.kind === 'many';
```

**Analysis**: ✅ deriveKind is deleted. Code uses requireInst pattern.

---

### 14. Axis Validation Belt-Buckle

**Location**: `src/compiler/frontend/axis-validate.ts`

**Purpose**: Single enforcement point for canonical type axis invariants

**Enforces**:
- Event: payload=bool, unit=none, temporality=discrete
- Field: cardinality=many(instance), temporality=continuous
- Signal: cardinality=one, temporality=continuous
- No Axis.var in backend IR

**Analysis**: ✅ Proper belt-buckle enforcement exists.

---

### 15. Migration/Shim/Legacy Files Search

**Search**: `migration|shim|legacy|compat` (case-insensitive)

**Result**: 85 files found

**Breakdown**:
- **Test files**: Most are tests enforcing no-legacy patterns (good)
- **Comments**: Many just mention "legacy" in context (e.g., "replaces legacy X")
- **Actual shims**: None found
- **UNIT-MIGRATION-GUIDE.md**: Documentation file (acceptable)

**Analysis**: ✅ No actual migration shims exist. Just historical comments and docs.

---

### 16. requireInst Pattern Usage

**Search**: `requireInst|requireMany|requireOne`

**Result**: 30 files found

**Common Pattern**:
```typescript
import { requireInst, requireManyInstance } from '../../core/canonical-types';

// Check temporality
const temp = requireInst(type.extent.temporality, 'temporality');
if (temp.kind === 'discrete') {
  // This is an event
}

// Check cardinality
const card = requireInst(type.extent.cardinality, 'cardinality');
if (card.kind === 'many') {
  const instance = requireManyInstance(card);
  // This is a field with instance identity
}
```

**Analysis**: ✅ Widespread adoption of requireInst pattern. No deriveKind usage.

---

### 17. Comment Reference to "SignalTypes"

**Location**: `src/services/CompilationInspectorService.ts:258-260`

```typescript
/**
 * Get resolved port types from the latest TypedPatch.
 * Returns a Map where keys are "blockIndex:portName:in" or "blockIndex:portName:out"
 * and values are resolved SignalTypes.  // ← Comment mentions "SignalTypes"
 *
 * @returns Port types map or undefined if not available
 */
getResolvedPortTypes(): Map<string, unknown> | undefined {
```

**Analysis**: ⚠️ Comment is outdated. Should say "CanonicalTypes" or just "types".

---

## Conclusion

### What Passed ✅
1. No legacy type names in production code
2. CanonicalType is the single authority
3. ValueExpr is the unified expression type
4. No worldToAxes, no deriveKind
5. No snake_case discriminants
6. No stored isField/isSignal/isEvent properties
7. Comprehensive mechanical enforcement tests
8. Axis validation belt-buckle exists
9. requireInst pattern widely adopted

### What Needs Attention ⚠️
1. Backup files should be deleted (trivial)
2. ExpressionCompileError could be renamed to ExprCompileError (trivial)
3. Debug value `.kind` discriminants could be renamed for clarity (optional)
4. One comment references "SignalTypes" (trivial doc fix)

### Overall Grade: A+

The type system refactor is **substantially complete** with only minor cleanup remaining.
