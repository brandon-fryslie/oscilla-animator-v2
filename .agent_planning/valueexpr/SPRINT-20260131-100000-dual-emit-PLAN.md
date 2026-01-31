# Sprint: dual-emit - Lowering Pass Infrastructure

Generated: 2026-01-31-100000 (revised per ChatGPT review)
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260131-090000.md

## Sprint Goal

Add a `program.valueExprs` table to CompiledProgramIR by lowering legacy expression tables into ValueExpr in a single post-compilation pass, with ID mapping tables enabling incremental consumer migration.

## Scope

**Deliverables:**
- `ValueExprTable` type and `valueExprs` field on `CompiledProgramIR`
- Single lowering pass: legacy tables → ValueExprTable (runs after IRBuilder finishes)
- Forward mapping tables: `SigExprId -> ValueExprId`, `FieldExprId -> ValueExprId`, `EventExprId -> ValueExprId`
- Reverse mapping tables (migration-only): `ValueExprId -> SigExprId|null`, etc.
- Completeness test: every legacy expression has a corresponding ValueExpr entry

## Key Design Decision

**Do NOT dual-emit inside IRBuilder methods.** Instead, emit legacy exactly as today, then run a single lowering pass that converts all three legacy tables into one ValueExprTable. This gives:
- One place to guarantee semantic parity
- One place to handle cross-table references cleanly
- One place to implement dedup/hash-consing
- No risk of subtle ordering bugs from interleaved emission

## Work Items

### P0 WI-1: Add ValueExprTable to CompiledProgramIR

**Dependencies**: Sprint 1 (type-fixes) must be complete
**Spec Reference**: CompiledProgramIR in program.ts:84-130 | **Status Reference**: EVALUATION-20260131-090000.md "Recommendations" item 4

#### Description
Add a `valueExprs` field to `CompiledProgramIR` containing the unified ValueExpr table with forward and reverse mapping arrays.

```typescript
interface ValueExprTable {
  readonly nodes: readonly ValueExpr[];
  readonly sigToValue: readonly ValueExprId[];     // indexed by SigExprId
  readonly fieldToValue: readonly ValueExprId[];    // indexed by FieldExprId
  readonly eventToValue: readonly ValueExprId[];    // indexed by EventExprId
  // migration-only appendix (removed after all consumers migrated):
  readonly valueToSig?: readonly (SigExprId | null)[];
  readonly valueToField?: readonly (FieldExprId | null)[];
  readonly valueToEvent?: readonly (EventExprId | null)[];
}
```

#### Acceptance Criteria
- [ ] `CompiledProgramIR` has `valueExprs: ValueExprTable`
- [ ] `ValueExprTable` has `nodes`, forward maps (`sigToValue`, `fieldToValue`, `eventToValue`), and reverse maps (`valueToSig`, `valueToField`, `valueToEvent`)
- [ ] Forward mapping arrays are parallel to legacy tables (same length, indexed by legacy ID)
- [ ] Reverse mapping arrays are parallel to `nodes` (same length, indexed by ValueExprId)
- [ ] TypeScript compiles with zero errors

#### Technical Notes
The reverse mapping arrays are essential for Sprint 3's reduce bridge (signal evaluator needs to find the legacy FieldExprId to call the legacy materializer). They are migration-only and marked optional so they can be removed after all consumers are migrated.

---

### P1 WI-2: Lowering Pass — Legacy Tables → ValueExprTable

**Dependencies**: WI-1
**Spec Reference**: IRBuilderImpl.ts | **Status Reference**: EVALUATION-20260131-090000.md "Zero Production Consumers"

#### Description
Implement a single lowering pass (`lowerToValueExprs()`) that runs after IRBuilder produces the legacy tables. The pass walks all three legacy tables in order and produces ValueExpr equivalents:

**Phase 1: Lower signal expressions** (signals first because fields/events reference them)
For each `SigExpr` in `program.signalExprs.nodes`:
- `const` → `ValueExprConst`
- `slot` → `ValueExprSlotRead`
- `time` → `ValueExprTime`
- `external` → `ValueExprExternal` (field name: `channel`, not `which`)
- `map` → `ValueExprKernel { kernelKind: 'map', input: sigToValue[legacy.input] }`
- `zip` → `ValueExprKernel { kernelKind: 'zip', inputs: legacy.inputs.map(i => sigToValue[i]) }`
- `stateRead` → `ValueExprState`
- `shapeRef` → `ValueExprShapeRef`
- `reduceField` → `ValueExprKernel { kernelKind: 'reduce', op: legacy.op }`
- `eventRead` → `ValueExprEventRead`

