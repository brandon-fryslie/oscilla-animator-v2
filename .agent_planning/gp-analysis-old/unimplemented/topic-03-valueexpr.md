---
topic: 03
name: ValueExpr Unified IR
spec_file: design-docs/canonical-types/01-CanonicalTypes.md
category: unimplemented
audited: 2026-01-29T00:03:26Z
item_count: 2
blocks_critical: []
---

# Topic 03: ValueExpr Unified IR — Unimplemented

## GATING CONDITION

**U-1 MUST NOT START until C-4 (axis validation) is implemented and passing.**

Rationale: Otherwise you'll implement ValueExpr lowering while the frontend can still emit invalid axis combinations. You'd build "lowering that assumes validity" and later discover the source IR was invalid.

## Items

### U-1: Introduce unified ValueExpr IR for backend

**Spec requirement**: Section 2 specifies replacing SigExpr/FieldExpr/EventExpr with a single ValueExpr[] table:
```typescript
type ValueExprId = number;
type ValueExpr =
  | { op: 'const', type: CanonicalType, value: ConstValue }
  | { op: 'external', type: CanonicalType, channel: string }
  | { op: 'intrinsic', type: CanonicalType, which: 'index'|'normIndex'|'randomId'|'uv'|'rank'|'seed' }
  | { op: 'kernel', type: CanonicalType, kernelId: KernelId, args: ValueExprId[] }
  | { op: 'phi', type: CanonicalType }
  | { op: 'state', type: CanonicalType, stateOp: StateOp, args: ValueExprId[] }
```

**Scope**: new module + refactor lowering

**Evidence of absence**: No `ValueExpr` type exists. `grep -r "ValueExpr" src/` — only `ValueExprId` in some comments.

**Migration path** (from spec 02-How-To-Get-There.md):
1. Keep existing SigExpr/FieldExpr/EventExpr in frontend
2. Add ValueExpr IR as a lowering target in pass6
3. Lower: SigExpr → ValueExpr with cardinality=one
4. Lower: FieldExpr → ValueExpr with cardinality=many(instance)
5. Lower: EventExpr → ValueExpr with temporality=discrete

**GATE**: Must wait for C-4 to be passing before starting.

---

### U-3: Replace StepEvalSig + StepSlotWriteStrided with unified StepEvalValue

**Spec requirement**: Section 6 of Types-Analysis specifies stride derived from type:
```typescript
StepEvalValue { expr: ExprId; target: ValueSlot }
// Runtime consults slotMeta for stride and writes correct number of components
```

**Scope**: refactor schedule step types

**Evidence of absence**: Current implementation has both:
- `StepEvalSig` (scalar signals) — `src/compiler/ir/types.ts:509-512`
- `StepSlotWriteStrided` (multi-component) — `src/compiler/ir/types.ts:531-535`

**Depends on**: U-1 (ValueExpr IR)
