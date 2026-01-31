# Implementation Context: Sprint valueexpr-canonical-table

## Current State

### Expression IR (src/compiler/ir/types.ts)
- **SigExpr**: 10 variants, discriminant `kind`, all carry `type: CanonicalType`
- **FieldExpr**: 9 variants, discriminant `kind`, all carry `type: CanonicalType`, 6 have `instanceId`
- **EventExpr**: 5 variants, discriminant `kind`, all carry `type: CanonicalType`
- **Total**: 24 variants across 3 separate union types

### Expression IDs (src/compiler/ir/Indices.ts)
- `SigExprId`, `FieldExprId`, `EventExprId` — dense numeric branded types
- IRBuilderImpl stores 3 separate arrays: `sigExprs[]`, `fieldExprs[]`, `eventExprs[]`

### ValueRefPacked (src/compiler/ir/lowerTypes.ts)
- Discriminant: `k: 'sig' | 'field' | 'event' | 'instance' | 'scalar'`
- Each variant carries `type: CanonicalType` (except instance/scalar)
- `assertKindAgreement()` validates k matches deriveKind(type) — 3 call sites

### Runtime Evaluators
- `SignalEvaluator.ts`: evaluateSigExpr() — switch on SigExpr.kind (10 cases)
- `Materializer.ts`: fillBuffer() — switch on FieldExpr.kind (9 cases)
- `EventEvaluator.ts`: evaluateEvent() — switch on EventExpr.kind (5 cases)
- `ScheduleExecutor.ts`: main loop switches on Step.kind, delegates to above

### DerivedKind (src/core/canonical-types.ts)
- `DerivedKind = 'signal' | 'field' | 'event'` — deprecated, slated for removal
- `deriveKind()` — 6 call sites in 3 files (canonical-types.ts, axis-validate.ts, lowerTypes.ts)
- Zero-cardinality maps to 'signal' (lossy)

### instanceId on FieldExpr
Required (3): FieldExprIntrinsic, FieldExprPlacement, FieldExprStateRead
Optional (3): FieldExprMap, FieldExprZip, FieldExprZipSig
Runtime duck-typing: ScheduleExecutor.ts lines 499-506 uses `'instanceId' in expr`

## Key Architecture Decisions

1. **ValueExpr is a new canonical table** — NOT a union of legacy types
2. **Top-level kind is unique and small** — no collision with legacy discriminants
3. **Legacy map/zip → kernel** with kernelId sub-discriminant
4. **Three evaluators stay separate** — gate on CanonicalType, dispatch on ValueExpr.kind
5. **Zero-cardinality = universal donor** — no lifting mechanism needed
6. **instanceId derived from type** — `requireManyInstance(expr.type)`
7. **DerivedKind deprecated** — consumers inspect CanonicalType directly

## Files That Will Change

### P0-1 (ValueExpr definition)
- NEW: `src/compiler/ir/value-expr.ts`
- UPDATE: `src/compiler/ir/Indices.ts` (add ValueExprId)

### P0-3 (instanceId removal) — HIGH IMPACT
Core IR types:
- `src/compiler/ir/types.ts` (remove instanceId from 6 FieldExpr variants)
- `src/compiler/ir/IRBuilder.ts` (remove instanceId params from field* methods)
- `src/compiler/ir/IRBuilderImpl.ts` (update builder implementations)

Runtime consumers:
- `src/runtime/ScheduleExecutor.ts` (fieldStateWrite handler — CRITICAL)
- `src/runtime/Materializer.ts` (placement handler)

Compiler consumers:
- `src/compiler/backend/schedule-program.ts`
- `src/compiler/compile.ts`

Block lowering (pass instanceId to IR builder):
- `src/blocks/array-blocks.ts`
- `src/blocks/color-blocks.ts`
- `src/blocks/field-blocks.ts`
- `src/blocks/field-operations-blocks.ts`
- `src/blocks/geometry-blocks.ts`
- `src/blocks/identity-blocks.ts`
- `src/blocks/instance-blocks.ts`
- `src/blocks/math-blocks.ts`
- `src/blocks/path-blocks.ts`
- `src/blocks/path-operators-blocks.ts`
- `src/blocks/render-blocks.ts`
- `src/blocks/time-blocks.ts`

### P0-5 (DerivedKind deprecation)
- `src/core/canonical-types.ts` (annotate, update helpers)
- `src/compiler/frontend/axis-validate.ts` (replace deriveKind calls)
- `src/compiler/ir/lowerTypes.ts` (update assertKindAgreement)

## Test Coverage

### Expression-related tests
- `src/compiler/__tests__/compile.test.ts` — Full compilation pipeline
- `src/compiler/__tests__/steel-thread.test.ts` — End-to-end execution
- `src/compiler/__tests__/instance-unification.test.ts` — Field instance inference
- `src/compiler/backend/__tests__/backend-preconditions.test.ts` — Backend pipeline
- `src/compiler/ir/__tests__/bridges.test.ts` — IR bridges (2 tests pre-existing failures)
- `src/blocks/__tests__/*.test.ts` — Individual block lowering tests
- `src/runtime/__tests__/FieldKernels-placement.test.ts`
- `src/runtime/__tests__/field-kernel-contracts.test.ts`
- `src/runtime/__tests__/EventEvaluator.test.ts`

### Baseline test status
- 1982 passing, 3 failing (pre-existing), 15 skipped
- 5 test failures total (all pre-existing, not caused by type system work)
