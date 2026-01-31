# Evaluation: ValueExpr Unification
Timestamp: 2026-01-30-170000
Git Commit: ea5725d

## Executive Summary
Overall: 0% complete | Critical issues: 3 | Tests reliable: mostly (3 pre-existing failures unrelated)

The ValueExpr unification has NOT started. No code has been written. The existing plan (SPRINT-20260129-200000-valueexpr-adapter-deferred-PLAN.md) is structurally sound but underestimates the scope of runtime changes required. The current expression system is deeply entrenched: 38 files reference SigExprId/FieldExprId/EventExprId, three separate evaluators dispatch on family-specific types, and the runtime ScheduleExecutor uses dynamic property checks (`'instanceId' in expr`) to extract instance identity from field expressions.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| npm run test | 4 files fail / 120 pass | 3 failing tests unrelated to ValueExpr (LayoutAlongPath missing, NoTimeRoot validation) |
| value-expr.ts exists | NO | No file created |
| ValueExpr type defined | NO | Not started |
| instanceId removed from FieldExpr | NO | Present on 6 of 9 FieldExpr variants |
| deriveKind removed | NO | Called in 6 files |

## Missing Checks
- No invariant test asserting "every expression variant has `type: CanonicalType`" (already true, but no mechanical check)
- No test asserting "no Axis.var in backend IR"
- No test asserting "deriveKind is total" (the exhaustive switch exists but no test forces it)
- No CI/lint rule preventing reintroduction of SigExpr/FieldExpr separate arrays after migration

## Findings

### 1. Expression Type Definitions (src/compiler/ir/types.ts)
**Status**: NOT_STARTED (for unification; the existing types are complete and well-structured)
**Evidence**:
- SigExpr: 10 variants (lines 84-182), all have `type: CanonicalType` already
- FieldExpr: 9 variants (lines 213-310), all have `type: CanonicalType` already
- EventExpr: 5 variants (lines 316-351), all have `type: CanonicalType` already
- Good news: Every variant already carries `type: CanonicalType`. The plan's P0-1 "every variant has type: CanonicalType" is already satisfied by the current types.

**Issues**:
- `kind` discriminant values collide across families: both SigExpr and FieldExpr use `'const'`, `'map'`, `'zip'`, `'stateRead'`. A unified ValueExpr union CANNOT use `kind` alone as discriminant without renaming variants.
- This is the #1 design problem the plan does not address. The mapping table in CONTEXT.md acknowledges "const" maps to "ValueExprConst" but does not address how TypeScript narrowing will work when both SigExprConst and FieldExprConst have `kind: 'const'`.

### 2. IRBuilder Interface and Implementation
**Status**: NOT_STARTED
**Evidence**:
- Interface at `src/compiler/ir/IRBuilder.ts` has separate method families: sigConst/fieldConst, sigMap/fieldMap, etc.
- Implementation at `src/compiler/ir/IRBuilderImpl.ts` uses three separate arrays (line 59-61) and three hash-consing caches (lines 71-73)
- The builder's `inferFieldInstance()` (line 472) propagates instanceId through field expression chains

**Issues**:
- Hash consing must be redesigned. Currently uses JSON.stringify per-family. Unified expressions need a single cache with collision-free keys.
- `inferFieldInstance()` relies on field expressions having `instanceId` fields directly. Removing instanceId (plan P0-4) requires this to instead use `requireManyInstance(expr.type)`.

### 3. ValueRefPacked (src/compiler/ir/lowerTypes.ts)
**Status**: NOT_STARTED
**Evidence**:
- Lines 32-64: Discriminant `k: 'sig'|'field'|'event'|'instance'|'scalar'`
- `assertKindAgreement()` at line 77 calls `deriveKind()` to validate k-tag matches type
- LoweredOutput/LoweredInput also use `kind: 'signal'|'field'|'scalar'|'instance'`

**Issues**:
- ValueRefPacked will need rethinking. If ValueExpr is unified, the `k` discriminant becomes redundant (you can derive signal/field/event from the CanonicalType on the expression).
- However, `k: 'instance'` and `k: 'scalar'` have no `.type` field, so they need to remain as-is or get types.

