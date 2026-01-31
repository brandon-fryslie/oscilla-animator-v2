# Explore: ValueExpr Unification State
Timestamp: 2026-01-30T17:00:00Z
Git Commit: ea5725d

## Current Expression System Structure

### Three Expression Families in types.ts

**SigExpr** (10 variants): const, slot, time, external, map, zip, stateRead, shapeRef, reduceField, eventRead
**FieldExpr** (9 variants): const, intrinsic, broadcast, map, zip, zipSig, stateRead, pathDerivative, placement
**EventExpr** (5 variants): const, pulse, wrap, combine, never

Total: 24 variants across 3 unions

### Three Separate ID Types in Indices.ts
- SigExprId (line 36): `number & { __brand: 'SigExprId' }`
- FieldExprId (line 39): `number & { __brand: 'FieldExprId' }`
- EventExprId (line 42): `number & { __brand: 'EventExprId' }`

### IRBuilderImpl: Three Separate Arrays (line 59-61)
```
private sigExprs: SigExpr[] = [];
private fieldExprs: FieldExpr[] = [];
private eventExprs: EventExpr[] = [];
```
Plus three separate hash-consing caches (lines 71-73).

### ValueRefPacked in lowerTypes.ts (lines 32-64)
Discriminant `k: 'sig'|'field'|'event'|'instance'|'scalar'`
Uses assertKindAgreement() which calls deriveKind() (line 77-86)

### deriveKind Usage (6 files)
1. src/core/canonical-types.ts - definition + tryDeriveKind
2. src/compiler/ir/lowerTypes.ts - assertKindAgreement
3. src/compiler/frontend/axis-validate.ts - validateType dispatch
4. src/compiler/backend/lower-blocks.ts - block lowering
5. src/blocks/field-operations-blocks.ts - reduce block
6. src/types/index.ts - re-export

### Runtime Evaluators: Three Separate Files
1. SignalEvaluator.ts - evaluateSignal(sigId, signals[], state) -> number
2. Materializer.ts - materialize(fieldId, instanceId, fields[], signals[], ...) -> ArrayBufferView
3. EventEvaluator.ts - evaluateEvent(exprId, eventExprs[], state, signals[]) -> boolean

### instanceId on FieldExpr Nodes (types.ts)
Present on: FieldExprIntrinsic (line 236), FieldExprPlacement (line 248), FieldExprMap (line 264), FieldExprZip (line 272), FieldExprZipSig (line 281), FieldExprStateRead (line 291)

### Runtime instanceId Usage (ScheduleExecutor.ts)
- Line 271: step.instanceId in materialize step
- Line 499: 'instanceId' in expr && expr.instanceId for fieldStateWrite
- Line 500: instances.get(expr.instanceId as unknown as InstanceId)
- Line 506: String(expr.instanceId) for materialization

### value-expr.ts Does NOT Exist
No file matching **/value-expr* found in src/

### Test Coverage for Expression System
108 total occurrences of SigExpr|FieldExpr|EventExpr across 12 test files.
Key test files:
- hash-consing.test.ts (3 matches)
- EventEvaluator.test.ts (26 matches)
- RenderAssembler.test.ts (29 matches)
- expression-blocks.test.ts (11 matches)
- stateful-primitives.test.ts (3 matches)

### Build State
- Tests: 4 failed, 120 passed (124 total)
- 3 test failures, 1982 passed, 15 skipped
- Failures: LayoutAlongPath missing block, NoTimeRoot validation, plus 2 others
- Typecheck not separately run but `npm run build` includes tsc

### Existing Plan Status
The plan at SPRINT-20260129-200000-valueexpr-adapter-deferred-PLAN.md defines 7 work items (P0-1 through P1-7).
None of them have been started. No STATUS file exists.
No value-expr.ts file has been created.
