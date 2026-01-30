---
topic: 05b
name: Migration - Unified ValueExpr IR
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/migration/t2_value-expr.md
category: unimplemented
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: ["topic-05a (unit restructure should happen first or concurrently)"]
blocks: ["topic-04 WI-3 (exprIndex naming depends on ValueExpr)"]
priority: P3
---

# Context: Topic 05b — Unified ValueExpr IR (Unimplemented)

## What the Spec Requires

1. Single `ValueExpr` union type replacing SigExpr, FieldExpr, EventExpr.
2. 6 variants: `ValueExprConst`, `ValueExprExternal`, `ValueExprIntrinsic`, `ValueExprKernel`, `ValueExprState`, `ValueExprTime`.
3. All variants share `ValueExprBase { kind: string, type: CanonicalType }`.
4. All 24 legacy variants map to exactly one of the 6 new variants.
5. `kind` is the discriminant on all variants (Resolution A1).
6. After migration, single codepath converts legacy to ValueExpr (frontend), and backend consumes ValueExpr only.
7. No `instanceId` field on expressions that carry `type: CanonicalType` (Guardrail 10).

## Current State (Topic-Level)

### How It Works Now
The IR in `src/compiler/ir/types.ts` defines three separate expression unions:
- **SigExpr**: 10 variants (const, slot, time, external, map, zip, stateRead, shapeRef, reduceField, eventRead)
- **FieldExpr**: 9 variants (const, intrinsic, broadcast, map, zip, zipSig, stateRead, pathDerivative, placement)
- **EventExpr**: 5 variants (const, pulse, wrap, combine, never)

Each variant already carries `type: CanonicalType` and uses `kind` as discriminant (good alignment). The evaluators (`SignalEvaluator.ts`, `FieldKernels.ts`, `EventEvaluator.ts`) process these separately. The compiler passes (`lower-blocks.ts`, `schedule-program.ts`) emit expressions into separate arrays (sigExprs, fieldExprs, eventExprs) in `CompiledProgramIR`.

### Patterns to Follow
- All expression types already use `kind` discriminant and `type: CanonicalType`
- Comments in FieldExprMap/Zip already note "instanceId derived via requireManyInstance(expr.type)"
- The IRBuilder has separate methods for sig/field/event construction
- Hash-consing in IRBuilder is already expression-family-aware

## Work Items

### WI-1: Define unified ValueExpr type
**Category**: UNIMPLEMENTED
**Priority**: P3
**Spec requirement**: Single ValueExpr union with 6 variants.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/types.ts` | New ValueExpr definition | new |
| `src/compiler/ir/types.ts` | Legacy SigExpr/FieldExpr/EventExpr | 84-351 |
**Current state**: Three separate unions.
**Required state**: Single ValueExpr union. Legacy types can remain temporarily as aliases during migration.
**Suggested approach**: Define ValueExpr and its 6 variants alongside existing types. Create a mapping layer that converts legacy expressions to ValueExpr. Then incrementally migrate consumers to use ValueExpr directly. Do NOT try to do this as a big-bang change — it touches too many files.
**Depends on**: none (can be done in parallel with unit restructure)
**Blocks**: Full backend migration to ValueExpr-only consumption

### WI-2: Remove redundant instanceId from field expressions
**Category**: UNIMPLEMENTED
**Priority**: P4
**Spec requirement**: Guardrail 10 — instance identity lives in type, not node fields.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/types.ts` | FieldExprIntrinsic, FieldExprPlacement, FieldExprStateRead | 234-293 |
| `src/runtime/Materializer.ts` | Reads instanceId from expressions | various |
| `src/runtime/ScheduleExecutor.ts` | Reads instanceId from steps | various |
**Current state**: `instanceId` is a separate field alongside `type: CanonicalType`.
**Required state**: `instanceId` removed from expression types; callers use `requireManyInstance(expr.type)`.
**Suggested approach**:
1. Add `requireManyInstance` calls at all current `expr.instanceId` usage sites.
2. Verify tests pass with the derived value.
3. Remove the field from the type definitions.
Note: Step types (StepMaterialize, StepRender, etc.) may keep instanceId as a performance optimization — these are execution artifacts, not type system objects.
**Depends on**: none
**Blocks**: Clean ValueExpr migration

### WI-3: Migrate evaluators from three families to unified ValueExpr
**Category**: UNIMPLEMENTED
**Priority**: P5 (deferred — large effort)
**Spec requirement**: Backend consumes ValueExpr only.
**Files involved**:
| File | Role | Lines |
|------|------|-------|
| `src/runtime/SignalEvaluator.ts` | SigExpr evaluator | all |
| `src/runtime/FieldKernels.ts` | FieldExpr evaluator | all |
| `src/runtime/EventEvaluator.ts` | EventExpr evaluator | all |
| `src/compiler/backend/lower-blocks.ts` | Emits SigExpr/FieldExpr/EventExpr | all |
| `src/compiler/backend/schedule-program.ts` | Builds schedule from expressions | all |
**Current state**: Three separate evaluators, three separate expression arrays in CompiledProgramIR.
**Required state**: Single evaluator dispatching on `deriveKind(expr.type)` + `expr.kind`.
**Suggested approach**: This is a large migration that should be done incrementally after WI-1 establishes the ValueExpr type. The mapping table in the spec provides a clear guide for each legacy variant. Start with the simplest variants (const, time, external) and work toward complex ones (kernel, state).
**Depends on**: WI-1
**Blocks**: none (current system works; this is spec alignment)
