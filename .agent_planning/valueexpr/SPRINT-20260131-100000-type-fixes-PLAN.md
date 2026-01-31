# Sprint: type-fixes - ValueExpr Type Definition Fixes

Generated: 2026-01-31-100000
Confidence: HIGH: 8, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260131-090000.md

## Sprint Goal

Fix all structural and semantic gaps in the ValueExpr type definition so it is field-complete relative to legacy SigExpr/FieldExpr/EventExpr and compatible with flat array storage.

## Scope

**Deliverables:**
- Flatten all ValueExpr references from `ValueExpr` to `ValueExprId`
- Add `mode: 'any' | 'all'` to event combine variant
- Expand `ValueExprTime.which` to all 7 legacy time signals
- Add `controlPointField: ValueExprId` to `ValueExprShapeRef`
- Create `ValueExprSlotRead` as 10th top-level kind
- Make kernel variants a discriminated sub-union (fn required only for map/zip/zipSig; reduce has `op`, pathDerivative has `op`)
- Fix naming: event const uses `fired`, pulse uses `source: 'timeRoot'`
- Update invariant tests for new kind count (10) and new structure
- Mechanical enforcement test: grep/AST check that no ValueExpr* definition contains embedded `ValueExpr` as a field type

## Work Items

### P0 WI-1: Flatten ValueExpr References to ValueExprId

**Dependencies**: None
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 1 (Single Authority) | **Status Reference**: EVALUATION-20260131-090000.md "CRITICAL: ValueExpr Uses Tree Nesting"

#### Description
Change all embedded `ValueExpr` and `ValueExpr[]` references to `ValueExprId` and `readonly ValueExprId[]`. This aligns ValueExpr with the flat-array + ID-reference model used by the existing runtime caching (sigValues[], fieldBuffers[]).

Affected fields:
- `ValueExprKernel.args: ValueExpr[]` -> see WI-7 (kernel sub-union)
- `ValueExprShapeRef.paramArgs: ValueExpr[]` -> `readonly ValueExprId[]`
- `ValueExprEvent.wrap.input: ValueExpr` -> `ValueExprId`
- `ValueExprEvent.combine.inputs: ValueExpr[]` -> `readonly ValueExprId[]`

#### Acceptance Criteria
- [ ] No `ValueExpr` type appears as a field value in any ValueExpr variant (only `ValueExprId`)
- [ ] TypeScript compiles with zero errors
- [ ] All existing tests pass (2004+)

#### Technical Notes
The kernel args change is handled by WI-7 (kernel sub-union). This WI covers shapeRef and event variants. Import `ValueExprId` from `./Indices` (already exported).

---

### P0 WI-2: Add mode to Event Combine

**Dependencies**: None
**Spec Reference**: EventExprCombine in types.ts:336-340 | **Status Reference**: EVALUATION-20260131-090000.md "CRITICAL: ValueExprEvent combine Missing mode Field"

#### Description
Add `readonly mode: 'any' | 'all'` to the `ValueExprEvent` combine variant, matching legacy `EventExprCombine.mode`.

#### Acceptance Criteria
- [ ] `ValueExprEvent` combine variant has `readonly mode: 'any' | 'all'`
- [ ] Constructing a combine without `mode` is a TypeScript compile error
- [ ] Invariant test updated to verify mode presence

#### Technical Notes
Single-line addition to the combine variant in `value-expr.ts`.

---

### P0 WI-3: Expand ValueExprTime.which to 7 Cases

**Dependencies**: None
**Spec Reference**: SigExprTime in types.ts:110 | **Status Reference**: EVALUATION-20260131-090000.md "CRITICAL: ValueExprTime Missing 5 Time Signals"

#### Description
Expand `ValueExprTime.which` from `'tMs' | 'phaseA'` to the full set: `'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy'`.

#### Acceptance Criteria
- [ ] `ValueExprTime.which` accepts all 7 time signal names
- [ ] TypeScript compiles with zero errors
- [ ] Invariant test updated to verify all 7 values are accepted

#### Technical Notes
Match exact union from `SigExprTime.which` in `types.ts:110`.

---

### P1 WI-4: Add controlPointField to ValueExprShapeRef

