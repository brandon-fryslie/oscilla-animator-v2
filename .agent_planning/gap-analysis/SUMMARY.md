---
scope: full
spec_source: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/
impl_source: src/
generated: 2026-01-29
updated: 2026-01-29T18:00:00Z
previous_run: none — fresh analysis
topics_audited: 5
totals: { trivial: 8, critical: 18, to-review: 0 (all resolved), unimplemented: 11 }
---

# Gap Analysis: CanonicalType System Spec vs Implementation

## Executive Summary

The CanonicalType foundation is solid — the triple structure (payload, unit, extent), Axis<T,V> polymorphism, 5-axis Extent, deriveKind(), instance helpers, and canonical constructors all work correctly. All 12 design questions have been resolved (see [RESOLUTIONS.md](RESOLUTIONS.md)). The resolutions add new P1 work items (delete AxisTag alias, split inference types, remove shape payload, remove stride fields, lock eventRead type, add CI gates) alongside the original P1 fixes.

## Resolved Since Last Run

All P3 (to-review) items have been resolved. Resolutions recorded in [RESOLUTIONS.md](RESOLUTIONS.md).

| Item | Was | Now | Resolution |
|------|-----|-----|------------|
| Q2: PayloadType var | TO-REVIEW | NEW WORK (P1) | Split into InferencePayloadType / PayloadType |
| Q3: deriveKind totality | TO-REVIEW | NEW WORK (P1) | Add tryDeriveKind() + fix spec wording |
| Q4: LoweredOutput kind | TO-REVIEW | ACCEPTED + NEW WORK (P1) | Keep tags, add assert at lowering boundary |
| Q5: DebugService kind | TO-REVIEW | ACCEPTED + NEW WORK (P1) | Same as Q4 |
| Q6: shape payload | TO-REVIEW | NEW WORK (P1) | Remove from PayloadType, reclassify as resource |
| Q7: stride on payload | TO-REVIEW | NEW WORK (P1) | Remove stored stride, single path via payloadStride() |
| Q8: cameraProjection | TO-REVIEW | NEW WORK (P1) | Change to closed enum CameraProjection, not string |
| Q9: binding diagnostics | TO-REVIEW | NEW WORK (P2) | Structured BindingMismatchError required |
| Q10: eventRead type | TO-REVIEW | NEW WORK (P1) | Lock output type in builder, remove caller arg |
| Q11: typeIndex naming | TO-REVIEW | NEW WORK (P1) | Standardize nodeKind + nodeIndex |
| Q12: DoD checklist | TO-REVIEW | TRACKING | Change impl to match spec (already tracked) |
| Q13: CI enforcement | TO-REVIEW | NEW WORK (P1) | Add Vitest grep-based forbidden pattern test |
| Q1: AxisTag alias | TO-REVIEW | NEW WORK (P1) | Delete it |

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)

| # | Item | Source | Description | Context |
|---|------|--------|-------------|---------|
| 1 | T03-C-5 | Audit | Fix 6 broken canonical type tests (stale discriminants) | [context-03](critical/context-03-axes.md) |
| 2 | T03-C-3 | Audit | Fix DEFAULTS_V0 perspective/branch — `{ kind: 'default' }` not strings | [context-03](critical/context-03-axes.md) |
| 3 | T03-C-4 | Audit | Wire constValueMatchesPayload() into IR builder | [context-03](critical/context-03-axes.md) |
| 4 | T02-C-4 | Audit | Fix payloadStride() return type and values | [context-02](critical/context-02-type-system.md) |
| 5 | Q1 | Resolution | Delete AxisTag<T> alias from bridges.ts | [RESOLUTIONS](RESOLUTIONS.md) |
| 6 | Q7 | Resolution | Remove stride field from ConcretePayloadType; delete strideOf() | [RESOLUTIONS](RESOLUTIONS.md) |
| 7 | Q6 | Resolution | Remove shape from PayloadType; reclassify as resource | [RESOLUTIONS](RESOLUTIONS.md) |
| 8 | Q8 | Resolution | Change cameraProjection ConstValue to closed CameraProjection enum | [RESOLUTIONS](RESOLUTIONS.md) |
| 9 | Q3 | Resolution | Add tryDeriveKind() returning DerivedKind \| null | [RESOLUTIONS](RESOLUTIONS.md) |
| 10 | Q10 | Resolution | Lock eventRead output type in builder (no caller arg) | [RESOLUTIONS](RESOLUTIONS.md) |
| 11 | Q11 | Resolution | Rename AxisViolation to use nodeKind + nodeIndex | [RESOLUTIONS](RESOLUTIONS.md) |
| 12 | Q4/Q5 | Resolution | Add deriveKind agreement assert at lowering + debug boundaries | [RESOLUTIONS](RESOLUTIONS.md) |
| 13 | Q13 | Resolution | Add Vitest CI gate test for forbidden patterns | [RESOLUTIONS](RESOLUTIONS.md) |

