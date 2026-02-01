---
scope: full
spec_source: design-docs/canonical-types/
impl_source: src/
generated: 2026-01-29
updated: 2026-02-01T15:00:00Z
previous_run: 2026-01-29T18:00:00Z
topics_audited: 5 (core types, IR/exprs, runtime/enforcement, compiler/adapters, naming/legacy)
totals: { trivial: 12, critical: 5, to-review: 13, unimplemented: 7 }
---

# Gap Analysis: CanonicalType System Spec vs Implementation

## UPDATE: 2026-02-01T15:00

All sprint plans finalized. Unknowns resolved. Plans 1-3 are READY FOR IMPLEMENTATION.

## Sprint Plan Status

| Sprint | Status | Confidence | Files |
|--------|--------|-----------|-------|
| 1: Purity & Authority Hardening | **READY FOR IMPLEMENTATION** | HIGH: 4, MED: 1 | PLAN, DOD, CONTEXT |
| 2: Frontend Solver Completeness | **READY FOR IMPLEMENTATION** | HIGH: 3, MED: 0 | PLAN, DOD, CONTEXT |
| 3: Step Format Unification | **READY FOR IMPLEMENTATION** | HIGH: 2, MED: 0 | PLAN, DOD, CONTEXT |
| 4: Runtime Semantic Upgrades | **DEFERRED** (research required) | LOW: 3 | PLAN, DOD, CONTEXT |

### Key Decisions Made (since 14:00)
- **Cardinality inference**: Uses existing `Axis<CardinalityValue, CardinalityVarId>` infrastructure. No new types needed in `canonical-types.ts`. New union-find solver in `solve-cardinality.ts`.
- **Constraint templates**: Derived from existing `BlockCardinalityMetadata` on `BlockDef`. No changes to block definitions.
- **Slot types**: Keep `ValueSlot` and `EventSlotId` separate (different storage backends). Use discriminated union `EvalTarget` in unified step.
- **StepMaterialize**: Remains separate from unified `StepEvalValue` (different fields, different semantics).
- **EvalStrategy**: `const enum` for hot-loop performance, pre-resolved at compile time.

## Executive Summary

The type system refactor has made **major progress** since the last analysis. The core type definitions, IR expression system, and naming/legacy cleanup are **essentially complete**. The remaining work is concentrated in two areas: (1) **compiler/adapter layer** where `isTypeCompatible` violates purity, and (2) **runtime layer** where schedule steps and storage keying don't yet align with the spec's type-driven dispatch model.

### Overall Status by Layer

| Layer | Status | Grade |
|-------|--------|-------|
| Core Types (CanonicalType, axes, payload, unit) | Production Ready | A+ |
| IR Expressions (ValueExpr, ConstValue, IRBuilder) | Fully Compliant | A+ |
| Naming & Legacy Cleanup | Complete | A+ |
| Compiler Passes & Adapters | Mostly Compliant (1 critical violation) | B+ |
| Runtime & Enforcement | Solid Foundation (architectural gaps) | B |

## Resolved Since Last Run

Many items from the previous analysis have been completed:

| Previous Item | Status | Notes |
|---------------|--------|-------|
| P1 #1-13 (13 independent fixes) | DONE | Tests fixed, DEFAULTS_V0 fixed, constValueMatchesPayload wired, etc. |
| P5 #23-25 (ValueExpr unification) | DONE | SigExpr/FieldExpr/EventExpr deleted, unified ValueExpr with 10 kinds |
| P5 #25 (Remove instanceId from field exprs) | DONE | Instance identity in type.extent.cardinality only |
| Legacy type elimination | DONE | 0 hits for banned symbols, 29 enforcement tests passing |
| deriveKind deletion | DONE | Replaced with direct extent checks (requireInst pattern) |
| Axis validation gate | DONE | axis-validate.ts is single enforcement point |
| Inference type separation | DONE | InferencePayloadType / InferenceCanonicalType in inference-types.ts |

## Priority Work Queue

### P1: Critical -- No Dependencies

| # | Item | Source | Description | Detail File |
|---|------|--------|-------------|-------------|
| 1 | isTypeCompatible purity | Compiler audit | Remove sourceBlockType/targetBlockType params; type compat must be pure function of CanonicalType only | [critical/topic-compiler-adapters.md](critical/topic-compiler-adapters.md) |
| 2 | Backend type rewriting | Compiler audit | Backend (lower-blocks.ts:415-428) rewrites types with inferred instance IDs; violates read-only contract | [critical/topic-compiler-adapters-CONTEXT.md](critical/topic-compiler-adapters-CONTEXT.md) |

### P2: Critical -- Has Dependencies

| # | Item | Blocked By | Description | Detail File |
|---|------|------------|-------------|-------------|
| 3 | Schedule step unification | Decision on approach | Replace evalSig/evalEvent hard-coded kinds with type-driven dispatch | [critical/topic-runtime-enforcement.md](critical/topic-runtime-enforcement.md) |
| 4 | Branch-scoped state | #3 + branch axis v1+ | Runtime state storage not keyed by branch; flat Float64Array | [unimplemented/topic-runtime-enforcement.md](unimplemented/topic-runtime-enforcement.md) |
| 5 | Lane identity tracking | #3 | Field state writes use implicit offset math without explicit metadata | [critical/topic-runtime-enforcement.md](critical/topic-runtime-enforcement.md) |

