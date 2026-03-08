---
parent: ../INDEX.md
purpose: Migration checklists and temporal work items for the CanonicalType system refactor
note: This is temporal/work-tracking content, not architectural specification
---

# Type System Migration Reference

> This appendix contains migration checklists, CI gates, governance rules, and mapping tables for the CanonicalType system refactor. Architectural content lives in [01-type-system](../topics/01-type-system.md), [20-type-validation](../topics/20-type-validation.md), and [21-adapter-system](../topics/21-adapter-system.md).

---

## ValueExpr Unified IR

ValueExpr is the unified expression IR. Every expression carries `type: CanonicalType` and uses `kind` as its discriminant. The migration tables below map the 24 legacy expression variants to the 6 canonical ValueExpr variants.

### 6 ValueExpr Variants

| Variant | `kind` | Purpose |
|---------|--------|---------|
| `ValueExprConst` | `'const'` | Literal values |
| `ValueExprExternal` | `'external'` | External inputs (channels, offsets) |
| `ValueExprIntrinsic` | `'intrinsic'` | Instance-bound intrinsics (index, randomId) |
| `ValueExprKernel` | `'kernel'` | Pure computation over inputs |
| `ValueExprState` | `'state'` | Stateful/history behavior |
| `ValueExprTime` | `'time'` | Time reads |

### Complete Mapping Table (24→6)

**Legacy Scalar Expressions (10 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| SigExprConst | ValueExprConst | Direct mapping |
| SigExprTime | ValueExprTime | Direct mapping |
| SigExprExternal | ValueExprExternal | Channel namespace preserved |
| SigExprState | ValueExprState | Direct mapping |
| SigExprKernel | ValueExprKernel | kernelId preserved |
| SigExprIntrinsic | ValueExprIntrinsic | Direct mapping |
| SigExprSlot | ValueExprExternal | Channel namespace `offset:<id>` |
| SigExprShapeRef | ValueExprExternal | Channel namespace `shape:<shapeId>:<param>` |
| SigExprReduceField | ValueExprKernel | kernelId `reduceArray` |
| SigExprEventRead | ValueExprKernel | kernelId `eventReadScalar01`, output: `one:float` |

**Legacy Array Expressions (9 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| FieldExprConst | ValueExprConst | Direct mapping |
| FieldExprExternal | ValueExprExternal | Direct mapping |
| FieldExprState | ValueExprState | Direct mapping |
| FieldExprKernel | ValueExprKernel | kernelId preserved |
| FieldExprIntrinsic | ValueExprIntrinsic | Direct mapping |
| FieldExprBroadcast | ValueExprKernel | kernelId `broadcast` |
| FieldExprZipSig | ValueExprKernel | kernelId `zip` |
| FieldExprPathDerivative | ValueExprKernel | kernelId `pathDerivative` |
| FieldExprMap | ValueExprKernel | kernelId preserved from mapping function |

**Legacy Event Expressions (5 variants)**:

| Legacy | ValueExpr | kernelId / Notes |
|--------|-----------|-----------------|
| EventExprConst | ValueExprConst | Direct mapping |
| EventExprPulse | ValueExprKernel | kernelId `eventPulse`, type: discrete |
| EventExprWrap | ValueExprKernel | kernelId `eventWrap`, type: discrete |
| EventExprCombine | ValueExprKernel | kernelId `eventCombine`, type: discrete |
| EventExprNever | ValueExprConst | `{ kind: 'bool', value: false }` + type: `canonicalEvent` |

### Key Design Decisions

- **Legacy SigExprEventRead → ValueExprKernel**: The output is a continuous float value (0.0/1.0), NOT a discrete event.
- **No new variants**: Every legacy expression maps to one of the existing 6 variants.

---

## UnitType Restructure Mapping

From flat kinds to structured kinds:

| Old Flat Kind | New Structured Kind |
|---------------|-------------------|
| `none` | `{ kind: 'none' }` |
| `scalar` | `{ kind: 'none' }` |
| `norm01` | `{ kind: 'angle', unit: 'phase01' }` (or none) |
| `count` | `{ kind: 'count' }` |
| `deg` | `{ kind: 'angle', unit: 'degrees' }` |
| `rad` | `{ kind: 'angle', unit: 'radians' }` |
| `phase01` | `{ kind: 'angle', unit: 'phase01' }` |
| `ms` | `{ kind: 'time', unit: 'ms' }` |
| `seconds` | `{ kind: 'time', unit: 'seconds' }` |
| `world3` | `{ kind: 'space', space: 'world', dims: 3 }` |
| `rgba01` | `{ kind: 'color', unit: 'rgba01' }` |

---

## Definition of Done

### 90% Done (Bulk Work Complete)

- [ ] CanonicalType uses `Axis<T, V>` (not `AxisTag<T>`).
- [ ] UnitType has 6 structured kinds.
- [ ] ValueExpr unifies SigExpr/FieldExpr/EventExpr with `kind` discriminant.
- [ ] All 24 legacy variants mapped to 6 ValueExpr variants.
- [ ] No `instanceId` field on expressions that carry `type: CanonicalType`.
- [ ] `validateAxes()` enforces axis-shape contracts.
- [ ] ConstValue is discriminated union.
- [ ] No `SignalType`, `PortType`, `FieldType`, `EventType` aliases exist.

---

## Rules for New Types

1. **Compose with CanonicalType**: No standalone type representations.
2. **No stored Classification**: Classifications must be derived from axes.
3. **No flat unit kinds**: New units use structured UnitType.
4. **No instance ID outside extent**: Instance identity has one home.
5. **No new expression families**: Everything is ValueExpr.
6. **No untyped value nodes**: Every value-producing node carries `type: CanonicalType`.
7. **No discriminant surprises**: New discriminated unions use `kind`.
8. **No implicit axis transforms**: Operations that change axes must declare the transform explicitly.
9. **No bypass of validation gate**: New expression types must be validated by `validateAxes()`.
10. **No legacy type aliases**: Do not reintroduce `SignalType`, `FieldType`, etc.

---

## See Also

- [01-type-system](../topics/01-type-system.md) - Architectural type definitions
- [20-type-validation](../topics/20-type-validation.md) - Enforcement gate and guardrails
