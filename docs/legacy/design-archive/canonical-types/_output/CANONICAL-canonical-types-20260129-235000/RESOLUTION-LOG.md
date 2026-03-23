---
parent: INDEX.md
---

# Resolution Log

> Record of key decisions made during canonicalization.
> If you're wondering "why is it this way?", check here.

---

## Decision Summary

| ID | Decision | Resolution | Category |
|----|----------|------------|----------|
| C1 | Axis representation | `Axis<T,V>` var/inst (spec wins) | Critical Contradiction |
| C2 | UnitType structure | 8 structured kinds, no var | Critical Contradiction |
| C3 | Instance helpers | try/require split | Critical Contradiction |
| A1 | ValueExpr discriminant | `kind` (not `op`) | High-Impact Ambiguity |
| A2 | Adapter restructure | Full TypePattern/ExtentPattern | High-Impact Ambiguity |
| A3 | Evaluation accuracy | 20% assessment correct | High-Impact Ambiguity |
| A4 | Referent removal | Moves to continuity/StateOp args | High-Impact Ambiguity |
| G1 | Perspective/Branch domains | Include full domains, mark v1+ | Gap |
| G2 | ValueExpr variant mapping | Total 24→6 mapping, no new variants | Gap |
| N1 | Guardrail #11 example | Updated to `kind` | New Contradiction |
| T1 | Instance helper naming | tryGetManyInstance + requireManyInstance | Terminology |
| T2 | Axis discriminant names | var/inst (not default/instantiated) | Terminology |
| L1 | Spec getManyInstance | Updated to match planning | Low-Impact |
| L2 | UnitType count kind | Added to canonical spec | Low-Impact |
| Q1 | CardinalityValue.zero | Compile-time-only, explicit lift | Editorial Review |
| Q2 | BindingValue ordering | NOT a lattice, nominal tags | Editorial Review |
| N4 | Constructor unit asymmetry | Signal defaults, field explicit | Editorial Review |
| N5 | EventRead output type | Float scalar 0/1 gating | Editorial Review |
| GQ1 | AxisTag alias deletion | Delete from bridges.ts | Gap Analysis |
| GQ2 | Inference type split | InferencePayloadType, InferenceCanonicalType | Gap Analysis |
| GQ3 | tryDeriveKind | Partial helper for inference paths | Gap Analysis |
| GQ4/5 | Kind tag agreement | Assert tag === deriveKind(type) at boundaries | Gap Analysis |
| GQ6 | Shape payload removal | Confirmed: shape is resource, not payload | Gap Analysis (overlap) |
| GQ7 | Stride removal | Confirmed: derived only, never stored | Gap Analysis (overlap) |
| GQ8 | CameraProjection enum | Closed string enum, not matrix | Gap Analysis |
| GQ9 | BindingMismatchError | Structured binding diagnostic | Gap Analysis |
| GQ10 | eventRead type locked | Builder enforces, no caller arg | Gap Analysis |
| GQ11 | AxisViolation fields | nodeKind + nodeIndex (generic) | Gap Analysis |
| GQ12/13 | CI forbidden patterns | Vitest gate test required | Gap Analysis |

---

## Detailed Decisions

### C1: Axis Representation

**Category**: Critical Contradiction

**The Problem**: Spec defined `Axis<T, V>` with type variables for inference. Implementation used `AxisTag<T>` with default/instantiated (no variables). Structurally incompatible — `default` has no data, `var` carries a variable ID.

**Options Considered**:
1. **Adopt spec (`Axis<T, V>`)**: Supports type inference and unification
2. **Keep implementation (`AxisTag<T>`)**: Simpler but cannot support type variables

**Resolution**: Option 1 — Adopt `Axis<T, V>` from spec

**Rationale**: Without type variables, the system cannot track "these two unknown cardinalities must unify to the same value." Type inference requires the var branch.

**Implications**: Implementation must be rewritten. All axis construction and pattern matching changes.

### C2: UnitType Structure

**Category**: Critical Contradiction

**The Problem**: Three different UnitType shapes existed — spec (5 flat kinds), planning (8 structured kinds), implementation (16 flat kinds + var).

**Resolution**: 8 structured kinds from planning. No var in canonical type.

**Rationale**: Structured nesting enables family-level matching (all angles, all spaces). Var removal separates inference machinery from canonical type data.

### C3: Instance Extraction API

**Category**: Critical Contradiction

**The Problem**: Spec defined `getManyInstance` (one function). Planning locked `tryGetManyInstance` + `requireManyInstance` (two functions). The spec's single function was ambiguous about failure handling.

**Resolution**: Two functions (try/require split). `getManyInstance` deprecated.

**Rationale**: 30+ call sites shouldn't have to "remember" whether to check null or expect a throw. Make the contract explicit in the name.

### A1: ValueExpr Discriminant

**Category**: High-Impact Ambiguity

**The Problem**: Spec used `op` as discriminant. All existing IR unions use `kind`.

**Resolution**: Use `kind` for consistency.

**Rationale**: One project-wide discriminant convention reduces cognitive load and enables generic utilities.

### G2: ValueExpr Variant Mapping

**Category**: Gap

**The Problem**: 24 legacy variants needed to map to 6 ValueExpr ops. 11 were unmapped.

**Resolution**: Total deterministic mapping. All 24 legacy variants map to existing 6 ops. No new variants needed. Key insight: `EventExprNever` is just `ValueExprConst(false)` with event type.

**Rationale**: The 6 ops are sufficient. Diversity in computation is expressed through different kernelIds, not different ValueExpr variants.

