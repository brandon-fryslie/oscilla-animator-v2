# Sprint: valueexpr-canonical-table — Define ValueExpr Canonical Table

Generated: 2026-01-30T17:00:00Z
Confidence: HIGH: 3, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Define the canonical `ValueExpr` type as a new, clean table with a small unique top-level `kind` discriminant. Wire it into the IR alongside the legacy types. Do NOT attempt full migration — legacy SigExpr/FieldExpr/EventExpr remain functional. This sprint establishes the target type and proves it works with one consumer.

## Design Decisions (locked)

### ValueExpr is NOT a union of legacy types
ValueExpr is a new canonical table. Legacy `map`/`zip`/`stateRead` do not appear as top-level `kind` values. They become second-level discriminants under `kernel` or `state`.

### Top-level `kind` values (canonical set)
```
'const' | 'external' | 'intrinsic' | 'kernel' | 'state' | 'time' | 'shapeRef' | 'eventRead' | 'event'
```

### Legacy → ValueExpr mapping

| ValueExpr kind | Legacy sources | Sub-discriminant |
|---|---|---|
| `const` | SigExprConst, FieldExprConst, EventExprConst | value: ConstValue; cardinality distinguishes sig/field/event |
| `external` | SigExprExternal | which: string |
| `intrinsic` | FieldExprIntrinsic, FieldExprPlacement | sub: 'property' \| 'placement' |
| `kernel` | Sig/FieldMap, Sig/FieldZip, FieldZipSig, FieldBroadcast, SigReduceField, FieldPathDerivative | kernelKind + args (ValueExprId[]) |
| `state` | SigExprStateRead, FieldExprStateRead | stateOp: 'read' |
| `time` | SigExprTime | which: 'tMs' \| 'phaseA' \| ... |
| `shapeRef` | SigExprShapeRef | topologyId + params |
| `eventRead` | SigExprEventRead | eventSlot |
| `event` | EventExprPulse, EventExprWrap, EventExprCombine, EventExprNever | eventKind: 'pulse' \| 'wrap' \| 'combine' \| 'never' |

### Evaluator strategy
Three evaluators stay separate (SignalEvaluator, Materializer, EventEvaluator). They accept ValueExprId, gate on CanonicalType, dispatch on ValueExpr.kind + sub-discriminant. Schedule step determines which evaluator runs.

### Zero-cardinality
Constants are universal donors. `canonicalConst()` uses `cardinalityZero()`. No lifting needed — evaluators read const values directly regardless of lane context.

### instanceId removal
FieldExpr `instanceId` is derived from `requireManyInstance(expr.type)`. Not stored on ValueExpr.

### DerivedKind deprecation
`deriveKind()`/`DerivedKind` are deprecated. Evaluators use CanonicalType directly for gating. `deriveKind` remains temporarily for legacy consumers only, removed once all consumers migrate.

---

## Work Items

### P0-1: Define ValueExpr type table
**Confidence: HIGH**

**Files:**
- NEW: `src/compiler/ir/value-expr.ts`
- UPDATE: `src/compiler/ir/Indices.ts` (add `ValueExprId`)

**Acceptance Criteria:**
- [ ] `ValueExpr` discriminated union with 9 top-level `kind` values
- [ ] Every variant has `readonly kind: <literal>` and `readonly type: CanonicalType`
- [ ] `ValueExprId` branded ID type exists
- [ ] No `instanceId` on any variant — derive from type
- [ ] No `op` discriminant — only `kind` at top level, sub-discriminants inside variants
- [ ] No sig/field/event family tags stored anywhere
- [ ] TypeScript compiles

**Technical Notes:**
```typescript
// Sketch — not final
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime
  | ValueExprShapeRef
  | ValueExprEventRead
  | ValueExprEvent;

interface ValueExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;
}

interface ValueExprKernel {
  readonly kind: 'kernel';
  readonly type: CanonicalType;
  readonly kernelId: KernelId; // 'map' | 'zip' | 'broadcast' | 'reduce' | 'pathDerivative' | ...
  readonly args: readonly ValueExprId[];
  readonly fn?: PureFn; // For map/zip
}
// ... etc
```

### P0-2: Legacy→ValueExpr mapping table (documentation)
**Confidence: HIGH**

**Files:**
- NEW: `src/compiler/ir/value-expr-legacy-map.ts` (or inline doc in value-expr.ts)

