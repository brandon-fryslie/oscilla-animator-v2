---
command: /canonicalize-architecture Output directory: ./design-docs/canonical-types/_output. Input directories: ./design-docs/canonical-types, ./.agent_planning/canonical-type, ./.agent_planning/canonical-type-system. Surface ALL disagreements / non-alignment as CRITICAL.
files: 00-exhaustive-type-system.md 01-CanonicalTypes.md 02-How-To-Get-There.md 03-Types-Analysis.md 04-CanonicalTypes-Analysis.md 05-LitmusTest.md 06-DefinitionOfDone-90%.md 07-DefinitionOfDone-100%.md 09-NamingConvention.md 10-RulesForNewTypes.md 11-Perspective.md 12-Branch.md 14-Binding-And-Continuity.md 15-FiveAxesTypeSystem-Conclusion.md 99-INVARIANTS-FOR-USAGE.md EVALUATION-2026-01-28-191553.md EXPLORE-2026-01-28-191553.md EVALUATION-20260129-012028.md SPRINT-SUMMARY.md SPRINT-20260129-012028-core-types-PLAN.md SPRINT-20260129-012100-constructors-helpers-PLAN.md SPRINT-20260129-012200-value-expr-PLAN.md SPRINT-20260129-012300-axis-validate-PLAN.md SPRINT-20260129-012400-unit-restructure-PLAN.md SPRINT-20260129-012500-adapter-spec-PLAN.md SPRINT-20260129-012600-cleanup-violations-PLAN.md SPRINT-20260129-012700-deprecate-old-PLAN.md SPRINT-2026-01-28-192541-foundation-PLAN.md SPRINT-2026-01-28-192541-authority-consolidation-PLAN.md SPRINT-2026-01-28-192541-const-value-PLAN.md SPRINT-2026-01-28-192541-event-typing-PLAN.md
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/01-CanonicalTypes.md
  - design-docs/canonical-types/02-How-To-Get-There.md
  - design-docs/canonical-types/03-Types-Analysis.md
  - design-docs/canonical-types/04-CanonicalTypes-Analysis.md
  - design-docs/canonical-types/05-LitmusTest.md
  - design-docs/canonical-types/06-DefinitionOfDone-90%.md
  - design-docs/canonical-types/07-DefinitionOfDone-100%.md
  - design-docs/canonical-types/09-NamingConvention.md
  - design-docs/canonical-types/10-RulesForNewTypes.md
  - design-docs/canonical-types/11-Perspective.md
  - design-docs/canonical-types/12-Branch.md
  - design-docs/canonical-types/14-Binding-And-Continuity.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
  - design-docs/canonical-types/99-INVARIANTS-FOR-USAGE.md
  - .agent_planning/canonical-type/EVALUATION-2026-01-28-191553.md
  - .agent_planning/canonical-type/EXPLORE-2026-01-28-191553.md
  - .agent_planning/canonical-type-system/EVALUATION-20260129-012028.md
  - .agent_planning/canonical-type-system/SPRINT-SUMMARY.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012028-core-types-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012100-constructors-helpers-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012200-value-expr-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012300-axis-validate-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012400-unit-restructure-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012500-adapter-spec-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012600-cleanup-violations-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012700-deprecate-old-PLAN.md
topics:
  - principles
  - type-system
  - axes
  - validation
  - migration
---

# Open Questions & Ambiguities: CanonicalType System

Generated: 2026-01-29T23:15:00Z
Supersedes: CANONICALIZED-QUESTIONS-canonical-types-20260129-225309.md

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

1. **Critical Contradictions** (C1-C3) - Structural disagreements between spec and planning
2. **High-Impact Ambiguities** (A1-A4) - Questionable changes that need decision
3. **New Contradictions** (N1) - Discovered during this MIDDLE run from new source file
4. **Terminology/Naming** (T1-T2) - Naming inconsistencies
5. **Gaps** (G1-G2) - Missing content
6. **Low-Impact Items** (L1-L2) - Minor details

---

## 1. Critical Contradictions

*All resolved.*

### C1: Axis Representation - `Axis<T,V>` (var/inst) vs `AxisTag<T>` (default/instantiated)

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
  - These are structurally incompatible - `default` has no data, `var` carries a variable ID.
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

### C2: UnitType Structure - Flat (16+ kinds) vs Nested (5-7 structured kinds)

- **Locations**:
  - Spec: `00-exhaustive-type-system.md:138-143` (5 kinds: none, scalar, norm01, angle, time)
  - Implementation: `src/core/canonical-types.ts:32-48` (16+ flat kinds + var)
  - Planning: `SPRINT-20260129-012400-unit-restructure-PLAN.md:P1` (7 structured kinds, LOCKED: no var)
