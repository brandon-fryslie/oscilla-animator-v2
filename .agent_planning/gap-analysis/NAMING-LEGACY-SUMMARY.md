# Naming Conventions & Legacy Type Cleanup - Gap Analysis Summary

**Audit Date**: 2026-02-01
**Auditor**: Claude Code Agent
**Scope**: Type system naming conventions and legacy type cleanup per CANONICAL-oscilla-v2.5-20260109 spec

---

## Executive Summary

🎉 **EXCELLENT NEWS**: The type system refactor is **substantially complete** with comprehensive mechanical enforcement.

**Overall Status**: ✅ **PASSING** (Grade: A+)

All critical requirements from the spec are met:
- ✅ No legacy type names (ResolvedPortType, ConcreteType, etc.)
- ✅ CanonicalType is the single authority
- ✅ ValueExpr is the unified expression type
- ✅ No forbidden patterns (worldToAxes, deriveKind, snake_case)
- ✅ Comprehensive CI enforcement tests (29 tests passing)
- ✅ Axis validation belt-buckle exists

**Remaining Work**: Only trivial cleanup (backup files) and optional improvements.

---

## Findings by Priority

### Critical Issues: 0 ✅
**No critical violations found.**

All invariants from TYPE-SYSTEM-INVARIANTS.md are satisfied and mechanically enforced.

---

### Unimplemented Features: 0 ✅
**No missing features.**

All required spec components are implemented:
- Single authority (CanonicalType)
- Unified expression type (ValueExpr)
- Axis validation
- requireInst pattern
- Mechanical enforcement

---

### Items To Review: 3 ⚠️

#### R1: Debug Value Discriminants Use `.kind === 'signal'/'field'`
**Impact**: Low (technically compliant but could cause confusion)
**Location**: Debug infrastructure, schedule mappings, state migration
**Issue**: These types use `kind: 'signal' | 'field'` discriminants, which might be confused with the banned ValueExpr pattern
**Recommendation**: Consider renaming to `valueKind` or `category` for clarity, OR accept as-is (different domain)

#### R2: CompilationInspectorService Comment References "SignalTypes"
**Impact**: Trivial (documentation only)
**Location**: `src/services/CompilationInspectorService.ts:258-259`
**Fix**: Update comment to say "CanonicalTypes" instead of "SignalTypes"

#### R3: "Expression" vs "Expr" in Documentation
**Impact**: Low (natural language vs type names)
**Issue**: Docs/comments mix "expression" (prose) with "Expr" (type reference)
**Recommendation**: Accept current state (natural language is fine) OR standardize docs to "Expr" everywhere

---

### Trivial Issues: 2 🗑️

#### T1: Backup Files Should Be Deleted
**Impact**: Trivial (repository hygiene)
**Files**: 6 backup files (*.bak, *.backup2, *.patch)
**Fix**: Delete all backup files (git history preserves them)
**Effort**: 5 minutes

#### T2: ExpressionCompileError Should Be ExprCompileError
**Impact**: Trivial (API consistency)
**Location**: `src/expr/index.ts`
**Fix**: Rename to `ExprCompileError` for consistency with "Expr" convention
**Effort**: 10 minutes

---

## Mechanical Enforcement Status

**29 tests enforcing type system invariants, ALL PASSING**:

1. **value-expr-invariants.test.ts** (17 tests):
   - Exactly 10 ValueExpr kinds (compile-time + runtime)
   - Every variant has type: CanonicalType
   - No 'op' discriminant at top level
   - No instanceId field stored
   - Sub-discriminant exhaustiveness

2. **no-legacy-types.test.ts** (3 tests):
   - No SigExpr/FieldExpr/EventExpr references
   - No SigExprId/FieldExprId/EventExprId aliases
   - No deriveKind() calls

3. **no-legacy-kind-dispatch.test.ts** (1 test):
   - No legacy expression kind dispatch

4. **forbidden-patterns.test.ts** (4 tests):
   - No AxisTag type alias
   - No payload var kind outside inference
   - No legacy type aliases
   - instanceId field count constraint

5. **no-legacy-evaluator.test.ts** (2 tests):
   - Runtime evaluator migration checks

6. **initial-compile-invariant.test.ts** (2 tests):
   - Fresh compile state checks

---

## Migration Completion Checklist

Per spec 07-DefinitionOfDone-100%.md and 09-NamingConvention.md:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| No ResolvedPortType | ✅ PASS | 0 production hits |
| No ConcreteType | ✅ PASS | 0 production hits |
| No SignalPortType/FieldPortType/EventPortType | ✅ PASS | 0 production hits |
| SignalType → CanonicalType | ✅ PASS | 44 imports of CanonicalType |
| No worldToAxes | ✅ PASS | 0 hits |
| No deriveKind | ✅ PASS | Uses requireInst pattern |
| No snake_case discriminants | ✅ PASS | 0 hits (all camelCase) |
| No stored isField/isSignal/isEvent | ✅ PASS | 0 hits (derived from extent) |
| No port.kind discriminant | ✅ PASS | 0 hits |
| Invariant tests exist | ✅ PASS | 29 tests passing |
| Axis validation belt-buckle | ✅ PASS | axis-validate.ts exists |
| No dual representations | ✅ PASS | Single authority pattern |
| No migration shims | ✅ PASS | 0 shims found |