**Dependencies**: WI-1 (needs ValueExprId references)
**Spec Reference**: SigExprShapeRef in types.ts:153 | **Status Reference**: EVALUATION-20260131-090000.md "SigExprShapeRef.controlPointField Missing"

#### Description
Add `readonly controlPointField?: ValueExprId` to `ValueExprShapeRef`. The legacy version carries `{ id: FieldExprId; stride: number }` but in the unified table, stride is derivable from the referenced expression's `CanonicalType.payload`, so only the ID reference is needed.

Also add a validation note: the referenced expression must have field-extent (cardinality many).

#### Acceptance Criteria
- [ ] `ValueExprShapeRef` has optional `controlPointField: ValueExprId`
- [ ] Comment documents field-extent validation requirement
- [ ] TypeScript compiles with zero errors

#### Technical Notes
Stride is derivable via `payloadStride(expr.type.payload)` at the consumer site. Do not store stride redundantly.

---

### P0 WI-5: Create ValueExprSlotRead as 10th Kind

**Dependencies**: None
**Spec Reference**: SigExprSlot in types.ts:102-106 | **Status Reference**: EVALUATION-20260131-090000.md "SigExprSlot Has No ValueExpr Equivalent"

#### Description
Create `ValueExprSlotRead` as a new top-level kind (the 10th kind). This covers the `SigExprSlot` case (reading from ValueSlot storage for strided multi-component signals). It is NOT merged into `ValueExprState` because state is reserved for branch/history-affecting ops (hold/delay/integrate/slew/preserve), while slot read is executor/register-file plumbing.

```typescript
export interface ValueExprSlotRead {
  readonly kind: 'slotRead';
  readonly type: CanonicalType;
  readonly slot: ValueSlot;
}
```

#### Acceptance Criteria
- [ ] `ValueExprSlotRead` exists with kind `'slotRead'`
- [ ] Added to the `ValueExpr` union type
- [ ] EXPECTED_KINDS updated to 10 in invariant test
- [ ] Compile-time exhaustiveness check passes
- [ ] All existing tests pass

#### Technical Notes
Import `ValueSlot` from `./Indices`. Update the design principles comment at top of file to say "10 kinds". The invariant test count must change from 9 to 10.

---

### P0 WI-6: Fix Event Naming (fired, pulse source)

**Dependencies**: None
**Spec Reference**: EventExprConst.fired, EventExprPulse.source in types.ts:320-327 | **Status Reference**: EVALUATION-20260131-090000.md "EventExprPulse Semantic Mismatch"

#### Description
Two naming fixes:
1. Event const: change `value: boolean` to `fired: boolean` (matches legacy `EventExprConst.fired`)
2. Pulse: change `pulseTimeMs: number` to `source: 'timeRoot'` (matches legacy `EventExprPulse.source` semantics -- pulse fires every tick from timeRoot, it is not a specific time)

#### Acceptance Criteria
- [ ] `ValueExprEvent` const variant has `readonly fired: boolean` (not `value`)
- [ ] `ValueExprEvent` pulse variant has `readonly source: 'timeRoot'` (not `pulseTimeMs`)
- [ ] Invariant test mock objects updated to match new field names
- [ ] TypeScript compiles with zero errors

#### Technical Notes
The legacy EventEvaluator ignores the source field and returns true every tick. The semantic model is "pulse from time root" not "pulse at specific time."

---

### P0 WI-7: Make Kernel Variants a Discriminated Sub-Union

**Dependencies**: WI-1 (needs ValueExprId references)
**Spec Reference**: Confirmed decision #7 | **Status Reference**: EVALUATION-20260131-090000.md "ValueExprKernel.fn is Optional"

#### Description
Replace the single `ValueExprKernel` interface with a discriminated sub-union where `fn` is required only for `map`/`zip`/`zipSig`. This recovers the type safety the legacy system had (map/zip require fn, broadcast/reduce/pathDerivative do not).