- **Source Quotes**:
  - From spec: `UnitType = { kind: 'none' } | { kind: 'scalar' } | { kind: 'norm01' } | { kind: 'angle'; unit: ... } | { kind: 'time'; unit: ... }`
  - From planning (LOCKED): Adds `{ kind: 'count' }`, `{ kind: 'space'; space: 'ndc'|'world'|'view'; dims: 2|3 }`, `{ kind: 'color'; space: 'rgba01' }` - total 8 structured kinds
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

- **Encyclopedia Location**: `type-system/t1_canonical-type.md` (foundational - UnitType is part of the core type)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### C3: Instance Extraction API - `getManyInstance` vs `tryGetManyInstance` + `requireManyInstance`

- **Locations**:
  - Spec: `00-exhaustive-type-system.md:230-246`
  - Planning: `SPRINT-20260129-012100-constructors-helpers-PLAN.md:P5` (LOCKED)
  - Earlier planning: `SPRINT-2026-01-28-192541-authority-consolidation-PLAN.md:P0` (also converged on two helpers)
- **Source Quotes**:
  - From spec (00-exhaustive lines 241-246): `getManyInstance(t: CanonicalType): InstanceRef | null` - single function
  - From spec (15-FiveAxesTypeSystem line 168): `getManyInstance(type) -> InstanceRef | null` - single function
  - From planning (LOCKED): "Do not pick a single behavior (null vs throw) for one function and force 30+ call sites to 'remember the rule.' Make the contract explicit in the API." - `tryGetManyInstance` (returns null) + `requireManyInstance` (throws) + "NO single getManyInstance function (avoid ambiguity)"
- **Conflict**: Spec defines one function; planning LOCKS two functions and explicitly forbids the spec's name.
  - The spec's `getManyInstance` is ambiguous about caller obligations: does the caller check null? Crash? The planning resolves this by splitting into try/require.
  - The earlier planning (`canonical-type`) also identified this as a "CRITICAL AMBIGUITY" and converged on the same answer.
- **Impact**: 30+ call sites. API surface of a core type helper.
- **Resolution (CANONICAL)**: Replace `getManyInstance` with two explicit helpers.

  - `tryGetManyInstance(t): InstanceRef | null` (never throws)
  - `requireManyInstance(t): InstanceRef` (throws crisp error)

  Constraint:
  - `getManyInstance` is deprecated; do not keep it as an alias.

- **Encyclopedia Location**: `type-system/t2_derived-classifications.md` (structural - helper functions)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

## 2. High-Impact Ambiguities

*All resolved.*

### A1: ValueExpr Discriminant - `op` vs `kind`

- **Location**: `SPRINT-20260129-012200-value-expr-PLAN.md:P0` vs all existing IR types
- **Source Quote**: From planning: `ValueExprConst { readonly op: 'const'; ... }` - uses `op` as discriminant
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

### A2: Adapter Spec Restructure - Scope and Structure

- **Location**: `SPRINT-20260129-012500-adapter-spec-PLAN.md` vs `src/graph/adapters.ts`
- **Source Quote**: From planning (LOCKED): "Adapter matching operates purely on CanonicalType patterns" with `purity: 'pure'` and `stability: 'stable'` as mandatory fields
- **Description**: Planning proposes:
  - Move from `TypeSignature` (flattened cardinality/temporality) to `TypePattern` (extent-aware)
  - Add `ExtentPattern` and `ExtentTransform` types
  - Add mandatory `purity` and `stability` fields to `AdapterSpec`
  - Move file from `src/graph/adapters.ts` to `src/blocks/adapter-spec.ts`

  The extent-aware matching is logically necessary (adapters need to match on 5 axes, not 2). But the full restructure has MEDIUM confidence in the planning docs.
- **Resolution (CANONICAL)**: Adopt the full TypePattern/ExtentPattern/ExtentTransform adapter spec now.

  Canonical constraints:
  - Adapter matching is defined purely over CanonicalType patterns (payload/unit/extent).
  - Adapter metadata must not "permit" any type that fails axis rules; it only describes insertion of already-valid blocks.
  - `purity: 'pure'` and `stability: 'stable'` are mandatory fields (even if all current adapters satisfy them) to prevent future non-conforming adapters.
  - Adapter spec types live with block definitions (`src/blocks/`), not in graph normalization.

- **Encyclopedia Location**: `migration/t2_adapter-restructure.md`
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### A3: Evaluation Severity Disagreement - 60% vs 20% Complete