### 4. Runtime Evaluators (Three Separate Files)
**Status**: NOT_STARTED
**Evidence**:
- `SignalEvaluator.ts`: Takes `SigExpr[]`, switches on `expr.kind` (10 cases)
- `Materializer.ts`: Takes `FieldExpr[]`, switches on `expr.kind` (9 cases)
- `EventEvaluator.ts`: Takes `EventExpr[]`, switches on `expr.kind` (5 cases)

**Issues**:
- These are the highest-risk files in the migration. They are the hot loop.
- If ValueExpr is a single union, the evaluators must either:
  (a) Accept the full union and filter by CanonicalType at dispatch time, or
  (b) Continue to receive pre-filtered arrays (but then the unified type has less value)
- Option (a) means every frame's signal evaluation touches a 24-variant switch instead of 10.
- Option (b) means the builder still needs to segregate expressions by family for the runtime.

### 5. ScheduleExecutor (src/runtime/ScheduleExecutor.ts)
**Status**: NOT_STARTED
**Evidence**:
- Line 499: `if ('instanceId' in expr && expr.instanceId)` -- dynamic property check on FieldExpr
- Line 500: `expr.instanceId as unknown as InstanceId` -- unsafe cast
- Lines 506: `String(expr.instanceId)` -- stringly-typed instance lookup

**Issues**:
- The fieldStateWrite handler (lines 492-519) uses a fragile pattern: it reaches into the FieldExpr to extract instanceId via duck typing. This will break if instanceId is removed per plan P0-4.
- The materialize step (line 271) passes `step.instanceId` -- this is on StepMaterialize, not on the expression, so it's safe. But the fieldStateWrite case directly accesses `expr.instanceId`.

### 6. instanceId Removal from FieldExpr (Plan P0-4)
**Status**: NOT_STARTED
**Evidence**:
- Present on: FieldExprIntrinsic (required), FieldExprPlacement (required), FieldExprMap (optional), FieldExprZip (optional), FieldExprZipSig (optional), FieldExprStateRead (required)
- `IRBuilderImpl.inferFieldInstance()` reads it from expressions
- `schedule-program.ts` line 295/299 reads `expr.instanceId`
- `ScheduleExecutor.ts` lines 499-506 reads `expr.instanceId`
- `Materializer.ts` line 425 reads `placementExpr.instanceId`

**Issues**:
- For "required" cases (intrinsic, placement, stateRead), instanceId is semantically meaningful -- these expressions are inherently bound to a specific instance. The claim that instanceId should be derived from `requireManyInstance(expr.type)` is correct IF the type's cardinality is always set to `many(instanceRef)` for these expressions. Currently it is.
- For "optional" cases (map, zip, zipSig), instanceId is `InstanceId | undefined`, inferred by `inferFieldInstance()`. These CAN be removed because they are propagated from inputs.
- Risk: `ScheduleExecutor.ts` fieldStateWrite handler breaks without alternative way to find instance count. The Step type `StepFieldStateWrite` does NOT carry instanceId -- it only has `stateSlot` and `value: FieldExprId`. The executor must look up instance from the expression. If instanceId is removed from the expression, the executor needs to use `requireManyInstance(fields[step.value].type)`.

### 7. deriveKind Deprecation
**Status**: NOT_STARTED (marked deprecated but still called in 6 files)
**Evidence**:
- `canonical-types.ts` lines 763-770: definition with deprecation comment
- `axis-validate.ts` line 78/93: uses `deriveKind()` for dispatch
- `lowerTypes.ts` line 80: `assertKindAgreement()` uses `deriveKind()`
- `lower-blocks.ts`: uses `deriveKind()` for block lowering
- `field-operations-blocks.ts`: uses `deriveKind()` for reduce block
- `types/index.ts`: re-exports it

**Issues**:
- The deprecation is documented but not enforced. No lint rule or CI check.
- `axis-validate.ts` fundamentally needs `deriveKind()` to select which invariants to check. Removing deriveKind here means inlining the logic or accepting that validateType() dispatches on cardinality/temporality directly.
- Zero-cardinality (const) maps to 'signal' in deriveKind. This is a lossy projection. axis-validate.ts already handles it (line 113: `card.value.kind !== 'one' && card.value.kind !== 'zero'`).