### P3: To-Review -- User Must Decide

| # | Item | Topic | Question | Detail File |
|---|------|-------|----------|-------------|
| 6 | Cardinality polymorphism | Compiler | Type variables vs runtime dispatch for cardinality-generic blocks? | [to-review/topic-compiler-adapters.md](to-review/topic-compiler-adapters.md) |
| 7 | Instance resolution location | Compiler | Frontend type solver vs backend lowering? | [to-review/topic-compiler-adapters.md](to-review/topic-compiler-adapters.md) |
| 8 | Adapter auto-insertion | Compiler | Keep as permanent feature or make user-driven? | [to-review/topic-compiler-adapters.md](to-review/topic-compiler-adapters.md) |
| 9 | ValueSlot vs (ValueExprId, lane) | Runtime | Is opaque slot abstraction sufficient or need explicit keying? | [to-review/topic-runtime-enforcement.md](to-review/topic-runtime-enforcement.md) |
| 10 | defaultUnitForPayload usage | Runtime | Ergonomic construction OK or must eliminate entirely? | [to-review/topic-runtime-enforcement.md](to-review/topic-runtime-enforcement.md) |
| 11 | Event stamp buffers | Runtime | Required by spec or deferrable? | [to-review/topic-runtime-enforcement.md](to-review/topic-runtime-enforcement.md) |
| 12 | Extended UnitType (count/space/color) | Core types | Keep implementation extensions or align with minimal spec? | [to-review/topic-core-types.md](to-review/topic-core-types.md) |
| 13 | Generic 'specific' pattern | Core types | Named perspective/branch variants vs generic InstanceRef pattern? | [to-review/topic-core-types.md](to-review/topic-core-types.md) |

### P4: Unimplemented -- Blocks Higher Priority

| # | Item | Unblocks | Description | Detail File |
|---|------|----------|-------------|-------------|
| 14 | Stamp buffers for discrete temporality | #11 review | Missing valueStamp[ValueExprId, lane] tracking | [unimplemented/topic-runtime-enforcement.md](unimplemented/topic-runtime-enforcement.md) |

### P5: Unimplemented -- Standalone

| # | Item | Description | Detail File |
|---|------|-------------|-------------|
| 15 | Perspective axis full values (v1+) | world/view/screen instead of default/specific | [unimplemented/topic-core-types.md](unimplemented/topic-core-types.md) |
| 16 | Branch axis full values (v1+) | main/preview/checkpoint/etc instead of default/specific | [unimplemented/topic-core-types.md](unimplemented/topic-core-types.md) |
| 17 | Unified evaluateValue() dispatch | Replace separate signal/field/event evaluators | [unimplemented/topic-runtime-enforcement.md](unimplemented/topic-runtime-enforcement.md) |
| 18 | Explicit lane metadata | Track (ValueExprId, instanceId, lane) -> slot mapping | [unimplemented/topic-runtime-enforcement.md](unimplemented/topic-runtime-enforcement.md) |
| 19 | AdapterSpec branded IDs | From previous analysis -- add branded IDs | [unimplemented/topic-05-migration-adapter-restructure.md](unimplemented/topic-05-migration-adapter-restructure.md) |

### Trivial (cosmetic)

- 2 items: [trivial/topic-core-types.md](trivial/topic-core-types.md) (canonicalEvent naming, deriveKind deletion)
- 2 items: [trivial/topic-naming-legacy.md](trivial/topic-naming-legacy.md) (backup files, ExpressionCompileError naming)
- 3 items: [trivial/topic-ir-exprs.md -- N/A, covered in to-review] (sub-variant discriminants, step kinds)
- 10 items: [trivial/topic-compiler-adapters.md](trivial/topic-compiler-adapters.md) (documentation/comment fixes)
- Previous trivial items: [trivial/topic-01-principles.md](trivial/topic-01-principles.md), [trivial/topic-03-axes.md](trivial/topic-03-axes.md), [trivial/topic-04-05-naming.md](trivial/topic-04-05-naming.md)

## Dependency Graph

```
── P1 (no deps) ──────────────────────────────────────────────────
#1  Fix isTypeCompatible purity (remove block-name params)
#2  Fix backend type rewriting (move instance resolution to frontend)

── P2 (has deps) ─────────────────────────────────────────────────
#3  Unify schedule step dispatch ──depends on──> decision #6
#4  Branch-scoped state ──depends on──> #3, v1+ branch axis
#5  Lane identity tracking ──depends on──> #3

── P3 (user decisions) ───────────────────────────────────────────
#6  Cardinality polymorphism strategy ──informs──> #1, #3
#7  Instance resolution location ──informs──> #2
#8  Adapter auto-insertion permanence ──informs──> documentation
#9  ValueSlot sufficiency ──informs──> #18
#10 defaultUnitForPayload intent ──informs──> spec update
#11 Event stamp requirement ──informs──> #14
#12 Extended UnitType ──informs──> spec update
#13 Generic 'specific' pattern ──informs──> #15, #16

── P5 (standalone) ───────────────────────────────────────────────
#15-16 v1+ axis values (deferred)
#17 Unified evaluateValue
#18 Explicit lane metadata
#19 AdapterSpec branded IDs
```