- **Location**:
  - `.agent_planning/canonical-type/EVALUATION-2026-01-28-191553.md`: "Overall: 60% complete"
  - `.agent_planning/canonical-type-system/EVALUATION-20260129-012028.md`: "~20% aligned... previous gap analysis was catastrophically wrong"
- **Source Quotes**:
  - Earlier (canonical-type): "Infrastructure is solid. Foundation: Strong. Integration: Missing"
  - Later (canonical-type-system): "The previous gap analysis was catastrophically wrong, claiming 10 items done when most were superficially present but architecturally incorrect."
- **Description**: Two evaluations of the same codebase produced wildly different assessments. The later one (canonical-type-system) claims the earlier was "catastrophically wrong." The 60% assessment counted surface-level existence; the 20% assessment checked architectural correctness.
- **Suggested Resolution**: The 20% assessment (canonical-type-system) is more accurate. It checked structural alignment, not just "does the type exist." The 60% assessment (canonical-type) was superficial - it counted that CanonicalType/UnitSystem/Extent existed but didn't verify they matched the spec. Per user direction, canonical-type is lower priority and less accurate.
- **Encyclopedia Location**: N/A (planning artifact, not spec content)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### A4: BindingValue - What Happens to Referent Data?

- **Location**: `SPRINT-20260129-012028-core-types-PLAN.md:P4` (LOCKED: remove referent)
- **Source Quote**: "Binding axis must not carry 'referent'-like data. Referents belong in: continuity policies / state mapping config, or specific ops (e.g., StateOp args)"
- **Description**: The decision to remove `referent` from BindingValue is LOCKED. But the referent data currently exists in the implementation and is used somewhere. The planning says referents go to "continuity policies / StateOp args" but doesn't specify:
  - Where exactly does referent data live after removal?
  - Is there an existing continuity policy system to absorb it?
  - Does StateOp already have the right shape for referent args?
- **Resolution (CANONICAL)**: Referent data must not live in CanonicalType; it moves to state/continuity configuration.

  Landing zones:
  - **Continuity policies**: any "what prior thing am I preserving against" reference is expressed as explicit continuity config (e.g., `gauge`/`projector`/`post` args), not as an axis value.
  - **State/continuity ops**: any binding target/reference needed by stateful evaluation is carried as explicit args on `state` operations (or their lowering inputs), never embedded in the type lattice.

  Constraint:
  - Binding axis remains a closed lattice (`unbound | weak | strong | identity`) with no IDs, pointers, or referents.

- **Encyclopedia Location**: `axes/t2_binding.md`
- **Status**: RESOLVED
- **Resolution**: AGREE

---

## 3. New Contradictions (Discovered This Run)

*New source file `99-INVARIANTS-FOR-USAGE.md` was added since the last run. Cross-checking against resolved decisions surfaced 1 contradiction.*

### N1: Guardrail #11 Uses `op` Example - Contradicts Resolved A1 (`kind`)

