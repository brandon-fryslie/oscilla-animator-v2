# Implementation Context: Sprint valueexpr-adapter-deferred

## File Map

| Item | Primary File | Lines | Secondary Files |
|------|-------------|-------|-----------------|
| #23 ValueExpr | `src/compiler/ir/types.ts` | 84-351 | evaluators, compiler backend |
| #24 discriminants | `src/compiler/ir/types.ts` | all kind values | — |
| #25 instanceId removal | `src/compiler/ir/types.ts` | 234-293 | `Materializer.ts`, `ScheduleExecutor.ts` |
| #26 AdapterSpec IDs | `src/graph/adapters.ts` | 65-258 | `src/types/index.ts` |
| #27 ExtentPattern | `src/graph/adapters.ts` | 35-37, 278-297 | — |
| #28 lift ops | `src/compiler/ir/types.ts`, `IRBuilderImpl.ts` | const methods | — |
| #29 ValueExprConst | `src/compiler/ir/types.ts` | const variants | — |

## Execution Order (suggested)

1. **#29** Verify ValueExprConst shape (audit — may already conform)
2. **#25** Remove instanceId from field expressions (isolated, unblocks #23)
3. **#24** Align discriminant values (isolated cleanup)
4. **#23** Define unified ValueExpr type (largest item)
5. **#26** Branded IDs on AdapterSpec (isolated)
6. **#27** Per-axis ExtentPattern (builds on #26)
7. **#28** Zero-cardinality lifts (may need spec clarification)

## ValueExpr Mapping (from spec)

| Legacy | → ValueExpr Variant |
|--------|-------------------|
| SigExprConst, FieldExprConst, EventExprConst, EventExprNever | ValueExprConst |
| SigExprExternal | ValueExprExternal |
| FieldExprIntrinsic, FieldExprPlacement | ValueExprIntrinsic |
| SigExprMap, SigExprZip, FieldExprMap, FieldExprZip, FieldExprZipSig, SigExprReduceField, EventExprCombine, EventExprWrap | ValueExprKernel |
| SigExprStateRead, FieldExprStateRead, SigExprEventRead, EventExprPulse | ValueExprState |
| SigExprTime | ValueExprTime |
| SigExprShapeRef | TBD (resource system) |
| FieldExprBroadcast | ValueExprKernel (broadcast is a kernel) |
| FieldExprPathDerivative | ValueExprKernel or ValueExprIntrinsic |

## Key Patterns

- IR expression types use `kind` discriminant and `type: CanonicalType`
- IRBuilder has separate methods per family — will need unified methods
- Hash-consing is expression-family-aware — will need update
- Step types in schedule may keep performance fields (instanceId) — these are execution artifacts
