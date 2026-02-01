# Sprint: direct-lowering - ValueExpr Direct Lowering
Generated: 2026-01-31T16:00:00Z
Confidence: HIGH: 6, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Supersedes: All SPRINT-20260131-100000-* and SPRINT-20260131-120000-* plans

## Sprint Goal
Replace the entire legacy expression pipeline (SigExpr/FieldExpr/EventExpr → lowerToValueExprs → ValueExpr) with direct ValueExpr emission from block lowering through schedule execution.

## Scope
**Deliverables:**
1. ValueExpr builder methods on IRBuilder
2. Unified ValueRefPacked using ValueExprId
3. All blocks emit ValueExpr directly
4. Schedule steps reference ValueExprId
5. ScheduleExecutor dispatches without translation
6. All tests pass with zero legacy references in production code

## Work Items

### WI-1: Add ValueExpr Builder Methods to IRBuilder
**Confidence: HIGH**

**What**: Add methods to `IRBuilder` interface and `IRBuilderImpl` that directly emit `ValueExpr` nodes into a `ValueExpr[]` table, returning `ValueExprId`.

**Specification Source**: `lowerToValueExprs.ts` defines the exact mapping from legacy → ValueExpr. Invert it: each `lowerSigExpr`/`lowerFieldExpr`/`lowerEventExpr` case tells you what the builder method should produce.

**Methods needed** (derived from existing legacy methods):

Signal-family (become ValueExpr with signal-extent type):
- `veConst(value: ConstValue, type: CanonicalType): ValueExprId`
- `veSlotRead(slot: ValueSlot, type: CanonicalType): ValueExprId`
- `veTime(which: TimeWhich, type: CanonicalType): ValueExprId`
- `veExternal(channel: string, type: CanonicalType): ValueExprId`
- `veKernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId`
- `veKernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId`
- `veKernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId`
- `veKernelReduce(field: ValueExprId, op: ReduceOp, type: CanonicalType): ValueExprId`
- `veState(stateSlot: StateSlotId, type: CanonicalType): ValueExprId`
- `veShapeRef(topologyId: TopologyId, paramArgs: readonly ValueExprId[], type: CanonicalType, controlPointField?: ValueExprId): ValueExprId`
- `veEventRead(eventSlot: EventSlotId, type: CanonicalType): ValueExprId`

Field-family (become ValueExpr with field-extent type):
- `veIntrinsicProperty(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId`
- `veIntrinsicPlacement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId`
- `veKernelBroadcast(signal: ValueExprId, type: CanonicalType): ValueExprId`
- `veKernelPathDerivative(field: ValueExprId, op: 'tangent' | 'arcLength', type: CanonicalType): ValueExprId`
- (fieldMap, fieldZip, fieldConst reuse veKernelMap, veKernelZip, veConst with field-extent types)

Event-family (become ValueExpr with event-extent type):
- `veEventPulse(type: CanonicalType): ValueExprId`
- `veEventWrap(input: ValueExprId, type: CanonicalType): ValueExprId`
- `veEventCombine(inputs: readonly ValueExprId[], mode: 'any' | 'all', type: CanonicalType): ValueExprId`
- `veEventNever(type: CanonicalType): ValueExprId`
- `veEventConst(fired: boolean, type: CanonicalType): ValueExprId`

Combine operations:
- `veCombine(inputs: readonly ValueExprId[], mode: CombineMode, type: CanonicalType): ValueExprId`

Retrieval:
- `getValueExprs(): readonly ValueExpr[]`

**Implementation**:
- `IRBuilderImpl` adds `private valueExprs: ValueExpr[] = []`
- Each `ve*` method pushes to array, returns branded index
- Legacy methods remain temporarily (removed in WI-6)

**Acceptance Criteria:**
- [ ] All builder methods above exist and produce correct ValueExpr nodes
- [ ] `getValueExprs()` returns the dense array
- [ ] Unit test: each method produces expected ValueExpr variant with correct fields
- [ ] No legacy type references in new methods (only ValueExpr, ValueExprId)

**Files:**
- `src/compiler/ir/IRBuilder.ts` — Add interface methods
- `src/compiler/ir/IRBuilderImpl.ts` — Add implementation
- `src/compiler/ir/__tests__/` — Add builder unit tests

---

### WI-2: Update ValueRefPacked to ValueExprId
**Confidence: HIGH**

**What**: Replace the three-way discriminated `ValueRefPacked` with a unified type based on `ValueExprId`.

**Current** (in `lowerTypes.ts`):
```typescript
type ValueRefPacked =
  | { kind: 'signal'; id: SigExprId; type: CanonicalType }
  | { kind: 'field'; id: FieldExprId; type: CanonicalType }
  | { kind: 'event'; id: EventExprId; type: CanonicalType };
```

**Target**:
```typescript
type ValueRefPacked =
  | { k: 'sig'; id: ValueExprId; slot: ValueSlot; type: CanonicalType; stride: number }
  | { k: 'field'; id: ValueExprId; type: CanonicalType; stride: number }
  | { k: 'event'; id: ValueExprId; type: CanonicalType };
```

Note: The `k` discriminant tells the *schedule builder* what kind of step to emit (evalSig vs materialize vs evalEvent). This is NOT a legacy type tag — it's execution semantics derived from CanonicalType.extent.

**Acceptance Criteria:**
- [ ] ValueRefPacked uses ValueExprId, not SigExprId/FieldExprId/EventExprId
- [ ] All consumers updated (lower-blocks.ts, schedule-program.ts, block files)
- [ ] `k` discriminant derived from `deriveKind(type)` at construction site

