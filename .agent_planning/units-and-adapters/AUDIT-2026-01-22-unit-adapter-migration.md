# Unit & Adapter System Audit Report

**Date**: 2026-01-22
**Scope**: Unit type system migration completeness + Adapter system implementation status
**Intensity**: Thorough
**Dimension**: Code Quality (Architecture + Design)

---

## Summary

The **Unit type system migration (Phase 1)** is **complete and compiling**. The **Adapter/Domain Transformation system (Phase 2)** is **designed but not implemented** beyond the existing FieldBroadcast (cardinality) adapter.

**Migration completeness: ~60%** — Type system 100%, Adapter blocks 0% (of spec requirement), Editor integration 0%.

---

## Phase 1: Unit Type System — COMPLETE

| Area | Status | Location |
|------|--------|----------|
| `Unit` discriminated union (14 kinds) | Done | `canonical-types.ts:20-54` |
| `SignalType.unit` is mandatory (`readonly unit: Unit`) | Done | `canonical-types.ts:419` |
| `signalType()` factory always provides a unit | Done | Defaults via `defaultUnitForPayload()` |
| Payload-unit validation (`isValidPayloadUnit`) | Done | `canonical-types.ts:85` |
| `PayloadType` cleaned: removed 'phase' and 'unit' | Done | Clean set of 7 payloads |
| Block definitions use explicit units (`unitPhase01()`) | Done | signal, time, color, geometry, field-ops, instance blocks |
| Unit equality (`unitsEqual`) | Done | `canonical-types.ts` |
| Helper constructors default unit | Done | `canonical-types.ts:658-719` |
| Test for unit mismatch as hard error | Done | `unit-validation.test.ts:29` |
| TypeScript compiles cleanly | Done | No type errors |

---

## Phase 2: Adapter System — NOT IMPLEMENTED (Designed Only)

| Area | Status | Location |
|------|--------|----------|
| Spec written (Part B of `0-Units-and-Adapters.md`) | Done | `design-docs/_new/0-Units-and-Adapters.md` |
| Adapter registry structure (`AdapterSpec`, `AdapterRule`) | Done | `graph/adapters.ts` |
| Adapter insertion pass (`pass2-adapters.ts`) | Done | Works for cardinality adapters only |
| FieldBroadcast adapter (one->many) | Done | `blocks/field-blocks.ts` |
| **10 required unit-conversion adapter blocks** | Missing | Spec B4.1 |
| **Unit-aware adapter lookup** (unit in TypeSignature) | Missing | `TypeSignature` lacks `unit` field |
| **Editor adapter attachment model** | Missing | No `AdapterAttachment` in patch/graph |
| **Graph normalization for port-attached adapters** | Missing | Only cardinality broadcast exists |
| **Adapter UI** (badges, annotations) | Missing | |
| **Diagnostics** (TYPE_MISMATCH suggestions, B7) | Missing | |
| **Auto-insertion algorithm** (B3.3 Steps 1-5) | Missing | |

### Required Adapter Blocks (Spec B4.1)

None of these are implemented:

| # | Adapter | In | Out | Semantics |
|---|---------|----|----|-----------|
| 1 | PhaseToScalar01 | float:phase01 | float:scalar | y = x |
| 2 | ScalarToPhase01 | float:scalar | float:phase01 | y = wrap01(x) |
| 3 | PhaseToRadians | float:phase01 | float:radians | y = x * 2pi |
| 4 | RadiansToPhase01 | float:radians | float:phase01 | y = wrap01(x / 2pi) |
| 5 | DegreesToRadians | float:degrees | float:radians | y = x * (pi/180) |
| 6 | RadiansToDegrees | float:radians | float:degrees | y = x * (180/pi) |
| 7 | MsToSeconds | float/int:ms | float:seconds | y = x / 1000 |
| 8 | SecondsToMs | float:seconds | int/float:ms | explicit rounding |
| 9 | ScalarToNorm01Clamp | float:scalar | float:norm01 | y = clamp01(x) |
| 10 | Norm01ToScalar | float:norm01 | float:scalar | y = x |

---

## Findings

### P1: `isTypeCompatible` uses unnecessary guard on mandatory field

**Location**: `src/compiler/passes-v2/pass2-types.ts:77`

```typescript
if (from.unit && to.unit && from.unit.kind !== to.unit.kind) {
```

`SignalType.unit` is declared as `readonly unit: Unit` (non-optional). The `from.unit && to.unit` guard is dead code from before unit became mandatory. Should be:

```typescript
if (from.unit.kind !== to.unit.kind) {
```

**Impact**: Low (code works correctly, just misleading).

### P2: Dual enforcement — `checkUnitCompatibility` is redundant

**Location**: `src/compiler/passes-v2/pass2-types.ts:263-279`

The function emits `console.warn` for unit mismatches, but `isTypeCompatible()` at line 77 already catches the same condition as a **hard error** (accumulated into the errors array and thrown). By the time `checkUnitCompatibility` runs (line 383), the mismatch has already been recorded.

This violates **Single Enforcer** — the same invariant (unit compatibility) is checked in two places with different severities (hard error vs. warning). The warning path is unreachable for actual mismatches because the hard error fires first.

**Recommendation**: Remove `checkUnitCompatibility` entirely. The hard error in `isTypeCompatible` is the correct single enforcer.

### P2: `TypeSignature` in adapter registry doesn't include `unit`

**Location**: `src/graph/adapters.ts:39-43`

```typescript
export interface TypeSignature {
  readonly payload: PayloadType | 'any';
  readonly cardinality: 'zero' | 'one' | 'many' | 'any';
  readonly temporality: 'continuous' | 'discrete' | 'any';
  // Missing: unit
}
```

The adapter registry can only match on payload+cardinality+temporality. The spec requires adapters to convert between units (e.g., `float:phase01 -> float:radians`). The current registry **cannot express unit-conversion adapters**.

**Recommendation**: When implementing Phase 2, extend `TypeSignature` to include `unit: Unit['kind'] | 'any'`.

### P2: Many blocks use `signalType('float')` without semantic unit annotation

**Scope**: math-blocks, primitive-blocks, geometry-blocks, signal-blocks

When called as `signalType('float')`, the default unit is `unitScalar()`. This is correct for generic math operations, but some ports semantically carry specific units that aren't declared:

- `PolarToCartesian.angle` — should be `unitRadians()` or `unitDegrees()`?
- `CircularLayout.radius` — spatial meaning, `unitScalar()` is arguably correct
- `Oscillator.out` — output is `[-1,1]` normalized

These are **design decisions** for the adapter system to resolve, not bugs. The current defaults are safe because `unitScalar()` is the catch-all for dimensionless floats.

### P3: `NumericUnit` type alias — unused import in pass2-types

**Location**: `src/compiler/passes-v2/pass2-types.ts:17`

```typescript
import type { SignalType, NumericUnit } from "../../core/canonical-types";
```

`NumericUnit` is imported but not used in this file. Dead import.

### P3: Kernel signatures use optional `unit?: UnitKind`

**Location**: `src/runtime/kernel-signatures.ts:30,38`

```typescript
readonly unit?: UnitKind;      // KernelInputSignature
readonly unit?: UnitKind;      // KernelOutputSignature
```

Kernel signatures still treat unit as optional, which is inconsistent with the mandatory unit in `SignalType`. This is acceptable for now (kernels are a different layer — they describe runtime expectations, not graph types), but should be aligned when adapters are implemented to enable unit-aware kernel validation.

---

## Related Beads

| Bead ID | Title | Priority | Status |
|---------|-------|----------|--------|
| `oscilla-animator-v2-8m2` | Domain Transformation System (Adapters) | P2 | Ready |
| `oscilla-animator-v2-3zd` | Track unit for floats in Expression DSL | P2 | Ready |

---

## Recommendations

1. **P1 fix (quick)**: Remove the guard in `isTypeCompatible` and delete `checkUnitCompatibility` + its call. Single enforcer.
2. **P1 fix (quick)**: Remove unused `NumericUnit` import from `pass2-types.ts`.
3. **Phase 2 planning**: The adapter system implementation should follow the spec in `design-docs/_new/0-Units-and-Adapters.md` Part B. Key sequence:
   - Extend `TypeSignature` with `unit`
   - Implement the 10 adapter blocks as registered block types
   - Add `AdapterAttachment` to patch/graph model
   - Implement graph normalization materialization (B3)
   - Implement editor auto-insertion algorithm (Steps 1-5)
   - Add diagnostics (B7)
4. **Port unit annotations**: As adapters are built, revisit blocks like `PolarToCartesian` and `Oscillator` to declare semantic units on their ports.

---

## Spec References

- **Authoritative**: `design-docs/_new/0-Units-and-Adapters.md`
- **Canonical type system**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md`
- **Sprint plans**: `.agent_planning/units-and-adapters/SPRINT-2026-01-22-*`
