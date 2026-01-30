# Open Questions & Ambiguities: CanonicalType System

Generated: 2026-01-29T22:53:09Z
Supersedes: CANONICALIZED-QUESTIONS-canonical-types-20260129-075723.md (which found 0 issues — only compared spec to itself)

## How to Resolve Items

This file is designed for iterative resolution. To resolve an item:

1. **Edit this file directly** - Change `Status: UNRESOLVED` to `Status: RESOLVED`
2. **Add your resolution** - Use one of these approaches:
   - `Resolution: AGREE` - Accept the suggested resolution as-is
   - `Resolution: AGREE, but [adjustment]` - Accept with minor modification
   - `Resolution: [your decision]` - Provide your own resolution
3. **Re-run the command** - The next run will carry forward your resolution

**Shorthand**: Writing just `AGREE` means you accept the **Suggested Resolution** exactly as written.

---

## Quick Wins

| # | Item | Recommendation | Status | Resolution |
|---|------|----------------|--------|------------|
| L1 | Spec uses `getManyInstance` but planning locks `tryGetManyInstance` + `requireManyInstance` | Update spec to match planning (LOCKED) | RESOLVED | AGREE |
| L2 | Spec omits `count` from UnitType; planning adds it | Add `{ kind: 'count' }` to canonical UnitType | RESOLVED | AGREE |

---

## Resolution Order

1. **Critical Contradictions** (C1–C3) — Structural disagreements between spec and planning
2. **High-Impact Ambiguities** (A1–A4) — Questionable changes that need decision
3. **Terminology/Naming** (T1–T2) — Naming inconsistencies
4. **Gaps** (G1–G2) — Missing content
5. **Low-Impact Items** (L1–L2) — Minor details

---

## 1. Critical Contradictions

*Resolve these first — they represent real disagreements between spec and latest planning*

### C1: Axis Representation — `Axis<T,V>` (var/inst) vs `AxisTag<T>` (default/instantiated)

- **Locations**:
  - Spec: `00-exhaustive-type-system.md:65-67`
  - Implementation: `src/core/canonical-types.ts:401-403`
  - Planning: `SPRINT-20260129-012028-core-types-PLAN.md:P0`