### Q1: CardinalityValue.zero

**Category**: Editorial Review Question

**The Problem**: What does `zero` actually mean? Was it vestigial or real?

**Resolution**: Compile-time-only value class. No runtime lanes. Must be lifted via explicit ops.

**Rationale**: Distinguishes "known at compile time" (zero) from "one value per frame" (one). Prevents static/scalar confusion.

### Q2: BindingValue Ordering

**Category**: Editorial Review Question

**The Problem**: Docs sometimes described binding as a "lattice." Code used equality only.

**Resolution**: NOT a lattice. Nominal tags with equality-only semantics.

**Rationale**: The code is right. "Stronger/weaker" language invites ordering logic that doesn't exist. Tags constrain what ops are allowed, enforced at consumption sites.

### N4: Constructor Unit Asymmetry

**Category**: Editorial Review Refinement

**Resolution**: `canonicalSignal` defaults unit to scalar (convenience). `canonicalField` requires explicit unit (domain-attached values need explicit semantics). Default is constructor convenience only, never inference fallback.

### N5: EventRead Output Type

**Category**: Editorial Review Refinement

**Resolution**: `SigExprEventRead` → `ValueExprKernel(eventReadScalar01)` producing `canonicalSignal(float, scalar)`. Output is continuous float 0.0/1.0, not discrete bool.

---

## Update 2026-01-29: Gap Analysis Resolutions

These resolutions were made during the gap analysis of the CanonicalType system implementation against the canonical specification. All 12 design questions were resolved by the user.

### GQ1: AxisTag Alias Deletion

**Category**: Gap Analysis Resolution (was Q1)
**Resolution**: Delete `AxisTag<T>` alias from bridges.ts. Canonical already deprecated it; this makes deletion mandatory.

### GQ2: InferencePayloadType / InferenceCanonicalType Split

**Category**: Gap Analysis Resolution (was Q2)
**Resolution**: Define `InferencePayloadType = PayloadType | { kind: 'var'; var: PayloadVarId }`, `InferenceUnitType = UnitType | { kind: 'var'; var: UnitVarId }`, and `InferenceCanonicalType`. Only frontend/type solver may use inference forms. Backend uses `CanonicalType` only.
**Impact**: New topic file `type-system/t2_inference-types.md` created.

### GQ3: tryDeriveKind

**Category**: Gap Analysis Resolution (was Q3)
**Resolution**: Add `tryDeriveKind(t): DerivedKind | null`. Returns null when axes are var. Spec wording updated to "total over fully instantiated types." UI/inference paths MUST use `tryDeriveKind`; backend MUST use strict `deriveKind`.

### GQ4/GQ5: Kind Tag Agreement Assertion

**Category**: Gap Analysis Resolution (was Q4/Q5)
**Resolution**: Discriminant tags allowed for TS narrowing and typeless variants. When a variant has `.type`, the tag MUST agree with `deriveKind(type)` at construction/validation time. Assert added at lowering/debug boundaries.

### GQ6: Shape Payload Removal

**Category**: Gap Analysis Resolution (was Q6) — OVERLAP
**Resolution**: Shape is a resource, not a payload. Remove `{ kind: 'shape' }` from PayloadType. **Canonical already correct** — PayloadType never included shape in canonical spec. Implementation must also remove it.

### GQ7: Stride Removal

**Category**: Gap Analysis Resolution (was Q7) — OVERLAP
**Resolution**: Stride is derived only. Delete `stride` field from ConcretePayloadType variants. Delete `strideOf()` or redirect to `payloadStride()`. **Canonical already correct** — never specified stored stride.

### GQ8: CameraProjection Closed Enum

**Category**: Gap Analysis Resolution (was Q8)
**Resolution**: cameraProjection is a closed string enum (`'orthographic' | 'perspective' | ...`), NOT a 4x4 matrix. ConstValue updated to `{ kind: 'cameraProjection'; value: CameraProjection }`.
**Impact**: Updated `type-system/t3_const-value.md`.

### GQ9: BindingMismatchError

**Category**: Gap Analysis Resolution (was Q9)
**Resolution**: Replace generic AxisUnificationError for binding mismatches with structured `BindingMismatchError = { left: BindingValue; right: BindingValue; location: ...; remedy: string }`.
**Impact**: Added to `validation/t3_diagnostics.md`.

### GQ10: eventRead Output Type Locked

**Category**: Gap Analysis Resolution (was Q10)
**Resolution**: IR builder MUST NOT accept caller-provided type for eventRead. Builder sets `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })` internally. Axis validator additionally checks.
**Impact**: Updated `type-system/t2_derived-classifications.md`.

### GQ11: AxisViolation Field Naming

**Category**: Gap Analysis Resolution (was Q11)
**Resolution**: Standardize on `{ nodeKind, nodeIndex, message }` — generic naming, not expression-specific. Replaces `{ exprIndex, kind, message }`.
**Impact**: Updated `validation/t2_axis-validate.md`, `validation/t3_diagnostics.md`, GLOSSARY.

### GQ12/GQ13: CI Forbidden Pattern Gates

**Category**: Gap Analysis Resolution (was Q12/Q13)
**Resolution**: Add Vitest test that fails CI for forbidden patterns: AxisTag, payload var outside inference, UnitType var, legacy type names, instanceId fields. Small allowlist with expiration for migration directories.
**Impact**: Updated `migration/t3_definition-of-done.md`.

---

Approved: 2026-01-29T23:45:00Z by User (bulk approval — original)
Updated: 2026-01-29T18:00:00Z by User (gap analysis resolutions)