**Acceptance Criteria:**
- [ ] Complete mapping from all 24 legacy variants to ValueExpr kinds documented
- [ ] Each mapping specifies: legacy type → ValueExpr kind + sub-discriminant values
- [ ] Mapping is mechanically verifiable (could be a function, doesn't have to be)

### P0-3: Remove instanceId from FieldExpr nodes
**Confidence: HIGH**

**Files:**
- UPDATE: `src/compiler/ir/types.ts` (remove instanceId from 6 FieldExpr variants)
- UPDATE: `src/compiler/ir/IRBuilder.ts` (remove instanceId params)
- UPDATE: `src/compiler/ir/IRBuilderImpl.ts` (remove instanceId from builders)
- UPDATE: `src/runtime/ScheduleExecutor.ts` (use requireManyInstance)
- UPDATE: `src/runtime/Materializer.ts` (use requireManyInstance)
- UPDATE: `src/compiler/backend/schedule-program.ts`
- UPDATE: `src/compiler/compile.ts`
- UPDATE: All block lowering files that pass instanceId

**Acceptance Criteria:**
- [ ] No `instanceId` field on FieldExprIntrinsic, FieldExprPlacement, FieldExprStateRead
- [ ] No `instanceId` field on FieldExprMap, FieldExprZip, FieldExprZipSig
- [ ] All callers use `requireManyInstance(expr.type)` to derive instance
- [ ] ScheduleExecutor fieldStateWrite path uses `requireManyInstance`
- [ ] TypeScript compiles
- [ ] Existing tests pass (no regressions)

### P0-4: Prove ValueExpr with one consumer
**Confidence: MEDIUM**

Choose ONE consumer to migrate as proof that ValueExpr works end-to-end:
- Option A: Axis validation (reads expressions, checks types) — read-only, low risk
- Option B: CompilationInspectorService (debug display) — read-only
- Option C: A new `lowerToValueExpr()` pass that converts legacy IR → ValueExpr[] for inspection

**Acceptance Criteria:**
- [ ] One consumer reads from `ValueExpr[]` instead of legacy expression arrays
- [ ] Consumer dispatches on `ValueExpr.kind` (not legacy sig/field/event)
- [ ] Consumer gates on `CanonicalType` for lane-specific logic
- [ ] Tests cover the migrated consumer

#### Unknowns to Resolve
- Which consumer gives the best proof with lowest risk?
- Does the consumer need the full `ValueExpr[]` or just individual lookups?

#### Exit Criteria (raises to HIGH)
- Consumer chosen and approach validated by reading its current implementation

### P0-5: Deprecate DerivedKind with migration path
**Confidence: MEDIUM**

**Files:**
- UPDATE: `src/core/canonical-types.ts` (add `@deprecated` annotations)
- UPDATE: `src/compiler/frontend/axis-validate.ts` (replace deriveKind with direct CanonicalType checks)
- UPDATE: `src/compiler/ir/lowerTypes.ts` (update assertKindAgreement)

**Acceptance Criteria:**
- [ ] `DerivedKind` and `deriveKind()` annotated `@deprecated`
- [ ] axis-validate.ts uses CanonicalType extent checks directly (no deriveKind)
- [ ] assertKindAgreement updated to check CanonicalType directly
- [ ] isSignalType/isFieldType/isEventType check CanonicalType directly (not via deriveKind)
- [ ] No new call sites added for deriveKind
- [ ] TypeScript compiles, tests pass

#### Unknowns to Resolve
- How many call sites use deriveKind? (Answer from audit: 6 call sites in 3 files)
- Can all be migrated in one pass or does it need staging?

#### Exit Criteria
- All 6 call sites audited and migration path clear for each

---

## Dependencies

- Requires: UnitType restructure (done), Axis<T,V> (done), cardinalityZero (done)
- P0-3 (instanceId removal) is independent of P0-1 (ValueExpr definition) — can be parallel
- P0-4 (proof consumer) depends on P0-1
- P0-5 (DerivedKind deprecation) is independent

## Risks

1. **P0-3 instanceId removal**: ScheduleExecutor duck-typing at line 499-506 will crash if not updated. Must coordinate.
2. **P0-4 consumer choice**: Wrong consumer choice could make the proof too complex. Keep it read-only.
3. **ValueExpr kernel variant**: The `kernel` kind subsumes many different operations (map, zip, broadcast, reduce, pathDerivative). Need to ensure the sub-discriminant (`kernelId` or similar) provides sufficient narrowing for each evaluator.

## Out of Scope

- Full migration of evaluators to ValueExpr (future sprint)
- Full migration of IRBuilder to produce ValueExpr directly (future sprint)
- AdapterSpec restructure (separate sprint)
- Removal of legacy SigExpr/FieldExpr/EventExpr types (after all consumers migrated)