### P2: Critical — Has Dependencies

| # | Item | Source | Blocked By | Context |
|---|------|--------|------------|---------|
| 14 | T03-C-1 | Audit | Decision made: handle zero in deriveKind | [context-03](critical/context-03-axes.md) |
| 15 | T01/T03/T04-C | Audit | #14 (deriveKind zero) | [context-04](critical/context-04-validation.md) |
| 16 | Q2 | Resolution | #7 (stride removal) — split InferencePayloadType / PayloadType / InferenceCanonicalType | [RESOLUTIONS](RESOLUTIONS.md) |
| 17 | Q9 | Resolution | #15 (validation gate) — structured BindingMismatchError | [RESOLUTIONS](RESOLUTIONS.md) |
| 18 | T05a-C-1 | Audit | Large refactor — UnitType flat→structured (57+ files) | [context-05a](critical/context-05a-unit-restructure.md) |
| 19 | T05a-C-2 | Audit | Part of #18 — collapse degrees/deg | [context-05a](critical/context-05a-unit-restructure.md) |
| 20 | T04-C-3 | Audit | #15 — AxisInvalid diagnostic category | [context-04](critical/context-04-validation.md) |

### P3: To-Review — User Must Decide

**ALL RESOLVED.** See [RESOLUTIONS.md](RESOLUTIONS.md).

### P4: Unimplemented — Blocks Higher Priority

