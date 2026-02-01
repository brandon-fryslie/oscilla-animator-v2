# Sprint: legacy-deletion - Delete Legacy Expression Types & Bridge
Generated: 2026-01-31T16:00:00Z
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION (after direct-lowering sprint)
Depends on: SPRINT-20260131-160000-direct-lowering

## Sprint Goal
Delete all legacy expression types, the bridge pass, and legacy builder methods. Enforce with tripwire.

## Scope
**Deliverables:**
1. Legacy type definitions deleted
2. Bridge pass deleted
3. Legacy builder methods removed
4. Tripwire enforcement for legacy expression types

## Work Items

### WI-1: Delete Legacy Expression Type Definitions
**Confidence: HIGH**

**What**: Remove SigExpr, FieldExpr, EventExpr unions and SigExprId, FieldExprId, EventExprId branded types.

**Files:**
- `src/compiler/ir/types.ts` — Delete SigExpr (9 variants), FieldExpr (8 variants), EventExpr (5 variants) and all their sub-interfaces
- `src/compiler/ir/Indices.ts` — Delete SigExprId, FieldExprId, EventExprId types and factory functions
- `src/types/index.ts` — Remove re-exports of deleted types

**Acceptance Criteria:**
- [ ] No SigExpr/FieldExpr/EventExpr type definitions exist anywhere in src/
- [ ] No SigExprId/FieldExprId/EventExprId type definitions exist anywhere in src/
- [ ] TypeScript compiles clean

---

### WI-2: Delete lowerToValueExprs Bridge Pass
**Confidence: HIGH**

**What**: Delete the bridge pass and its tests.

**Files to delete:**
- `src/compiler/ir/lowerToValueExprs.ts` (342 lines)
- `src/compiler/ir/__tests__/lowerToValueExprs.test.ts` (337 lines)

**Also update:**
- `src/compiler/compile.ts` — Remove import and call to lowerToValueExprs

**Acceptance Criteria:**
- [ ] lowerToValueExprs.ts deleted
- [ ] No imports of lowerToValueExprs anywhere
- [ ] compile.ts no longer calls bridge pass

---

### WI-3: Remove Legacy Builder Methods from IRBuilder
**Confidence: HIGH**

**What**: Remove `sig*`, `field*`, `event*` methods and `getSigExprs`/`getFieldExprs`/`getEventExprs` from IRBuilder interface and implementation.

**Files:**
- `src/compiler/ir/IRBuilder.ts` — Remove legacy method signatures
- `src/compiler/ir/IRBuilderImpl.ts` — Remove legacy implementations and `sigExprs`/`fieldExprs`/`eventExprs` arrays

**Also update:**
- `src/__tests__/ir-test-helpers.ts` — Delete `extractSigExpr`/`extractFieldExpr`/`extractEventExpr` helpers
- `src/compiler/ir/__tests__/no-instanceid-on-fieldexpr.test.ts` — Rewrite to use ValueExpr
- `src/compiler/__tests__/instance-unification.test.ts` — Rewrite to use getValueExprs()

**Acceptance Criteria:**
- [ ] No `sig*`/`field*`/`event*` methods in IRBuilder interface
- [ ] No legacy expression arrays in IRBuilderImpl
- [ ] All tests updated to use ValueExpr API

---

### WI-4: Update Tripwire Enforcement
**Confidence: HIGH**

**What**: Expand the existing tripwire test to catch legacy expression type references, not just legacy evaluator imports.

**Banned patterns** (in production code under src/, excluding __tests__/):
- `SigExpr` (as type or value)
- `FieldExpr` (as type or value)
- `EventExpr` (as type or value)
- `SigExprId`
- `FieldExprId`
- `EventExprId`
- `lowerToValueExprs`
- `getSigExprs`
- `getFieldExprs`
- `getEventExprs`
- `sigToValue`
- `fieldToValue`
- `eventToValue`

**Files:**
- `src/runtime/__tests__/no-legacy-evaluator.test.ts` — Expand or rename to `no-legacy-expressions.test.ts`

**Acceptance Criteria:**
- [ ] Tripwire test fails if any banned pattern appears in production src/
- [ ] Test passes with current codebase
- [ ] Clear error message explains what's wrong and what to do instead

## Dependencies
- All WIs depend on direct-lowering sprint being complete
- WI-1 and WI-2 can be done in parallel
- WI-3 depends on WI-1 (removing methods that return deleted types)
- WI-4 can be done at any point

## Risks
- **Missed reference causes compile failure** — Mitigated by: TypeScript compiler will catch any remaining references when types are deleted
- **Test helpers used by many tests** — Mitigated by: update tests to use ValueExpr equivalents before deleting helpers