```typescript
export type ValueExprKernel =
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'map'; readonly input: ValueExprId; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'zip'; readonly inputs: readonly ValueExprId[]; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'zipSig'; readonly field: ValueExprId; readonly signals: readonly ValueExprId[]; readonly fn: PureFn }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'broadcast'; readonly signal: ValueExprId }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'reduce'; readonly field: ValueExprId; readonly op: 'min' | 'max' | 'sum' | 'avg' }
  | { readonly kind: 'kernel'; readonly type: CanonicalType; readonly kernelKind: 'pathDerivative'; readonly field: ValueExprId; readonly op: 'tangent' | 'arcLength' };
```

Note: `map` has `input` (singular), `zip` has `inputs` (plural), matching legacy naming. `broadcast` has `signal` (one signal input). `reduce` and `pathDerivative` have `field` (one field input). `zipSig` has `field` + `signals` matching legacy `FieldExprZipSig`.

#### Acceptance Criteria
- [ ] `ValueExprKernel` is a discriminated union on `kernelKind`
- [ ] `fn` is required on `map`, `zip`, `zipSig` variants only
- [ ] `fn` does not exist on `broadcast`, `reduce`, `pathDerivative` variants
- [ ] `reduce` variant has `readonly op: 'min' | 'max' | 'sum' | 'avg'`
- [ ] `pathDerivative` variant has `readonly op: 'tangent' | 'arcLength'`
- [ ] Each kernel variant has semantically named input fields (not generic `args`)
- [ ] Invariant test updated for new kernel sub-union structure
- [ ] TypeScript compiles with zero errors

#### Technical Notes
This is the largest single change. The old `args: ValueExpr[]` generic field is replaced by variant-specific input fields. This eliminates the need for runtime validation of arg counts and makes the type system enforce correct usage.

---

### P0 WI-8: Mechanical Enforcement Test — No Embedded ValueExpr References

**Dependencies**: WI-1 (must be done after flattening)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md rule 1 | ChatGPT review: "Make the no-embedded-ValueExpr rule mechanically enforced in CI"

#### Description
Add a grep/AST enforcement test that fails if any `ValueExpr*` type definition in `value-expr.ts` contains embedded `ValueExpr` as a field type. This prevents tree nesting from being reintroduced.

The test should scan `value-expr.ts` and fail if it finds:
- `ValueExpr` used as a field type (not `ValueExprId`)
- `ValueExpr[]` used as a field type (not `ValueExprId[]`)
- Any pattern like `input: ValueExpr` or `args: ValueExpr[]`

Exclude `ValueExprId` references (those are correct).

#### Acceptance Criteria
- [ ] Test file exists (e.g., in `src/compiler/ir/__tests__/`)
- [ ] Test fails if `ValueExpr` (not `ValueExprId`) appears as a field type in any ValueExpr variant
- [ ] Test passes on the corrected (flat) definitions
- [ ] Test runs in CI alongside other enforcement tests

#### Technical Notes
Use grep-based scanning similar to `no-deriveKind-imports.test.ts`. Match patterns like `: ValueExpr[^I]` or `: ValueExpr;` or `: readonly ValueExpr[^I]` to catch embedded references while allowing `ValueExprId`.

## Dependencies
- WI-4 depends on WI-1 (ValueExprId references must exist for controlPointField)
- WI-7 depends on WI-1 (kernel inputs use ValueExprId)
- WI-8 depends on WI-1 (verifies flattening is complete)
- All other WIs are independent

## Risks
- **Invariant test update**: The compile-time exhaustiveness check must be updated for 10 kinds. If done incorrectly, a previously-green test will fail. Mitigation: update EXPECTED_KINDS first, then add the new kind.
- **Mock objects in tests**: Several tests construct ValueExpr mock objects. These must be updated to match the new structure. Mitigation: update all mocks in the same commit as the type changes.

## Cross-Sprint Enforcement
- After this sprint: ValueExpr is parity-complete including reduce/pathDerivative ops. No `ValueExpr` embedded references exist (mechanically enforced).
- After Sprint 2: no new runtime code may switch on `SigExpr.kind` / `FieldExpr.kind` / `EventExpr.kind` outside the legacy evaluators (grep test).
- After Sprint 3 cutover: ScheduleExecutor routes signal steps through ValueExpr-only in CI.
- After Sprint 4 cutover: same for event steps.
- After Sprint 5 cutover: legacy expr tables no longer consulted by ScheduleExecutor in normal mode.