### 8. Adapter System (src/graph/adapters.ts)
**Status**: NOT_STARTED for restructure
**Evidence**: AdapterSpec lives in `src/graph/adapters.ts`, not `src/blocks/` as plan requires
**Issues**: Lower priority. Can be done independently.

### 9. Zero-Cardinality (Plan P0-5)
**Status**: PARTIAL
**Evidence**:
- `canonicalConst()` exists and uses `cardinalityZero()` (canonical-types.ts line 729-734)
- `axis-validate.ts` line 113 accepts zero cardinality for signals
- No explicit lift mechanism (ValueExprLift) exists
- No const blocks currently emit zero-cardinality values in practice

**Issues**:
- Zero-cardinality is defined in the type system but not exercised at runtime.
- The evaluators do not have special handling for zero-cardinality values.
- SigExprConst values in the current system use cardinality=one, not zero.

### 10. Test Coverage Assessment
**Evidence**:
- 108 references to SigExpr/FieldExpr/EventExpr across 12 test files
- Hash-consing test (3 references): tests deduplication per-family
- EventEvaluator test (26 references): covers wrap, combine, pulse, never, const
- RenderAssembler tests (48 references total): exercise the full pipeline
- expression-blocks tests (11 references): exercise expression compilation
- stateful-primitives tests (3 references): exercise state read/write
- No test explicitly asserts "every ValueExpr variant has type field"
- No test for zero-cardinality evaluation
- No test for deriveKind totality

**Issues**:
- Tests are real (they exercise actual compilation and runtime execution) -- not theater.
- But they are family-specific. They cannot detect regressions in a unified system.
- The hash-consing tests would need significant rework.

## Ambiguities Found
| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| kind discriminant collision | SigExpr.const and FieldExpr.const both use `kind: 'const'`. How does a unified ValueExpr discriminate? | Plan says "ValueExpr discriminant is `kind`" but doesn't address collisions | HIGH: TypeScript narrowing fails if 'const' is ambiguous in union |
| Runtime performance | Single 24-variant switch vs three 5-10 variant switches | Plan says "first consumer proof" only, deferring full migration | MEDIUM: Hot loop regression risk |
| StepFieldStateWrite instanceId | Step doesn't carry instanceId. Expr does. Removing instanceId from expr breaks fieldStateWrite handler | Plan P0-4 says "remove instanceId" but ScheduleExecutor line 499 depends on it | HIGH: Runtime crash if instanceId removed without fixing executor |
| Zero-cardinality in practice | canonicalConst() exists but no block emits zero-cardinality | Plan says Const blocks should, but current blocks use cardinalityOne | LOW: Functional but spec-divergent |
| Hash consing post-unification | Three caches become one. JSON.stringify of unified type includes CanonicalType, which is large | Not addressed in plan | MEDIUM: Performance regression in compilation |

## Recommendations

1. **Resolve `kind` discriminant collision before writing any code.** The plan assumes ValueExpr uses `kind` but at least 4 values ('const', 'map', 'zip', 'stateRead') collide between signal and field families. Options: (a) prefix-rename variants (sigConst, fieldConst, etc.), (b) add a secondary discriminant (family + kind), (c) use unique kind strings for all 24 variants. This is a design decision that blocks everything.

2. **Fix ScheduleExecutor.fieldStateWrite BEFORE removing instanceId from FieldExpr.** The current code at ScheduleExecutor.ts lines 499-506 will crash. Either: (a) add instanceId to StepFieldStateWrite, or (b) change the executor to use `requireManyInstance(fields[step.value].type)`. Option (b) aligns with the plan.

3. **Approach incrementally, NOT big-bang.** The plan's phasing (P0-1 through P1-7) is reasonable, but the dependencies are:
   - P0-1 (define ValueExpr) depends on discriminant collision resolution
   - P0-4 (remove instanceId) depends on fixing ScheduleExecutor + schedule-program.ts
   - P0-5 (zero-cardinality) is independent and can be done first
   - P0-6 (ConstValue) is already done (ConstValue exists, constValueMatchesPayload works)
   - P0-2 (SigExprEventRead output type) is already done (IRBuilderImpl line 872 uses float scalar)
   - P0-3 (AdapterSpec restructure) is independent

