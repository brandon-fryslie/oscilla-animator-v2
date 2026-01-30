---
topic: 05b
name: Migration - Unified ValueExpr IR
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_value-expr.md
category: unimplemented
audited: 2026-01-29
item_count: 3
priority_reasoning: >
  ValueExpr unification is not implemented. The codebase still uses three separate
  expression families (SigExpr, FieldExpr, EventExpr) with 24+ variants total.
  This is the central migration target but has not been started.
---

# Topic 05b: Migration - Unified ValueExpr IR — Unimplemented Gaps

## Items

### U-1: Three separate expression families still exist instead of unified ValueExpr
**Problem**: The spec requires a single `ValueExpr` union with 6 variants and `kind` discriminant. The implementation has `SigExpr` (10 variants), `FieldExpr` (9 variants), and `EventExpr` (5 variants) as three separate unions.
**Evidence**:
- `src/compiler/ir/types.ts:84-94` — SigExpr with 10 variants
- `src/compiler/ir/types.ts:213-222` — FieldExpr with 9 variants
- `src/compiler/ir/types.ts:316-321` — EventExpr with 5 variants
- No `ValueExpr` type exists anywhere in the codebase (grep returns 0 results)
**Obvious fix?**: No — this is the largest migration item, affecting the entire IR, all compiler passes, all runtime evaluators.

### U-2: Expression discriminants use different `kind` values than spec
**Problem**: The spec requires unified `kind` values (`'const'`, `'external'`, `'intrinsic'`, `'kernel'`, `'state'`, `'time'`). Current expressions use family-specific kinds (`'slot'`, `'map'`, `'zip'`, `'broadcast'`, `'stateRead'`, `'pulse'`, `'wrap'`, etc.). The spec's mapping table shows how each legacy variant maps to one of 6 ValueExpr variants.
**Evidence**:
- `src/compiler/ir/types.ts:97` — SigExprConst uses `kind: 'const'` (matches)
- `src/compiler/ir/types.ts:103` — SigExprSlot uses `kind: 'slot'` (maps to ValueExprExternal)
- `src/compiler/ir/types.ts:121-125` — SigExprMap uses `kind: 'map'` (maps to ValueExprKernel)
- `src/compiler/ir/types.ts:253-257` — FieldExprBroadcast uses `kind: 'broadcast'` (maps to ValueExprKernel with kernelId `broadcast`)
**Obvious fix?**: No — requires full IR migration.

### U-3: FieldExprIntrinsic, FieldExprStateRead, FieldExprPlacement carry separate instanceId field
**Problem**: The spec (Guardrail 10) says instance identity should live in the type's extent.cardinality, not as a separate field. Use `requireManyInstance(type)` to extract. Three field expression types carry redundant `instanceId` fields.
**Evidence**:
- `src/compiler/ir/types.ts:236` — `FieldExprIntrinsic.instanceId: InstanceId`
- `src/compiler/ir/types.ts:247` — `FieldExprPlacement.instanceId: InstanceId`
- `src/compiler/ir/types.ts:291` — `FieldExprStateRead.instanceId: InstanceId`
- All three also carry `type: CanonicalType` which contains the same instance via extent.cardinality
- Comment at line 264 acknowledges: "instanceId derived via requireManyInstance(expr.type)"
**Obvious fix?**: Partially — the comments show awareness. Can be fixed incrementally by removing the field and using `requireManyInstance(expr.type)` at usage sites. However, some Step types (StepMaterialize, StepRender) also carry instanceId for runtime performance.
