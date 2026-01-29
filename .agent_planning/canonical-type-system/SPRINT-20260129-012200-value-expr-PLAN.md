# Sprint: value-expr - Unified ValueExpr Table

**Generated**: 2026-01-29T01:21:00Z
**Confidence**: HIGH: 2, MEDIUM: 4, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ ValueExpr as eventual "single expression table" is correct endgame
- ✓ "Frontend convenience tables can exist, canonical lowering target is unified" is correct
- **LOCKED**: ValueExpr is canonical compiler IR, TypedPatch remains canonical UI artifact until UI migration

**CRITICAL BOUNDARY** (from review):
> Make it explicit that ValueExpr is the canonical compiler IR, but TypedPatch remains the canonical UI artifact until you migrate the UI. This prevents the common trap where the team starts rewriting UI plumbing "because ValueExpr exists."

---

## Sprint Goal

Create the unified `ValueExpr` table that replaces the separate `SigExpr`/`FieldExpr`/`EventExpr` type systems. This is the key architectural change to stop the "three separate type systems" drift.

---

## Scope

**Deliverables:**
1. Create `src/compiler/ir/value-expr.ts` with unified ValueExpr type
2. Define all expression variants
3. Update IR builders to emit ValueExpr instead of SigExpr/FieldExpr/EventExpr
4. Update evaluator to handle ValueExpr

---

## Work Items

### P0: Create value-expr.ts File

**Confidence**: HIGH

Create `src/compiler/ir/value-expr.ts` with the unified type.

**Target** (from spec lines 335-400):
```typescript
import { CanonicalType, ConstValue } from '../../core/canonical-types';
import { KernelId, ValueExprId } from '../../core/ids';

export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime;

export interface ValueExprConst {
  readonly op: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;
}

export interface ValueExprExternal {
  readonly op: 'external';
  readonly type: CanonicalType;
  readonly channel: string;
}

export type IntrinsicWhich =
  | 'index'
  | 'normIndex'
  | 'randomId'
  | 'uv'
  | 'rank'
  | 'seed';

export interface ValueExprIntrinsic {
  readonly op: 'intrinsic';
  readonly type: CanonicalType;
  readonly which: IntrinsicWhich;
}

export interface ValueExprKernel {
  readonly op: 'kernel';
  readonly type: CanonicalType;
  readonly kernelId: KernelId;
  readonly args: readonly ValueExprId[];
}

export type StateOp =
  | 'hold'
  | 'delay'
  | 'integrate'
  | 'slew'
  | 'preserve'
  | 'crossfade'
  | 'project';

export interface ValueExprState {
  readonly op: 'state';
  readonly type: CanonicalType;
  readonly stateOp: StateOp;
  readonly args: readonly ValueExprId[];
}

export interface ValueExprTime {
  readonly op: 'time';
  readonly type: CanonicalType;
  readonly which: 'tMs' | 'dtMs' | 'phaseA' | 'phaseB';
}
```

**Acceptance Criteria:**
- [ ] File exists at `src/compiler/ir/value-expr.ts`
- [ ] `ValueExpr` union type defined
- [ ] All 6 expression variants defined
- [ ] `IntrinsicWhich` and `StateOp` helper types defined
- [ ] All variants use `op` discriminant (not `kind`)
- [ ] All variants have `type: CanonicalType`

---

### P1: Map Existing Expressions to ValueExpr

**Confidence**: MEDIUM

#### Unknowns to Resolve:
- Which existing SigExpr/FieldExpr/EventExpr variants map to which ValueExpr variants?
- What about variants not in the spec (e.g., `SigExprShapeRef`, `FieldExprPathDerivative`)?

#### Exit Criteria:
- Complete mapping table of old → new
- Decision on handling variants not in spec

**Current variants to map:**

SigExpr (10 variants):
- SigExprConst → ValueExprConst
- SigExprSlot → ?
- SigExprTime → ValueExprTime
- SigExprExternal → ValueExprExternal
- SigExprMap → ValueExprKernel?
- SigExprZip → ValueExprKernel?
- SigExprStateRead → ValueExprState?
- SigExprShapeRef → ?
- SigExprReduceField → ?
- SigExprEventRead → ?

FieldExpr (9 variants):
- FieldExprConst → ValueExprConst
- FieldExprIntrinsic → ValueExprIntrinsic
- FieldExprBroadcast → ?
- FieldExprMap → ValueExprKernel?
- FieldExprZip → ValueExprKernel?
- FieldExprZipSig → ?
- FieldExprStateRead → ValueExprState?
- FieldExprPathDerivative → ?
- FieldExprPlacement → ValueExprIntrinsic?

EventExpr (5 variants):
- EventExprConst → ValueExprConst
- EventExprPulse → ?
- EventExprWrap → ?
- EventExprCombine → ?
- EventExprNever → ?

**Acceptance Criteria:**
- [ ] Mapping table complete
- [ ] All variants accounted for

---

### P2: Extend ValueExpr for Missing Operations

**Confidence**: MEDIUM

The spec's ValueExpr has 6 variants. The existing system has 24 total. Need to extend.

#### Unknowns to Resolve:
- Should we add more variants to ValueExpr?
- Or should some operations become ValueExprKernel with different kernelIds?

#### Exit Criteria:
- Decision on how to handle each unmapped operation
- Extended ValueExpr type if needed

**Acceptance Criteria:**
- [ ] All 24 existing operations have a home
- [ ] Extended type documented

---

### P3: Update IRBuilder to Emit ValueExpr

**Confidence**: MEDIUM

#### Unknowns to Resolve:
- Can we do a gradual migration (emit both old and new)?
- Or must it be all-at-once?

#### Exit Criteria:
- Migration strategy chosen
- IRBuilder updated

**Acceptance Criteria:**
- [ ] IRBuilder emits ValueExpr
- [ ] Old SigExpr/FieldExpr/EventExpr arrays deprecated or removed

---

### P4: Update Evaluator for ValueExpr

**Confidence**: MEDIUM

#### Unknowns to Resolve:
- How much of the evaluator needs to change?
- Can signal/field/event classification be derived at runtime?

#### Exit Criteria:
- Evaluator handles ValueExpr
- Tests pass

**Acceptance Criteria:**
- [ ] Evaluator processes ValueExpr
- [ ] Uses `deriveKind(expr.type)` to determine evaluation strategy

---

## Dependencies

- **core-types** — Need `Axis<T, V>`, axis aliases
- **constructors-helpers** — Need `deriveKind`, `getManyInstance`

## Risks

| Risk | Mitigation |
|------|------------|
| Major breaking change | Consider gradual migration with both systems |
| Many unmapped variants | May need to extend spec's ValueExpr |
| Evaluator complexity | May need intermediate representation |

---

## Files to Create/Modify

- `src/compiler/ir/value-expr.ts` — CREATE
- `src/compiler/ir/types.ts` — Deprecate SigExpr/FieldExpr/EventExpr
- `src/compiler/ir/builder.ts` — Update to emit ValueExpr
- `src/runtime/evaluator.ts` — Update to handle ValueExpr