**Phase 2: Lower field expressions** (may reference signals via broadcast/zipSig)
For each `FieldExpr` in `program.fieldExprs.nodes`:
- `const` → `ValueExprConst`
- `intrinsic` → `ValueExprIntrinsic { intrinsicKind: 'property' }`
- `placement` → `ValueExprIntrinsic { intrinsicKind: 'placement' }`
- `broadcast` → `ValueExprKernel { kernelKind: 'broadcast', signal: sigToValue[legacy.signal] }`
- `map` → `ValueExprKernel { kernelKind: 'map' }`
- `zip` → `ValueExprKernel { kernelKind: 'zip' }`
- `zipSig` → `ValueExprKernel { kernelKind: 'zipSig', field: fieldToValue[legacy.field], signals: legacy.signals.map(s => sigToValue[s]) }`
- `stateRead` → `ValueExprState`
- `pathDerivative` → `ValueExprKernel { kernelKind: 'pathDerivative', op: legacy.operation }`

**Phase 3: Lower event expressions** (may reference signals via wrap, events via combine)
For each `EventExpr` in `program.eventExprs.nodes`:
- `const` → `ValueExprEvent { eventKind: 'const', fired: legacy.fired }`
- `pulse` → `ValueExprEvent { eventKind: 'pulse', source: 'timeRoot' }`
- `wrap` → `ValueExprEvent { eventKind: 'wrap', input: sigToValue[legacy.signal] }`
- `combine` → `ValueExprEvent { eventKind: 'combine', inputs: legacy.events.map(e => eventToValue[e]), mode: legacy.mode }`
- `never` → `ValueExprEvent { eventKind: 'never' }`

All cross-table references are resolved via the forward mapping arrays built in earlier phases.

#### Acceptance Criteria
- [ ] `lowerToValueExprs(program)` produces a complete `ValueExprTable`
- [ ] Every legacy expression has exactly one ValueExpr equivalent
- [ ] Forward mappings are complete: `sigToValue.length === signalExprs.nodes.length`, etc.
- [ ] Reverse mappings are complete: `valueToSig.length === nodes.length`, etc.
- [ ] Cross-table references correctly resolved (broadcast signal, zipSig signals, wrap input, combine inputs)
- [ ] All existing tests pass (no behavioral change)
- [ ] New test: compile a representative patch and verify `program.valueExprs.nodes.length === sum of all three legacy table lengths`

#### Technical Notes
The lowering pass is a pure function: `(program: CompiledProgramIR) → ValueExprTable`. It does not mutate the input program. The pass is called at the end of `compile()` and the result is attached to the program IR.

Cross-table reference resolution is straightforward because:
1. Signals are lowered first → sigToValue is populated
2. Fields are lowered second → can reference sigToValue for broadcast/zipSig
3. Events are lowered third → can reference sigToValue for wrap and eventToValue for combine

---

### P1 WI-3: Enforcement Test — No Legacy Kind Switch in New Code

**Dependencies**: WI-2
**Spec Reference**: ChatGPT review: cross-sprint enforcement

#### Description
Add a grep-based enforcement test that prevents new runtime code from switching on `SigExpr.kind`, `FieldExpr.kind`, or `EventExpr.kind` outside the legacy evaluators. This ensures new code uses ValueExpr dispatch.

Allowed files (legacy evaluators, to be migrated later):
- `SignalEvaluator.ts`
- `Materializer.ts`
- `EventEvaluator.ts`
- The lowering pass itself (reads legacy kinds to produce ValueExpr)

All other `.ts` files must not contain `expr.kind === 'slot'` or similar legacy dispatch patterns.

#### Acceptance Criteria
- [ ] Test scans all `.ts` files outside the allowed list
- [ ] Test fails if legacy kind dispatch is found in new code
- [ ] Test passes on current codebase

## Dependencies
- This entire sprint depends on Sprint 1 (type-fixes) being complete
- WI-2 depends on WI-1 (ValueExprTable type must exist)
- WI-3 depends on WI-2 (enforcement makes sense only after lowering exists)

## Risks
- **Lowering fidelity**: If the lowering pass doesn't faithfully translate legacy semantics, shadow mode in Sprint 3 will catch it. Mitigation: exhaustive switch in lowering pass with `never` default.
- **Performance**: Lowering pass adds a one-time cost after compilation. Mitigation: runs once per compile, not per frame; compilation is not in the hot loop.

## Cross-Sprint Enforcement
- After this sprint: no new runtime code may switch on `SigExpr.kind` / `FieldExpr.kind` / `EventExpr.kind` outside the legacy evaluators (grep test in WI-3).
- After Sprint 3 cutover: ScheduleExecutor routes signal steps through ValueExpr-only in CI.
- After Sprint 4 cutover: same for event steps.
- After Sprint 5 cutover: legacy expr tables no longer consulted by ScheduleExecutor in normal mode.