- **Source Quotes**:
  - From spec: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`
  - From implementation: `AxisTag<T> = { kind: 'default' } | { kind: 'instantiated'; value: T }`
  - From planning (EVALUATION-20260129): "Axis type system: Fundamentally wrong (no type variables)"
- **Conflict**: Two completely different representations of axis polymorphism.
  - Spec's `Axis<T,V>` supports **type variables** (`var: V`) for unification during inference. The `var` branch carries a typed variable ID.
  - Implementation's `AxisTag<T>` uses `default` (no variable, no value) vs `instantiated` (has value). No polymorphism support.
  - These are structurally incompatible — `default` has no data, `var` carries a variable ID.
- **Impact**: Breaks type inference and unification. Without type variables, you cannot track "these two unknown cardinalities must unify to the same value."
- **Resolution (CANONICAL)**: Adopt spec-style axis polymorphism.

  Canonical axis representation:
  - `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`

  Constraints:
  - `AxisTag<T>` (`default`/`instantiated`) is deprecated and must not be used in core type definitions.
  - Any "default" semantics must be expressed via constructors/helpers that return an `Axis<...>` value (never a third axis variant).

- **Encyclopedia Location**: `type-system/t1_canonical-type.md` (foundational)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### C2: UnitType Structure — Flat (16+ kinds) vs Nested (5-7 structured kinds)

- **Locations**:
  - Spec: `00-exhaustive-type-system.md:138-143` (5 kinds: none, scalar, norm01, angle, time)
  - Implementation: `src/core/canonical-types.ts:32-48` (16+ flat kinds + var)
  - Planning: `SPRINT-20260129-012400-unit-restructure-PLAN.md:P1` (7 structured kinds, LOCKED: no var)
- **Source Quotes**:
  - From spec: `UnitType = { kind: 'none' } | { kind: 'scalar' } | { kind: 'norm01' } | { kind: 'angle'; unit: ... } | { kind: 'time'; unit: ... }`
  - From planning (LOCKED): Adds `{ kind: 'count' }`, `{ kind: 'space'; space: 'ndc'|'world'|'view'; dims: 2|3 }`, `{ kind: 'color'; space: 'rgba01' }` — total 8 structured kinds
  - From implementation: 16 flat kinds including `ndc2`, `ndc3`, `world2`, `world3`, `rgba01`, `count`, `deg`, plus `{ kind: 'var'; id: string }`
- **Conflict**: Three different UnitType shapes.
  - Spec has 5 kinds (missing space/color/count).
  - Planning extends to 8 structured kinds (adds space, color, count; REMOVES var). **LOCKED: NO var in canonical type.**
  - Implementation has 16 flat kinds + var (completely different structure).
- **Impact**: Every adapter rule, every unit comparison, every type display is affected. Flattened kinds like `ndc2` become `{ kind: 'space', space: 'ndc', dims: 2 }`.
- **Resolution (CANONICAL)**: Use the planning's structured UnitType (8 kinds) and forbid unit variables inside `CanonicalType`.

  Canonical UnitType kinds:
  - `none`
  - `scalar`
  - `norm01`
  - `count`
  - `angle(radians|degrees|phase01)`
  - `time(ms|seconds)`
  - `space(ndc|world|view, dims:2|3)`
  - `color(rgba01)`

  Constraints:
  - No `{ kind: 'var' }` (or equivalent) is allowed inside canonical `UnitType`.
  - Unit variables (if needed) live only in inference-only wrappers.

- **Encyclopedia Location**: `type-system/t1_canonical-type.md` (foundational — UnitType is part of the core type)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### C3: Instance Extraction API — `getManyInstance` vs `tryGetManyInstance` + `requireManyInstance`

- **Locations**:
  - Spec: `00-exhaustive-type-system.md:230-246`
  - Planning: `SPRINT-20260129-012100-constructors-helpers-PLAN.md:P5` (LOCKED)
  - Earlier planning: `SPRINT-2026-01-28-192541-authority-consolidation-PLAN.md:P0` (also converged on two helpers)
- **Source Quotes**:
  - From spec (00-exhaustive lines 241-246): `getManyInstance(t: CanonicalType): InstanceRef | null` — single function
  - From spec (15-FiveAxesTypeSystem line 168): `getManyInstance(type) -> InstanceRef | null` — single function
  - From planning (LOCKED): "Do not pick a single behavior (null vs throw) for one function and force 30+ call sites to 'remember the rule.' Make the contract explicit in the API." — `tryGetManyInstance` (returns null) + `requireManyInstance` (throws) + "NO single getManyInstance function (avoid ambiguity)"
- **Conflict**: Spec defines one function; planning LOCKS two functions and explicitly forbids the spec's name.
  - The spec's `getManyInstance` is ambiguous about caller obligations: does the caller check null? Crash? The planning resolves this by splitting into try/require.
  - The earlier planning (`canonical-type`) also identified this as a "CRITICAL AMBIGUITY" and converged on the same answer.
- **Impact**: 30+ call sites. API surface of a core type helper.
- **Resolution (CANONICAL)**: Replace `getManyInstance` with two explicit helpers.

  - `tryGetManyInstance(t): InstanceRef | null` (never throws)
  - `requireManyInstance(t): InstanceRef` (throws crisp error)

  Constraint:
  - `getManyInstance` is deprecated; do not keep it as an alias.

- **Encyclopedia Location**: `type-system/t2_derived-classifications.md` (structural — helper functions)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

## 2. High-Impact Ambiguities

*Questionable changes that need explicit decision*

### A1: ValueExpr Discriminant — `op` vs `kind`

- **Location**: `SPRINT-20260129-012200-value-expr-PLAN.md:P0` vs all existing IR types
- **Source Quote**: From planning: `ValueExprConst { readonly op: 'const'; ... }` — uses `op` as discriminant
- **Description**: The spec and planning use `op` as the discriminant for ValueExpr variants. ALL existing IR types (SigExpr, FieldExpr, EventExpr, Step, etc.) use `kind` as the discriminant. This introduces an inconsistency in the IR type system.
- **Questions to Resolve**:
  - Should ValueExpr use `kind` for consistency with all other IR types?
  - Or should it use `op` to distinguish it from the legacy types it replaces?
  - If `op`, does this signal that ValueExpr is intentionally different (e.g., operation-oriented vs type-oriented)?
- **Architectural Context**: The naming convention spec (09-NamingConvention.md) establishes `<UnionName><Op>` for variant names but doesn't specify the discriminant field name. TypeScript discriminated unions work with any field name.
- **Resolution (CANONICAL)**: Use `kind` as the discriminant for ValueExpr variants.

  Constraint:
  - All IR discriminated unions use `kind` (SigExpr/FieldExpr/EventExpr/Step/etc.). ValueExpr must match.

- **Encyclopedia Location**: `migration/t2_value-expr.md`
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### A2: Adapter Spec Restructure — Scope and Structure

- **Location**: `SPRINT-20260129-012500-adapter-spec-PLAN.md` vs `src/graph/adapters.ts`
- **Source Quote**: From planning (LOCKED): "Adapter matching operates purely on CanonicalType patterns" with `purity: 'pure'` and `stability: 'stable'` as mandatory fields
- **Description**: Planning proposes:
  - Move from `TypeSignature` (flattened cardinality/temporality) to `TypePattern` (extent-aware)
  - Add `ExtentPattern` and `ExtentTransform` types
  - Add mandatory `purity` and `stability` fields to `AdapterSpec`
  - Move file from `src/graph/adapters.ts` to `src/blocks/adapter-spec.ts`

  The extent-aware matching is logically necessary (adapters need to match on 5 axes, not 2). But the full restructure has MEDIUM confidence in the planning docs.
- **Questions to Resolve**:
  - Is the full restructure needed now, or can we do TypePattern first and add purity/stability later?
  - Should adapter specs live in `blocks/` or `graph/`?
  - Are `purity: 'pure'` and `stability: 'stable'` meaningful constraints if ALL adapters are pure+stable by definition?
- **Architectural Context**: Adapters are currently working. The restructure adds type safety but is not blocking other migration work.
- **Suggested Resolution**: Phase the restructure:
  1. **Now**: Update `TypeSignature` to use `Extent` instead of flattened cardinality/temporality (aligns with axis system)
  2. **Later**: Add purity/stability fields, move file location, full AdapterSpec restructure

  This gets the type safety benefit without the full scope risk.
- **Encyclopedia Location**: `migration/t2_value-expr.md` or new `adapters/` topic
- **Status**: UNRESOLVED
- **Resolution**:

---

### A3: Evaluation Severity Disagreement — 60% vs 20% Complete

- **Location**:
  - `.agent_planning/canonical-type/EVALUATION-2026-01-28-191553.md`: "Overall: 60% complete"
  - `.agent_planning/canonical-type-system/EVALUATION-20260129-012028.md`: "~20% aligned... previous gap analysis was catastrophically wrong"
- **Source Quotes**:
  - Earlier (canonical-type): "Infrastructure is solid ✅. Foundation: Strong ✅. Integration: Missing ❌"
  - Later (canonical-type-system): "The previous gap analysis was catastrophically wrong, claiming 10 items done when most were superficially present but architecturally incorrect."
- **Description**: Two evaluations of the same codebase produced wildly different assessments. The later one (canonical-type-system) claims the earlier was "catastrophically wrong." The 60% assessment counted surface-level existence; the 20% assessment checked architectural correctness.
- **Questions to Resolve**: Which assessment is accurate? This matters for sprint planning and dependency ordering.
- **Suggested Resolution**: The 20% assessment (canonical-type-system) is more accurate. It checked structural alignment, not just "does the type exist." The 60% assessment (canonical-type) was superficial — it counted that CanonicalType/UnitSystem/Extent existed but didn't verify they matched the spec. Per user direction, canonical-type is lower priority and less accurate.
- **Encyclopedia Location**: N/A (planning artifact, not spec content)
- **Status**: UNRESOLVED
- **Resolution**:

---

### A4: BindingValue — What Happens to Referent Data?

- **Location**: `SPRINT-20260129-012028-core-types-PLAN.md:P4` (LOCKED: remove referent)
- **Source Quote**: "Binding axis must not carry 'referent'-like data. Referents belong in: continuity policies / state mapping config, or specific ops (e.g., StateOp args)"
- **Description**: The decision to remove `referent` from BindingValue is LOCKED. But the referent data currently exists in the implementation and is used somewhere. The planning says referents go to "continuity policies / StateOp args" but doesn't specify:
  - Where exactly does referent data live after removal?
  - Is there an existing continuity policy system to absorb it?
  - Does StateOp already have the right shape for referent args?
- **Questions to Resolve**: Where does the removed referent data actually go? This is a real data model question, not just a "remove it" question.
- **Suggested Resolution**: Document the referent migration path as part of the cleanup-violations sprint. The BindingValue removal is correct (types shouldn't carry referent data), but the landing zone needs to be identified before implementation.
- **Encyclopedia Location**: `axes/t2_binding.md`
- **Status**: UNRESOLVED
- **Resolution**:

---

## 3. Terminology & Naming

*Establish consistent vocabulary*

### Ambiguous Terms

| # | Term | Variations | Locations | Issue | Suggested Canonical Form | Status | Resolution |
|---|------|------------|-----------|-------|-------------------------|--------|------------|
| T1 | Instance extraction helper | `getManyInstance`, `tryGetManyInstance`, `requireManyInstance`, `maybeManyInstance` | spec:241, planning:P5, authority-consolidation:P0 | Four different names across sources. Planning LOCKS try+require but authority-consolidation uses maybe+require. | `tryGetManyInstance` + `requireManyInstance` (per constructors-helpers PLAN which is latest) | UNRESOLVED | |
| T2 | Axis discriminant names | `default`/`instantiated` (impl), `var`/`inst` (spec) | canonical-types.ts:401, spec:65 | Completely different discriminant names for the axis pattern | Depends on C1 resolution | UNRESOLVED | |

---

## 4. Gaps and Missing Content

*Content that needs to be specified*

### G1: PerspectiveValue and BranchValue — Placeholder vs Future

- **Expected**: Full discriminated unions for perspective and branch values
- **Current State**: Spec says `PerspectiveValue = { kind: 'default' }` and `BranchValue = { kind: 'default' }` — single-variant unions. The spec prose (11-Perspective.md, 12-Branch.md) describes `world | view(id) | screen(id)` and `main | preview(id) | ...` but the type system spec (00-exhaustive) only has `{ kind: 'default' }`.
- **Referenced From**: `00-exhaustive-type-system.md:103-107` vs `11-Perspective.md:27-49` and `12-Branch.md:39-49`
- **Priority**: MEDIUM — Implementation can start with default-only, but the canonical spec should document the full value domains even if v0 only uses default.
- **Encyclopedia Location**: `axes/t2_perspective.md` and `axes/t2_branch.md`
- **Suggested Resolution**: Include the full value domains in the spec (from 11-Perspective.md and 12-Branch.md) but mark non-default variants as "v1+" or "future." The type definition should include them even if constructors don't expose them yet.
- **Status**: UNRESOLVED
- **Resolution**:

---

### G2: ValueExpr Variant Mapping — 24 Existing → 6 Spec

- **Expected**: Clear mapping from all existing SigExpr/FieldExpr/EventExpr variants to ValueExpr
- **Current State**: Spec defines 6 ValueExpr variants (const, external, intrinsic, kernel, state, time). Existing system has 24 total variants (10 SigExpr + 9 FieldExpr + 5 EventExpr). The planning (value-expr-PLAN:P1) marks this as MEDIUM confidence with unresolved unknowns about:
  - SigExprSlot → ?
  - SigExprShapeRef → ?
  - SigExprReduceField → ?
  - SigExprEventRead → ?
  - FieldExprBroadcast → ?
  - FieldExprZipSig → ?
  - FieldExprPathDerivative → ?
  - EventExprPulse → ?
  - EventExprWrap → ?
  - EventExprCombine → ?
  - EventExprNever → ?
- **Referenced From**: `SPRINT-20260129-012200-value-expr-PLAN.md:P1-P2`
- **Priority**: HIGH — This is the core architecture change. Without a complete mapping, the ValueExpr migration cannot proceed.
- **Encyclopedia Location**: `migration/t2_value-expr.md`
- **Suggested Resolution**: Some unmapped variants likely become `ValueExprKernel` with different kernelIds. Others (EventExprNever, EventExprCombine) may need new ValueExpr variants. This needs a dedicated design session, not just a mapping table.
- **Status**: UNRESOLVED
- **Resolution**:

---

## 5. Low-Impact Items

*Minor details — often safe to AGREE*

### L1: Spec Uses `getManyInstance` — Planning Locks Different Name

- **Location**: `00-exhaustive-type-system.md:230-246`
- **Issue**: The spec defines `getManyInstance(t): InstanceRef | null`. The planning LOCKS `tryGetManyInstance` + `requireManyInstance` and explicitly says "NO single getManyInstance function." The spec text needs to be updated to match the locked decision.
- **Suggested Resolution**: Update spec to use `tryGetManyInstance` + `requireManyInstance`. This is a spec update, not a decision — the decision is already LOCKED.
- **Status**: UNRESOLVED
- **Resolution**:

---

### L2: UnitType Missing `count` Kind

- **Location**: `00-exhaustive-type-system.md:138-143`
- **Issue**: Spec's UnitType has 5 kinds (none, scalar, norm01, angle, time). Planning adds `{ kind: 'count' }` for integer counts/indices. The implementation already uses count. This is a real need.
- **Suggested Resolution**: Add `{ kind: 'count' }` to the canonical UnitType spec. It's a dimensionless integer unit that the system already uses.
- **Status**: UNRESOLVED
- **Resolution**:

---

## Cross-Reference Matrix

| Concept | Spec (00-exhaustive) | Planning (canonical-type-system) | Earlier Planning (canonical-type) | Agreement? |
|---------|---------------------|----------------------------------|-----------------------------------|------------|
| Axis pattern | `Axis<T,V>` var/inst | Adopt spec's Axis<T,V> | Uses AxisTag<T> default/inst | **DISAGREE** (C1) |
| Instance helpers | `getManyInstance` | try+require (LOCKED) | try+require | **DISAGREE** (C3) |
| BindingValue | No referent | Remove referent (LOCKED) | N/A | **AGREE** (spec had no referent; impl added it) |
| UnitType structure | 5 flat | 8 structured, no var (LOCKED) | N/A | **DISAGREE** (C2) |
| UnitType var | N/A (not in spec) | NO var in canonical (LOCKED) | N/A | **AGREE** (neither spec nor planning want var) |
| ValueExpr discriminant | `op` | `op` | N/A | **AGREE** (but conflicts with all existing IR `kind`) |
| EventExpr typing | Must carry CanonicalType | Must carry CanonicalType | Must carry CanonicalType | **AGREE** |
| FieldExpr instanceId | I1 forbids duplicate | Remove (LOCKED) | Remove | **AGREE** |
| ConstValue | Discriminated union | Discriminated union | Discriminated union | **AGREE** |
| Axis enforcement | Single frontend gate | Single frontend gate | Single frontend gate | **AGREE** |

---

## Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Critical Contradictions | 3 | 0 | 3 |
| High-Impact Ambiguities | 4 | 0 | 4 |
| Terminology | 2 | 0 | 2 |
| Gaps | 2 | 0 | 2 |
| Low-Impact | 2 | 0 | 2 |
| **Total** | **13** | **0** | **13** |

**Progress: 0%**

Edit this file to resolve items, then re-run the command.
