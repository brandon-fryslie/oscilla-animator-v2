# Definition of Done: Sprint valueexpr-canonical-table

## Gate Criteria

### Per-Item Gates
- [ ] P0-1: `ValueExpr` union defined in `src/compiler/ir/value-expr.ts` with 9 unique `kind` values; `ValueExprId` branded type exists; no instanceId on any variant; TypeScript compiles
- [ ] P0-2: Complete legacy→ValueExpr mapping documented (all 24 variants accounted for)
- [ ] P0-3: No `instanceId` field on any FieldExpr variant; all 6 removed; callers use `requireManyInstance(expr.type)`; ScheduleExecutor updated; no test regressions
- [ ] P0-4: One consumer reads ValueExpr and dispatches on `kind` + CanonicalType; consumer has test coverage
- [ ] P0-5: `DerivedKind`/`deriveKind()` annotated @deprecated; axis-validate.ts and lowerTypes.ts use CanonicalType directly; no new deriveKind call sites

### Sprint-Level Gates
- [ ] `npx tsc --noEmit` exits 0
- [ ] No test regressions (same or fewer failures than baseline: 5 pre-existing)
- [ ] `grep -r "instanceId" src/compiler/ir/types.ts` returns only Step/Schedule types (not FieldExpr)
- [ ] `ValueExpr` type has exactly 9 top-level kind values
- [ ] No `op` discriminant on any ValueExpr variant
