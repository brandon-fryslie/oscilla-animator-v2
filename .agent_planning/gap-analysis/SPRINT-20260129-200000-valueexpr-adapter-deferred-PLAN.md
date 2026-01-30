# Sprint: valueexpr-adapter-deferred — ValueExpr Unification + Adapter Restructure + Deferred Items
Generated: 2026-01-29T20:00:00Z
Confidence: HIGH: 2, MEDIUM: 4, LOW: 1
Status: RESEARCH REQUIRED

## Sprint Goal
Unify SigExpr/FieldExpr/EventExpr into ValueExpr, remove redundant instanceId fields, restructure adapter specs, and implement zero-cardinality lift operations.

## Scope
**Deliverables:**
- Unified ValueExpr type (#23)
- Expression discriminant alignment (#24)
- Remove instanceId from field expressions (#25)
- Branded IDs on AdapterSpec (#26)
- Per-axis ExtentPattern for adapter matching (#27)
- Zero-cardinality lift operations (#28)
- Verify ValueExprConst shape (#29)

**Deferred (v1+ scope, NOT in this sprint):**
- #30: Branch-keyed runtime state
- #31: v1+ perspective/branch variants

## Work Items

### P0-1: Define unified ValueExpr type (#23 / T05b-U-1)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `ValueExpr` union type defined with 6 variants: Const, External, Intrinsic, Kernel, State, Time
- [ ] All variants share `ValueExprBase { kind: string, type: CanonicalType }`
- [ ] Mapping from 24 legacy variants to 6 new variants documented
- [ ] Legacy types remain as aliases during migration
- [ ] At least one consumer migrated to ValueExpr as proof of concept

**Technical Notes:**
- File: `src/compiler/ir/types.ts`
- Current: SigExpr (10 variants), FieldExpr (9 variants), EventExpr (5 variants) = 24 total
- All already carry `type: CanonicalType` and use `kind` discriminant

#### Unknowns to Resolve
- Exact mapping from 24 legacy → 6 new variants (spec provides this)
- Incremental migration strategy (which consumers first?)

#### Exit Criteria
- Read spec mapping table → HIGH confidence
- Choose first migration target → HIGH confidence

### P0-2: Align expression discriminant kind values (#24 / T05b-U-2)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] All ValueExpr variant `kind` values use consistent camelCase naming
- [ ] No snake_case discriminant values
- [ ] `kind` is the discriminant on all variants (no `op` or other alternatives)

**Technical Notes:**
- Per resolution A1 (from gap analysis): `kind` is the discriminant everywhere
- Audit current discriminant values for consistency

### P0-3: Remove instanceId from field expressions (#25 / T05b-U-3)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `instanceId` removed from FieldExprIntrinsic, FieldExprPlacement, FieldExprStateRead
- [ ] All callers use `requireManyInstance(expr.type)` instead
- [ ] Tests pass with derived instanceId
- [ ] Step types may keep instanceId as performance optimization (documented decision)

**Technical Notes:**
- File: `src/compiler/ir/types.ts:234-293`
- Consumers: `src/runtime/Materializer.ts`, `src/runtime/ScheduleExecutor.ts`
- Per guardrail 10: instance identity lives in type, not node fields

### P0-4: Add branded IDs to AdapterSpec (#26 / T05c-U-1)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `AdapterSpecId` branded type defined
- [ ] `AdapterSpec` has `id: AdapterSpecId`, `name: string`, `blockId: BlockId`
- [ ] `blockType: string` replaced with `blockId: BlockId`
- [ ] All 10 adapter rules updated with IDs and names

**Technical Notes:**
- File: `src/graph/adapters.ts:65-258`
- `BlockId` already exists: `src/types/index.ts:130-138`

### P0-5: Per-axis ExtentPattern for adapter matching (#27 / T05c-U-2)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] Per-axis pattern types: CardinalityPattern, TemporalityPattern, etc.
- [ ] `ExtentPattern` redefined as `{ cardinality?: CardinalityPattern, ... }`
- [ ] `extentMatches()` checks each axis individually
- [ ] Broadcast adapter TODO resolved with proper extent pattern

**Technical Notes:**
- File: `src/graph/adapters.ts:35-37, 278-297`
- Current: `'any' | Partial<Extent>` — too coarse
- Depends on UnitType restructure (#18) for structured unit matching in adapters

### P0-6: Zero-cardinality lift operations (#28 / T03-U-1)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] Either: explicit `broadcastConstToSignal`/`broadcastConstToField` IR ops exist, OR
- [ ] Document that `sigConst`/`fieldConst` ARE the canonical lift ops (with design decision record)
- [ ] Either approach validated by spec team or documented as intentional divergence

**Technical Notes:**
- File: `src/compiler/ir/types.ts`, `src/compiler/ir/IRBuilderImpl.ts`
- Current: `sigConst` implicitly lifts zero→one, `fieldConst` lifts zero→many
- Spec wants explicit named ops but current approach is equivalent

#### Unknowns to Resolve
- Does the spec require explicit ops, or is the implicit approach acceptable?

### P0-7: Verify ValueExprConst shape (#29 / T02-U-2)
**Confidence**: LOW
**Acceptance Criteria:**
- [ ] IR const expressions verified against spec pattern: `{ kind: 'const', type: CanonicalType, value: ConstValue }`
- [ ] Type guard exists if missing
- [ ] EventExprNever pattern verified

**Technical Notes:**
- Audit task: read IR types and compare to spec

#### Unknowns to Resolve
- Need to read current IR const variant shapes and compare

#### Exit Criteria
- Read IR types → HIGH confidence (may already conform)

## Dependencies
- Depends on Sprint 1 (P1 fixes) and Sprint 3 (UnitType restructure for adapter work)
- #27 depends on #26
- #23 is independent but large

## Risks
- ValueExpr unification (#23) is the largest structural change — touches evaluators, compiler, schedule
- Full evaluator migration (#23 WI-3 from context file) is P5 deferred — only type definition + proof of concept in this sprint
- Zero-cardinality lift (#28) may need spec clarification