4. **Do P0-6 and P0-2 first (verify already-done items).** Write tests confirming these are complete. Then P0-5 (zero-cardinality), then P0-4 (instanceId removal with executor fix), then P0-1 (ValueExpr definition after discriminant design).

5. **Add mechanical enforcement for deriveKind deprecation.** A grep-based CI check preventing new `deriveKind` calls outside canonical-types.ts would prevent drift.

6. **Assess whether full evaluator unification is worth the cost.** The three separate evaluators (SignalEvaluator, Materializer, EventEvaluator) are well-structured and well-tested. Merging them into one evaluator that dispatches on CanonicalType would be a very large change with real performance risk in the hot loop. The plan wisely defers this ("only first consumer proof"), but the question is whether the ValueExpr type adds value WITHOUT evaluator unification. If the evaluators still receive family-filtered arrays, the unified type is mostly a documentation exercise.

## File Impact Analysis

### Files requiring changes for full ValueExpr unification
| File | Change Type | Risk | Lines |
|------|------------|------|-------|
| src/compiler/ir/types.ts | Define ValueExpr, keep legacy aliases | MEDIUM | ~100 new |
| src/compiler/ir/Indices.ts | Add ValueExprId | LOW | ~10 |
| src/compiler/ir/IRBuilder.ts | Add unified methods (keep legacy) | MEDIUM | ~50 |
| src/compiler/ir/IRBuilderImpl.ts | Add unified array + cache | HIGH | ~200 |
| src/compiler/ir/lowerTypes.ts | Update ValueRefPacked | MEDIUM | ~30 |
| src/compiler/backend/lower-blocks.ts | Update block lowering | HIGH | ~100 |
| src/compiler/backend/schedule-program.ts | Update schedule generation | HIGH | ~100 |
| src/runtime/SignalEvaluator.ts | Accept ValueExpr or adapt | HIGH | ~50 |
| src/runtime/Materializer.ts | Accept ValueExpr or adapt | HIGH | ~50 |
| src/runtime/EventEvaluator.ts | Accept ValueExpr or adapt | HIGH | ~30 |
| src/runtime/ScheduleExecutor.ts | Fix fieldStateWrite | MEDIUM | ~20 |
| src/compiler/frontend/axis-validate.ts | Replace deriveKind | LOW | ~10 |
| src/core/canonical-types.ts | Remove deriveKind | LOW | ~10 |
| src/blocks/*.ts (14 block files) | Update to use new builder API | LOW | ~5 each |
| Test files (12 files) | Update expression references | LOW | ~10 each |

Total: ~38 files, ~1000 lines changed

### Files that can be changed independently (no ordering constraint)
- AdapterSpec restructure (adapters.ts -> blocks/adapter-spec.ts)
- Zero-cardinality enforcement (canonical-types.ts + block lowering)
- deriveKind deprecation enforcement (CI rule)

## Verdict
- [x] PAUSE - Ambiguities need clarification

### Questions requiring answers before implementation:

1. **Discriminant design**: How should the unified ValueExpr resolve the `kind` collision between signal and field variants that share the same `kind` value ('const', 'map', 'zip', 'stateRead')? Options: (a) unique kind strings per variant (e.g., 'sigConst', 'fieldConst'), (b) compound discriminant, (c) something else. This blocks P0-1.

2. **Evaluator strategy**: Should the evaluators be unified (single evaluator dispatching on CanonicalType) or remain separate (receiving pre-filtered arrays)? If separate, does ValueExpr unification provide enough value to justify the migration cost? This determines whether the migration is a ~200-line type-only change or a ~1000-line full-stack rewrite.

3. **StepFieldStateWrite contract**: When instanceId is removed from FieldExpr, should (a) StepFieldStateWrite gain an instanceId field, or (b) the executor derive it from `requireManyInstance(expr.type)`? Option (b) aligns with the plan but requires the type to always carry the correct instance reference.