| # | Item | Topic | Unblocks | Context |
|---|------|-------|----------|---------|
| 21 | T03-U-2 | Axes | Axis var escape check — supports validation gate (#15) | [context-03](unimplemented/context-03-axes.md) |
| 22 | T02-U-1 | Type System | canonicalConst() — supports zero-cardinality (#14) | [context-02](unimplemented/context-02-type-system.md) |

### P5: Unimplemented — Standalone (after P1-P4 resolved)

| # | Item | Topic | Description | Context |
|---|------|-------|-------------|---------|
| 23 | T05b-U-1 | Migration | Unify SigExpr/FieldExpr/EventExpr into ValueExpr (24→6 variants) | [context-05b](unimplemented/context-05b-valueexpr.md) |
| 24 | T05b-U-2 | Migration | Align expression discriminant kind values with spec | [context-05b](unimplemented/context-05b-valueexpr.md) |
| 25 | T05b-U-3 | Migration | Remove instanceId from FieldExprIntrinsic/Placement/StateRead | [context-05b](unimplemented/context-05b-valueexpr.md) |
| 26 | T05c-U-1 | Migration | Add branded IDs to AdapterSpec | [context-05c](unimplemented/context-05c-adapter-restructure.md) |
| 27 | T05c-U-2 | Migration | Per-axis ExtentPattern for adapter matching | [context-05c](unimplemented/context-05c-adapter-restructure.md) |
| 28 | T03-U-1 | Axes | Zero-cardinality lift operations | [context-03](unimplemented/context-03-axes.md) |
| 29 | T02-U-2 | Type System | Verify ValueExprConst shape | [context-02](unimplemented/context-02-type-system.md) |
| 30 | T03-U-3 | Axes | Runtime state keying by branch (v1+ scope) | [context-03](unimplemented/context-03-axes.md) |
| 31 | T03-U-4 | Axes | Perspective/branch v1+ values (v1+ scope) | [context-03](unimplemented/context-03-axes.md) |

### Trivial (cosmetic, no action unless cleanup pass)

- 3 items in [trivial/topic-01-principles.md](trivial/topic-01-principles.md)
- 1 item in [trivial/topic-03-axes.md](trivial/topic-03-axes.md)
- 4 items in [trivial/topic-04-05-naming.md](trivial/topic-04-05-naming.md)

## Dependency Graph

```
── P1 (no deps) ──────────────────────────────────────────────────
#1  Fix broken tests
#2  Fix DEFAULTS_V0
#3  Wire constValueMatchesPayload
#4  Fix payloadStride
#5  Delete AxisTag alias
#6  Remove stride from payload
#7  Remove shape from PayloadType
#8  cameraProjection → closed enum
#9  Add tryDeriveKind()
#10 Lock eventRead output type
#11 Rename AxisViolation fields
#12 Add deriveKind agreement asserts
#13 Add CI forbidden-pattern test

── P2 (has deps) ─────────────────────────────────────────────────
#14 deriveKind zero handling ──blocks──> #15 validation gate wiring
#15 validation gate ──blocks──> #17 BindingMismatchError, #20 AxisInvalid diagnostics
#16 Split InferencePayloadType ──after──> #6 stride removal, #7 shape removal
#18 UnitType restructure ──blocks──> #19 deg/degrees collapse, P5 adapter work
#20 AxisInvalid diagnostic ──after──> #15

── P4 (supports P2) ─────────────────────────────────────────────
#21 Axis var escape check ──supports──> #15
#22 canonicalConst() ──supports──> #14

── P5 (standalone) ───────────────────────────────────────────────
#23-25 ValueExpr unification (largest item)
#26-27 Adapter restructure ──after──> #18
#28 Zero-cardinality lifts
#29 Verify ValueExprConst
#30-31 v1+ scope (deferred)
```

## Cross-Cutting Concerns

1. **P1 is now 13 items**: The resolutions converted 9 design questions into concrete P1 work (delete AxisTag, remove stride/shape, lock eventRead, add CI gates, etc.). These are all independent with no blockers.

2. **Validation gate (#15) is the systemic linchpin**: Still depends on deriveKind zero handling (#14). Once wired, it catches many other issues. Now also blocks structured binding diagnostics (#17) and AxisInvalid category (#20).

3. **Type split (#16) is new foundational work**: InferencePayloadType / InferenceCanonicalType separation is a clean architectural boundary. Should be done after stride/shape cleanup (#6, #7) to avoid rework.

4. **UnitType restructure (#18) remains the largest migration**: 57+ files. Blocks adapter work downstream. Should be its own sprint.

5. **v1+ items safely deferred**: #30, #31.

## What IS Working Well

- CanonicalType triple structure (payload, unit, extent)
- Axis<T,V> polymorphic pattern with var/inst
- 5-axis Extent with all required axes
- deriveKind() priority logic (discrete > many > signal)
- Instance helpers (tryGetManyInstance, requireManyInstance)
- ConstValue discriminated union with constValueMatchesPayload() defined
- Canonical constructors (canonicalSignal, canonicalField, canonicalEventOne, canonicalEventField)
- Old parallel type systems removed (SignalType, ResolvedExtent, etc.)
- unitVar() throws (removed per resolution D5)
- No axis var escaping to backend/runtime (verified)
- Adapter rules have purity/stability fields
- Binding unification uses equality (no lattice)

## Files Index

| Category | File |
|----------|------|
| **SUMMARY** | `SUMMARY.md` |
| **RESOLUTIONS** | `RESOLUTIONS.md` |
| **Critical** | |
| Topic 01 | `critical/topic-01-principles.md`, `critical/context-01-principles.md` |
| Topic 02 | `critical/topic-02-type-system.md`, `critical/context-02-type-system.md` |
| Topic 03 | `critical/topic-03-axes.md`, `critical/context-03-axes.md` |
| Topic 04 | `critical/topic-04-validation.md`, `critical/context-04-validation.md` |
| Topic 05a | `critical/topic-05-migration-unit-restructure.md`, `critical/context-05a-unit-restructure.md` |
| **To-Review (all resolved)** | |
| Topic 02 | `to-review/topic-02-type-system.md`, `to-review/context-02-type-system.md` |
| Topic 03 | `to-review/topic-03-axes.md`, `to-review/context-03-axes.md` |
| Topic 05d | `to-review/topic-05-migration-done-checklist.md`, `to-review/context-05d-done-checklist.md` |
| **Unimplemented** | |
| Topic 02 | `unimplemented/topic-02-type-system.md`, `unimplemented/context-02-type-system.md` |
| Topic 03 | `unimplemented/topic-03-axes.md`, `unimplemented/context-03-axes.md` |
| Topic 05b | `unimplemented/topic-05-migration-valueexpr.md`, `unimplemented/context-05b-valueexpr.md` |
| Topic 05c | `unimplemented/topic-05-migration-adapter-restructure.md`, `unimplemented/context-05c-adapter-restructure.md` |
| **Trivial** | |
| Topic 01 | `trivial/topic-01-principles.md` |
| Topic 03 | `trivial/topic-03-axes.md` |
| Topics 04-05 | `trivial/topic-04-05-naming.md` |