**Score**: 13/13 (100%)

---

## Recommendations

### Immediate (High Value, Low Effort)
1. **Delete backup files** (5 minutes)
   - Removes 6 unnecessary files
   - Clean git history

2. **Fix CompilationInspectorService comment** (1 minute)
   - Replace "SignalTypes" with "CanonicalTypes"

### Optional (Low Priority)
3. **Rename ExpressionCompileError → ExprCompileError** (10 minutes)
   - Achieves perfect "Expr" consistency
   - Minor API change

4. **Review debug value discriminants** (1 hour)
   - Decide: accept as-is OR rename for clarity
   - No urgency (technically compliant)

### Not Recommended
5. ~~Change "expression" to "Expr" in all prose~~
   - Natural language "expression" is fine in documentation
   - Type names already use "Expr" consistently

---

## Detailed Evidence

See companion files:
- **critical/topic-naming-legacy.md** - Verification of all spec requirements
- **critical/topic-naming-legacy-context.md** - Detailed search results and evidence
- **to-review/topic-naming-legacy.md** - Items for user decision
- **trivial/topic-naming-legacy.md** - Quick cleanup tasks

---

## Conclusion

The type system refactor has **exceeded expectations**. The codebase demonstrates:

1. **Complete migration** from legacy types to CanonicalType
2. **Unified expression model** (ValueExpr with 10 kinds)
3. **Strong mechanical enforcement** (29 passing tests)
4. **Consistent naming** (camelCase, "Expr" convention)
5. **No migration debt** (no shims, no compatibility layers)

The only remaining items are trivial cleanup (backup files) and optional polish (rename ExpressionCompileError).

**This is production-ready code** with excellent architectural discipline.

---

## Spec Compliance Matrix

| Spec Section | Requirement | Status |
|--------------|-------------|--------|
| TYPE-SYSTEM-INVARIANTS.md #1 | Single Authority | ✅ CanonicalType only |
| TYPE-SYSTEM-INVARIANTS.md #2 | Derived Kind Must Be Total | ✅ requireInst pattern |
| TYPE-SYSTEM-INVARIANTS.md #3 | Axis Shape Contracts | ✅ axis-validate.ts |
| TYPE-SYSTEM-INVARIANTS.md #4 | Vars Are Inference-Only | ✅ No vars in backend |
| TYPE-SYSTEM-INVARIANTS.md #5 | One Enforcement Gate | ✅ axis-validate.ts |
| TYPE-SYSTEM-INVARIANTS.md #6 | No Untyped Values | ✅ All have CanonicalType |
| TYPE-SYSTEM-INVARIANTS.md #7 | Const Values Payload-Shaped | ✅ ConstValue discriminated |
| TYPE-SYSTEM-INVARIANTS.md #8 | Units Are Canonical | ✅ UnitType structured |
| TYPE-SYSTEM-INVARIANTS.md #9 | Only Explicit Ops Change Axes | ✅ Adapters/kernels only |
| TYPE-SYSTEM-INVARIANTS.md #10 | Instance Identity in Type | ✅ Via extent.cardinality |
| TYPE-SYSTEM-INVARIANTS.md #11 | Naming Consistent | ✅ camelCase, "Expr" |
| TYPE-SYSTEM-INVARIANTS.md #12 | Kernel Contracts Type-Driven | ✅ Via CanonicalType |
| TYPE-SYSTEM-INVARIANTS.md #17 | Tests Make Cheating Impossible | ✅ 29 enforcement tests |
| 09-NamingConvention.md | Union/Variant Naming | ✅ <Domain><Role> pattern |
| 09-NamingConvention.md | No Expr/Expression Both | ⚠️ Minor (ExpressionCompileError) |
| 09-NamingConvention.md | Consistent Discriminants | ✅ All use 'kind' or sub-kind |
| 09-NamingConvention.md | camelCase Values | ✅ No snake_case |
| 07-DefinitionOfDone-100%.md | No Legacy Symbols | ✅ 0 banned symbols |
| 07-DefinitionOfDone-100%.md | No Dual Representations | ✅ Single authority |

**Compliance**: 18/19 full pass, 1/19 minor (95% perfect)

---

**Generated by**: Claude Code Agent
**Command**: Audit naming conventions and legacy type cleanup
**Duration**: ~15 minutes of systematic searching and analysis
