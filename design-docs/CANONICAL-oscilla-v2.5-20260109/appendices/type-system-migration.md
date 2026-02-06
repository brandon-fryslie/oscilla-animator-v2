---
parent: ../INDEX.md
purpose: Migration checklists and temporal work items for the CanonicalType system refactor
note: This is temporal/work-tracking content, not architectural specification
---

# Type System Migration Reference

> This appendix contains migration checklists, CI gates, governance rules, and mapping tables for the CanonicalType system refactor. These are temporal work items — they describe work to be done, not architectural decisions. Architectural content lives in [01-type-system](../topics/01-type-system.md), [20-type-validation](../topics/20-type-validation.md), and [21-adapter-system](../topics/21-adapter-system.md).

---

## ValueExpr Unified IR

ValueExpr is the unified expression IR. Every expression carries `type: CanonicalType` and uses `kind` as its discriminant. The migration tables below map the 24 legacy expression variants to the 6 canonical ValueExpr variants.

### 6 ValueExpr Variants

| Variant | `kind` | Purpose |
|---------|--------|---------|
| `ValueExprConst` | `'const'` | Literal values |
| `ValueExprExternal` | `'external'` | External inputs (channels, slots, shape refs) |
| `ValueExprIntrinsic` | `'intrinsic'` | Instance-bound intrinsics (index, position, randomId) |
| `ValueExprKernel` | `'kernel'` | Pure computation over inputs |
| `ValueExprState` | `'state'` | Stateful/history behavior |
| `ValueExprTime` | `'time'` | Time reads |

### Complete Mapping Table (24→6)

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
| SigExprEventRead | ValueExprKernel | kernelId `eventReadScalar01`, output: `canonicalSignal(float, scalar)` |

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
| EventExprNever | ValueExprConst | `{ kind: 'bool', value: false }` + type: `canonicalEvent` |

### Key Design Decisions

- **EventExprNever → ValueExprConst**: A "never fires" event is just a constant `false` with event type.
- **SigExprEventRead → ValueExprKernel**: The output is a continuous float signal (0.0/1.0), NOT a discrete event.
- **No new variants**: Every legacy expression maps to one of the existing 6 variants.

---

## UnitType Restructure Mapping

From 16+ flat kinds to 8 structured kinds:

| Old Flat Kind | New Structured Kind |
|---------------|-------------------|
| `none` | `{ kind: 'none' }` |
| `scalar` | `{ kind: 'scalar' }` |
| `norm01` | `{ kind: 'norm01' }` |
| `count` | `{ kind: 'count' }` |
| `deg` | `{ kind: 'angle', unit: 'degrees' }` |
| `rad` | `{ kind: 'angle', unit: 'radians' }` |
| `phase01` | `{ kind: 'angle', unit: 'phase01' }` |
| `ms` | `{ kind: 'time', unit: 'ms' }` |
| `seconds` | `{ kind: 'time', unit: 'seconds' }` |
| `ndc2` | `{ kind: 'space', space: 'ndc', dims: 2 }` |
| `ndc3` | `{ kind: 'space', space: 'ndc', dims: 3 }` |
| `world2` | `{ kind: 'space', space: 'world', dims: 2 }` |
| `world3` | `{ kind: 'space', space: 'world', dims: 3 }` |
| `view2` | `{ kind: 'space', space: 'view', dims: 2 }` |
| `view3` | `{ kind: 'space', space: 'view', dims: 3 }` |
| `rgba01` | `{ kind: 'color', space: 'rgba01' }` |
| `var` | **REMOVED** — unit variables in inference-only wrappers |

---

## Definition of Done

### 90% Done (Bulk Work Complete)

- [ ] CanonicalType uses `Axis<T, V>` (not `AxisTag<T>`)
- [ ] UnitType has 8 structured kinds (no flat kinds, no var)
- [ ] `tryGetManyInstance` + `requireManyInstance` replace `getManyInstance`
- [ ] ValueExpr unifies SigExpr/FieldExpr/EventExpr with `kind` discriminant
- [ ] All 24 legacy variants mapped to 6 ValueExpr ops
- [ ] No `instanceId` field on expressions that carry `type: CanonicalType`
- [ ] `validateAxes()` enforces axis-shape contracts
- [ ] AdapterSpec uses TypePattern/ExtentPattern with purity+stability
- [ ] ConstValue is discriminated union (not `number | boolean`)
- [ ] No `SignalType`, `PortType`, `FieldType`, `EventType` aliases exist

### 100% Done (CI Gates Pass)

- [ ] All legacy type aliases removed from codebase
- [ ] All tests pass with no `@ts-ignore` on type assertions
- [ ] No `any` casts related to type system without documented rationale
- [ ] Coverage: axis validation path has >90% branch coverage
- [ ] CI gate Vitest test passes (see below)

### CI Gate Test

A Vitest test MUST exist that fails CI for forbidden patterns. This is the automated enforcement gate — manual verification is supplementary only. The test runs as part of `npm run test`, not a separate script.

**Forbidden patterns**: `AxisTag<`, payload `var` outside inference, `UnitType` var, `SignalType`/`PortType`/`FieldType`/`EventType`/`ResolvedPortType`, `instanceId` fields on expression with type

**Allowlist** (with expiration dates):
- `src/compiler/passes-v2/` (legacy, excluded from build)
- Files explicitly marked with `// MIGRATION: allowlisted until <date>`

**Allowlist governance**:
- Every entry MUST have an expiration date. No permanent exceptions.
- New entries require an owner and a rationale.
- Expired entries are violations — treat them as CI failures.

---

## Rules for New Types

12 governance rules preventing regression:

1. **Compose with CanonicalType**: No standalone type representations. If it carries type info, it references CanonicalType.
2. **No stored DerivedKind**: Need signal/field/event classification? Call `deriveKind()`.
3. **No flat unit kinds**: New units use structured UnitType (e.g., `{ kind: 'space', space: 'uv', dims: 2 }`).
4. **No instance ID outside extent**: Instance identity has one home. Use `requireManyInstance()` to extract it.
5. **No new expression families**: Everything is ValueExpr. New ops become kernelIds, not new union variants.
6. **No untyped value nodes**: Every value-producing node carries `type: CanonicalType`.
7. **No discriminant surprises**: New discriminated unions use `kind` as the discriminant field name.
8. **No unit variables in canonical types**: Unit inference uses solver-internal structures only.
9. **No referent data in binding axis**: Binding is 4 nominal tags. Referent info goes in continuity/state op args.
10. **No implicit axis transforms**: Operations that change axes must declare the transform explicitly.
11. **No bypass of validation gate**: New expression types must be validated by `validateAxes()`.
12. **No legacy type aliases**: Do not reintroduce `SignalType`, `PortType`, `FieldType`, `EventType`, or `ResolvedPortType`.

### Code Review Litmus Tests

When reviewing a PR, ask:
- Does this introduce a parallel type representation? (Rule 1)
- Does this store DerivedKind as authoritative data? (Rule 2)
- Does this add instanceId as a separate field? (Rule 4)
- Does this bypass the validation gate? (Rule 11)

If the answer to any is "yes," the PR needs architectural review.

---

## See Also

- [01-type-system](../topics/01-type-system.md) - Architectural type definitions
- [20-type-validation](../topics/20-type-validation.md) - Enforcement gate and guardrails
- [21-adapter-system](../topics/21-adapter-system.md) - Adapter type patterns