## What IS Working Well

- CanonicalType = { payload, unit, extent } is single authority (A+)
- Unified ValueExpr IR with 10 kinds, all carrying CanonicalType (A+)
- 29 enforcement tests preventing regression (A+)
- Zero legacy types in production code (A+)
- Single axis-validation gate (axis-validate.ts) (A+)
- No Axis.var escaping to backend (A+)
- ConstValue discriminated union, payload-shaped (A+)
- Branded IDs throughout (InstanceId, ValueExprId, etc.) (A+)
- Clean inference/canonical type separation (A+)
- Adapter insertion as frontend normalization with explicit blocks (A)
- payloadStride() as single stride authority (A+)
- Direct extent checks replacing deriveKind (improvement over spec) (A+)

## Sprint Plan Files (finalized 2026-02-01T15:00)

| Sprint | PLAN | DOD | CONTEXT |
|--------|------|-----|---------|
| 1: Purity & Authority | [PLAN](SPRINT-20260201-140000-purity-authority-PLAN.md) | [DOD](SPRINT-20260201-140000-purity-authority-DOD.md) | [CONTEXT](SPRINT-20260201-140000-purity-authority-CONTEXT.md) |
| 2: Frontend Solver | [PLAN](SPRINT-20260201-140000-frontend-solver-PLAN.md) | [DOD](SPRINT-20260201-140000-frontend-solver-DOD.md) | [CONTEXT](SPRINT-20260201-140000-frontend-solver-CONTEXT.md) |
| 3: Step Format | [PLAN](SPRINT-20260201-140000-step-format-PLAN.md) | [DOD](SPRINT-20260201-140000-step-format-DOD.md) | [CONTEXT](SPRINT-20260201-140000-step-format-CONTEXT.md) |
| 4: Runtime Semantics | [PLAN](SPRINT-20260201-140000-runtime-semantics-PLAN.md) | [DOD](SPRINT-20260201-140000-runtime-semantics-DOD.md) | [CONTEXT](SPRINT-20260201-140000-runtime-semantics-CONTEXT.md) |

### Superseded Plans (12 files)
All `SPRINT-20260201-120000-*` files marked SUPERSEDED in their headers:
- `SPRINT-20260201-120000-housekeeping-*` → Sprint 1
- `SPRINT-20260201-120000-type-compat-purity-*` → Sprint 1 + Sprint 2
- `SPRINT-20260201-120000-frontend-instance-*` → Sprint 2
- `SPRINT-20260201-120000-step-unification-*` → Sprint 3

## Audit Files (2026-02-01)

| Category | File | Topic |
|----------|------|-------|
| Summary | CORE-TYPES-AUDIT-SUMMARY.md | Core types audit executive summary |
| Summary | IR-AUDIT-SUMMARY-20260201.md | IR expression system audit |
| Summary | RUNTIME-ENFORCEMENT-AUDIT.md | Runtime & enforcement audit |
| Summary | COMPILER-ADAPTERS-AUDIT.md | Compiler passes & adapters audit |
| Summary | NAMING-LEGACY-SUMMARY.md | Naming conventions & legacy cleanup |
| Critical | critical/topic-core-types.md | No critical gaps in core types |
| Critical | critical/topic-compiler-adapters.md | isTypeCompatible purity violation |
| Critical | critical/topic-compiler-adapters-CONTEXT.md | Fix strategies |
| Critical | critical/topic-runtime-enforcement.md | Schedule steps, branch scoping |
| Critical | critical/context-runtime-enforcement.md | Runtime enforcement context |
| To-Review | to-review/topic-core-types.md | Extended units, generic pattern |
| To-Review | to-review/topic-compiler-adapters.md | Cardinality polymorphism, instance resolution |
| To-Review | to-review/topic-ir-exprs.md | Discriminant naming |
| To-Review | to-review/topic-runtime-enforcement.md | ValueSlot, defaultUnit, stamps |
| To-Review | to-review/topic-naming-legacy.md | Debug discriminants, comments |
| Unimplemented | unimplemented/topic-core-types.md | v1+ perspective/branch |
| Unimplemented | unimplemented/topic-runtime-enforcement.md | Stamps, lane metadata, unified dispatch |
| Trivial | trivial/topic-core-types.md | Naming differences |
| Trivial | trivial/topic-naming-legacy.md | Backup files, ExpressionCompileError |
| Trivial | trivial/topic-compiler-adapters.md | Documentation fixes |
| Compliant | topic-ir-exprs-COMPLIANT.md | Full IR compliance report |