**Files:**
- `src/compiler/ir/lowerTypes.ts` — Update type
- `src/compiler/backend/lower-blocks.ts` — Update construction sites
- `src/compiler/passes-v2/combine-utils.ts` — Update if referencing old IDs

---

### WI-3: Migrate Block Lower Functions to ValueExpr Builder
**Confidence: HIGH**

**What**: Update all 11 block files to call `ve*` builder methods instead of legacy `sig*`/`field*`/`event*` methods.

**Blocks to migrate** (11 files):
1. `src/blocks/math-blocks.ts`
2. `src/blocks/signal-blocks.ts`
3. `src/blocks/field-blocks.ts`
4. `src/blocks/field-operations-blocks.ts`
5. `src/blocks/geometry-blocks.ts`
6. `src/blocks/color-blocks.ts`
7. `src/blocks/path-operators-blocks.ts`
8. `src/blocks/adapter-blocks.ts`
9. `src/blocks/event-blocks.ts`
10. `src/blocks/expression-blocks.ts`
11. `src/blocks/test-blocks.ts`

**Migration pattern** (mechanical):
```typescript
// BEFORE
const id = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], fn, type);
return { outputsById: { out: { kind: 'signal', id, type: outType } } };

// AFTER
const id = ctx.b.veKernelZip([a.id, b.id], fn, type);
return { outputsById: { out: { k: 'sig', id, type: outType, slot: ctx.b.allocSlot(), stride: payloadStride(outType.payload) } } };
```

**Acceptance Criteria:**
- [ ] All 11 block files use `ve*` methods exclusively
- [ ] No SigExprId/FieldExprId/EventExprId casts in block code
- [ ] No imports of legacy branded IDs in block files
- [ ] All block tests pass

**Files:** All 11 block files listed above + their test files

---

### WI-4: Update Schedule Step Types to ValueExprId
**Confidence: HIGH**

**What**: Change `Step` type variants to reference `ValueExprId` instead of legacy IDs.

**Current** (in `types.ts`):
```typescript
interface StepEvalSig { kind: 'evalSig'; expr: SigExprId; target: ValueSlot; }
interface StepMaterialize { kind: 'materialize'; field: FieldExprId; ... }
interface StepEvalEvent { kind: 'evalEvent'; expr: EventExprId; ... }
```

**Target**:
```typescript
interface StepEvalSig { kind: 'evalSig'; expr: ValueExprId; target: ValueSlot; }
interface StepMaterialize { kind: 'materialize'; expr: ValueExprId; ... }
interface StepEvalEvent { kind: 'evalEvent'; expr: ValueExprId; ... }
```

**Acceptance Criteria:**
- [ ] All Step variants use ValueExprId
- [ ] No SigExprId/FieldExprId/EventExprId in Step type definitions
- [ ] TypeScript compiles clean

**Files:**
- `src/compiler/ir/types.ts` — Update Step type definitions

---

### WI-5: Update Schedule Builder to Emit ValueExprId Steps
**Confidence: HIGH**

**What**: Update `schedule-program.ts` to read from `builder.getValueExprs()` and emit steps with `ValueExprId`.

**Current flow**: schedule-program reads legacy tables (`getSigExprs()`, `getFieldExprs()`, `getEventExprs()`), creates steps with legacy IDs.

**New flow**: schedule-program reads `getValueExprs()`, creates steps with ValueExprId.

**Key changes**:
- Replace `builder.getSigExprs()` → `builder.getValueExprs()`
- Replace iteration over legacy tables with ValueExpr table iteration
- Step construction uses ValueExprId directly from block outputs (ValueRefPacked.id)

**Acceptance Criteria:**
- [ ] schedule-program.ts imports no legacy expression types
- [ ] All steps carry ValueExprId
- [ ] Schedule test suite passes

**Files:**
- `src/compiler/backend/schedule-program.ts`
- `src/compiler/compile.ts` — Remove legacy table extraction, lowerToValueExprs call

---

### WI-6: Remove Translation Layer from ScheduleExecutor
**Confidence: HIGH**

**What**: ScheduleExecutor reads ValueExprId directly from steps. Remove `sigToValue`/`fieldToValue`/`eventToValue` translation arrays.

**Current**:
```typescript
const veId = program.valueExprs.sigToValue[step.expr as number];
const value = evaluateValueExprSignal(veId, program.valueExprs.nodes, state);
```

**Target**:
```typescript
const value = evaluateValueExprSignal(step.expr, program.valueExprs, state);
```

**Also**: Simplify `CompiledProgramIR` — remove legacy tables, remove translation maps.

**Acceptance Criteria:**
- [ ] No translation lookups in ScheduleExecutor
- [ ] CompiledProgramIR has `valueExprs: readonly ValueExpr[]` (flat table, no wrappers)
- [ ] No `sigToValue`/`fieldToValue`/`eventToValue` anywhere
- [ ] Full test suite passes end-to-end

**Files:**
- `src/runtime/ScheduleExecutor.ts`
- `src/compiler/ir/program.ts` — Simplify CompiledProgramIR

## Dependencies
- WI-1 must complete before WI-3 (blocks need builder methods)
- WI-2 must complete before WI-3 (blocks need new ValueRefPacked)
- WI-4 must complete before WI-5 (schedule builder needs new Step types)
- WI-1,2 can be done in parallel
- WI-4,5 can be done together
- WI-6 depends on WI-5

**Execution order**: WI-1 + WI-2 → WI-3 + WI-4 → WI-5 → WI-6

## Risks
- **Large blast radius** — touches ~33 files. Mitigated by: existing 2057+ test suite validates correctness end-to-end.
- **Block migration errors** — Mitigated by: lowerToValueExprs.ts as reference specification; per-block test coverage.