- **Locations**:
  - `99-INVARIANTS-FOR-USAGE.md:81-83` (guardrail #11)
  - A1 resolution (this file, above)
- **Source Quotes**:
  - From 99-INVARIANTS-FOR-USAGE.md: "Example: if ValueExpr uses op, all ValueExpr variants use op."
  - From A1 resolution: "Use `kind` as the discriminant for ValueExpr variants."
- **Conflict**: Guardrail #11's *example* assumes `op` as the discriminant for ValueExpr. But A1 was resolved to use `kind` for consistency with all existing IR unions. The guardrail's *rule* (use one discriminant name consistently) is correct; the *example* is outdated.
- **Impact**: Low - the guardrail is about consistency, and `kind` is the consistent choice. Only the example text needs updating.
- **Suggested Resolution**: Update guardrail #11's example to reflect the resolved decision:
  - Old: "Example: if ValueExpr uses op, all ValueExpr variants use op."
  - New: "Example: all IR discriminated unions use `kind`; ValueExpr uses `kind`."
  The rule itself is correct and aligns perfectly with the A1 resolution.
- **Encyclopedia Location**: `validation/t1_enforcement-gate.md` (guardrails are enforcement rules)
- **Status**: RESOLVED
- **Resolution**: AGREE

---

## 4. Terminology & Naming

*All resolved.*

### Ambiguous Terms

| # | Term | Variations | Locations | Issue | Suggested Canonical Form | Status | Resolution |
|---|------|------------|-----------|-------|-------------------------|--------|------------|
| T1 | Instance extraction helper | `getManyInstance`, `tryGetManyInstance`, `requireManyInstance`, `maybeManyInstance` | spec:241, planning:P5, authority-consolidation:P0 | Four different names across sources. Planning LOCKS try+require but authority-consolidation uses maybe+require. | `tryGetManyInstance` + `requireManyInstance` (per constructors-helpers PLAN which is latest) | RESOLVED | AGREE |
| T2 | Axis discriminant names | `default`/`instantiated` (impl), `var`/`inst` (spec) | canonical-types.ts:401, spec:65 | Completely different discriminant names for the axis pattern | `var`/`inst` per spec (C1 resolved) | RESOLVED | AGREE |

---

## 5. Gaps and Missing Content

### G1: PerspectiveValue and BranchValue - Placeholder vs Future

- **Expected**: Full discriminated unions for perspective and branch values
- **Current State**: Spec says `PerspectiveValue = { kind: 'default' }` and `BranchValue = { kind: 'default' }` - single-variant unions. The spec prose (11-Perspective.md, 12-Branch.md) describes `world | view(id) | screen(id)` and `main | preview(id) | ...` but the type system spec (00-exhaustive) only has `{ kind: 'default' }`.
- **Referenced From**: `00-exhaustive-type-system.md:103-107` vs `11-Perspective.md:27-49` and `12-Branch.md:39-49`
- **Priority**: MEDIUM - Implementation can start with default-only, but the canonical spec should document the full value domains even if v0 only uses default.
- **Encyclopedia Location**: `axes/t2_perspective.md` and `axes/t2_branch.md`
- **Suggested Resolution**: Include the full value domains in the spec (from 11-Perspective.md and 12-Branch.md) but mark non-default variants as "v1+" or "future." The type definition should include them even if constructors don't expose them yet.
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### G2: ValueExpr Variant Mapping - 24 Existing to 6 Spec

- **Expected**: Clear mapping from all existing SigExpr/FieldExpr/EventExpr variants to ValueExpr
- **Current State**: Spec defines 6 ValueExpr variants (const, external, intrinsic, kernel, state, time). Existing system has 24 total variants (10 SigExpr + 9 FieldExpr + 5 EventExpr). The planning (value-expr-PLAN:P1) marks this as MEDIUM confidence with unresolved unknowns about:
  - SigExprSlot -> ?
  - SigExprShapeRef -> ?
  - SigExprReduceField -> ?
  - SigExprEventRead -> ?
  - FieldExprBroadcast -> ?
  - FieldExprZipSig -> ?
  - FieldExprPathDerivative -> ?
  - EventExprPulse -> ?
  - EventExprWrap -> ?
  - EventExprCombine -> ?
  - EventExprNever -> ?
- **Referenced From**: `SPRINT-20260129-012200-value-expr-PLAN.md:P1-P2`
- **Priority**: HIGH - This is the core architecture change. Without a complete mapping, the ValueExpr migration cannot proceed.
- **Encyclopedia Location**: `migration/t2_value-expr.md`
- **Suggested Resolution**: Some unmapped variants likely become `ValueExprKernel` with different kernelIds. Others (EventExprNever, EventExprCombine) may need new ValueExpr variants. This needs a dedicated design session, not just a mapping table.
- **Status**: RESOLVED
- **Resolution**:

Adopt a total mapping NOW (no new ValueExpr variants). All legacy SigExpr/FieldExpr/EventExpr variants must lower to exactly one of the six ValueExpr ops: `const | external | intrinsic | kernel | state | time`.

Mapping rule (deterministic):
- Any op that is pure computation over inputs becomes `ValueExprKernel` with an explicit `kernelId` and `args`.
- Any op that represents time reads becomes `ValueExprTime`.
- Any op that represents stateful/history behavior becomes `ValueExprState`.
- Any op that represents reading from the outside world becomes `ValueExprExternal`.
- Any literal becomes `ValueExprConst`.

Canonical mappings for previously "unknown" variants (must be implemented):
- `SigExprSlot` -> `ValueExprExternal` (channel namespace `slot:<id>`).
- `SigExprShapeRef` -> `ValueExprExternal` (channel namespace `shape:<shapeId>:<param>`).
- `SigExprReduceField` -> `ValueExprKernel` (kernelId `reduceField`, args `[fieldExprId, reducerConfigExprId?]`; reducer config is either encoded as additional ValueExprConst/External args or fixed by kernelId variant).
- `SigExprEventRead` -> `ValueExprKernel` (kernelId `eventRead`, args `[eventExprId]`) producing a continuous signal typed as canonical signal (bool or float depending on your existing semantics).
- `FieldExprBroadcast` -> `ValueExprKernel` (kernelId `broadcast`, args `[signalExprId]`).
- `FieldExprZipSig` -> `ValueExprKernel` (kernelId `zipSig`, args `[fieldExprId, signalExprId]`).
- `FieldExprPathDerivative` -> `ValueExprKernel` (kernelId `pathDerivative`, args `[fieldExprId, ...]`).
- `EventExprPulse` -> `ValueExprKernel` (kernelId `eventPulse`, args `[...]`, type temporality=discrete).
- `EventExprWrap` -> `ValueExprKernel` (kernelId `eventWrap`, args `[...]`, type temporality=discrete).
- `EventExprCombine` -> `ValueExprKernel` (kernelId `eventCombine`, args `[eventA, eventB, ...]`, type temporality=discrete).
- `EventExprNever` -> `ValueExprConst` with `{ kind:'bool', value:false }` and type = canonical event (discrete bool none).

Constraint:
- After this resolution, there must be a single codepath that converts legacy expr nodes into ValueExpr (frontend), and all backend lowering/scheduling must consume ValueExpr only.

---

## 6. Low-Impact Items

*All resolved.*

### L1: Spec Uses `getManyInstance` - Planning Locks Different Name

- **Location**: `00-exhaustive-type-system.md:230-246`
- **Issue**: The spec defines `getManyInstance(t): InstanceRef | null`. The planning LOCKS `tryGetManyInstance` + `requireManyInstance` and explicitly says "NO single getManyInstance function." The spec text needs to be updated to match the locked decision.
- **Suggested Resolution**: Update spec to use `tryGetManyInstance` + `requireManyInstance`. This is a spec update, not a decision - the decision is already LOCKED.
- **Status**: RESOLVED
- **Resolution**: AGREE

---

### L2: UnitType Missing `count` Kind

- **Location**: `00-exhaustive-type-system.md:138-143`
- **Issue**: Spec's UnitType has 5 kinds (none, scalar, norm01, angle, time). Planning adds `{ kind: 'count' }` for integer counts/indices. The implementation already uses count. This is a real need.
- **Suggested Resolution**: Add `{ kind: 'count' }` to the canonical UnitType spec. It's a dimensionless integer unit that the system already uses.
- **Status**: RESOLVED
- **Resolution**: AGREE

---

## Cross-Reference Matrix

| Concept | Spec (00-exhaustive) | Planning (canonical-type-system) | Earlier Planning (canonical-type) | Agreement? |
|---------|---------------------|----------------------------------|-----------------------------------|------------|
| Axis pattern | `Axis<T,V>` var/inst | Adopt Axis<T,V> var/inst | Adopt Axis<T,V> var/inst | **AGREE** (C1 resolved) |
| Instance helpers | `getManyInstance` | try+require (LOCKED) | try+require | **AGREE** (C3 resolved) |
| BindingValue | No referent | Remove referent (LOCKED) | N/A | **AGREE** (spec had no referent; impl added it) |
| UnitType structure | 5 flat | 8 structured, no var (LOCKED) | N/A | **AGREE** (C2 resolved) |
| UnitType var | N/A (not in spec) | NO var in canonical (LOCKED) | N/A | **AGREE** (neither spec nor planning want var) |
| ValueExpr discriminant | `op` (spec) | `kind` (resolved A1) | N/A | **AGREE** (A1 resolved to `kind`) |
| EventExpr typing | Must carry CanonicalType | Must carry CanonicalType | Must carry CanonicalType | **AGREE** |
| FieldExpr instanceId | I1 forbids duplicate | Remove (LOCKED) | Remove | **AGREE** |
| ConstValue | Discriminated union | Discriminated union | Discriminated union | **AGREE** |
| Axis enforcement | Single frontend gate | Single frontend gate | Single frontend gate | **AGREE** |
| Guardrail #11 example | N/A | N/A | N/A | **AGREE** (N1 resolved: update example to `kind`) |
| ValueExpr variant mapping | 6 variants | 6 variants (total mapping) | N/A | **AGREE** (G2 resolved: all 24 map to 6) |

---

## Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Critical Contradictions | 3 | 3 | 0 |
| High-Impact Ambiguities | 4 | 4 | 0 |
| New Contradictions | 1 | 1 | 0 |
| Terminology | 2 | 2 | 0 |
| Gaps | 2 | 2 | 0 |
| Low-Impact | 2 | 2 | 0 |
| **Total** | **14** | **14** | **0** |

**Progress: 100%**

All items resolved! Re-run to start the editorial review process.
