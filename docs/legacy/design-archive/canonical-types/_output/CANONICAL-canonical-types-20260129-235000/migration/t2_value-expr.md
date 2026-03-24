---
parent: ../INDEX.md
topic: migration
tier: 2
---

# Migration: Unified ValueExpr IR (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](../type-system/t1_canonical-type.md)
**Related Topics**: [Type System](../type-system/), [Validation](../validation/)

---

## Overview

ValueExpr is the unified expression IR that replaces the three separate expression families (SigExpr, FieldExpr, EventExpr). Every expression carries `type: CanonicalType` and uses `kind` as its discriminant.

## ValueExpr (Resolution A1: uses `kind`)

```typescript
type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime;

// All variants share:
interface ValueExprBase {
  readonly kind: string;          // discriminant
  readonly type: CanonicalType;   // mandatory on every variant
}
```

### 6 Variants

| Variant | `kind` | Purpose |
|---------|--------|---------|
| `ValueExprConst` | `'const'` | Literal values |
| `ValueExprExternal` | `'external'` | External inputs (channels, slots, shape refs) |
| `ValueExprIntrinsic` | `'intrinsic'` | Instance-bound intrinsics (index, position, randomId) |
| `ValueExprKernel` | `'kernel'` | Pure computation over inputs |
| `ValueExprState` | `'state'` | Stateful/history behavior |
| `ValueExprTime` | `'time'` | Time reads |

## Total Mapping from Legacy IR (Resolution G2)

All 24 legacy variants from SigExpr (10), FieldExpr (9), and EventExpr (5) map to exactly one of the 6 ValueExpr variants. No new variants are needed.

### Mapping Rule (Deterministic)

- Pure computation over inputs → `ValueExprKernel` with explicit `kernelId` and `args`
- Time reads → `ValueExprTime`
- Stateful/history behavior → `ValueExprState`
- External world reads → `ValueExprExternal`
- Literals → `ValueExprConst`

### Complete Mapping Table

**SigExpr (10 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| SigExprConst | ValueExprConst | Direct mapping |
| SigExprTime | ValueExprTime | Direct mapping |
| SigExprExternal | ValueExprExternal | Channel namespace preserved |
| SigExprState | ValueExprState | Direct mapping |
| SigExprKernel | ValueExprKernel | kernelId preserved |
| SigExprIntrinsic | ValueExprIntrinsic | Direct mapping |
| SigExprSlot | ValueExprExternal | Channel namespace `slot:<id>` |
| SigExprShapeRef | ValueExprExternal | Channel namespace `shape:<shapeId>:<param>` |
| SigExprReduceField | ValueExprKernel | kernelId `reduceField` |
| SigExprEventRead | ValueExprKernel | kernelId `eventReadScalar01`, output: `canonicalSignal(float, scalar)` (N5) |

**FieldExpr (9 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| FieldExprConst | ValueExprConst | Direct mapping |
| FieldExprExternal | ValueExprExternal | Direct mapping |
| FieldExprState | ValueExprState | Direct mapping |
| FieldExprKernel | ValueExprKernel | kernelId preserved |
| FieldExprIntrinsic | ValueExprIntrinsic | Direct mapping |
| FieldExprBroadcast | ValueExprKernel | kernelId `broadcast` |
| FieldExprZipSig | ValueExprKernel | kernelId `zipSig` |
| FieldExprPathDerivative | ValueExprKernel | kernelId `pathDerivative` |
| FieldExprMap | ValueExprKernel | kernelId preserved from mapping function |

**EventExpr (5 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| EventExprConst | ValueExprConst | Direct mapping |
| EventExprPulse | ValueExprKernel | kernelId `eventPulse`, type: discrete |
| EventExprWrap | ValueExprKernel | kernelId `eventWrap`, type: discrete |
| EventExprCombine | ValueExprKernel | kernelId `eventCombine`, type: discrete |
| EventExprNever | ValueExprConst | `{ kind: 'bool', value: false }` + type: `canonicalEvent` (discrete bool none) |

### Key Design Decisions

- **EventExprNever → ValueExprConst**: A "never fires" event is just a constant `false` with event type. Elegant and type-sound.
- **SigExprEventRead → ValueExprKernel**: The output is a continuous float signal (0.0/1.0), NOT a discrete event. The kernel reads event state and produces a gating signal.
- **No new variants**: Every legacy expression maps to one of the existing 6 variants. The kernel variant with different kernelIds absorbs all pure computation diversity.

## Constraint

After migration, there must be a single codepath that converts legacy expr nodes into ValueExpr (frontend), and all backend lowering/scheduling must consume ValueExpr only.

---

## See Also

- [CanonicalType](../type-system/t1_canonical-type.md) - Every ValueExpr carries this
- [Unit Restructure](./t2_unit-restructure.md) - UnitType changes in same migration
- [Definition of Done](./t3_definition-of-done.md) - Migration completion checklist
