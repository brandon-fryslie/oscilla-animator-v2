---
command: /canonicalize-architecture Output directory: ./design-docs/canonical-types/_output. Input directories: ./design-docs/canonical-types, ./.agent_planning/canonical-type, ./.agent_planning/canonical-type-system. Surface ALL disagreements / non-alignment as CRITICAL. ./.agent_planning/canonical-type-system had last minute updates that we want to bring back into the main spec.
files: 00-exhaustive-type-system.md 01-CanonicalTypes.md 02-How-To-Get-There.md 03-Types-Analysis.md 04-CanonicalTypes-Analysis.md 05-LitmusTest.md 06-DefinitionOfDone-90%.md 07-DefinitionOfDone-100%.md 09-NamingConvention.md 10-RulesForNewTypes.md 11-Perspective.md 12-Branch.md 14-Binding-And-Continuity.md 15-FiveAxesTypeSystem-Conclusion.md EVALUATION-2026-01-28-191553.md EXPLORE-2026-01-28-191553.md EVALUATION-20260129-012028.md SPRINT-SUMMARY.md SPRINT-20260129-012028-core-types-PLAN.md SPRINT-20260129-012100-constructors-helpers-PLAN.md SPRINT-20260129-012200-value-expr-PLAN.md SPRINT-20260129-012300-axis-validate-PLAN.md SPRINT-20260129-012400-unit-restructure-PLAN.md SPRINT-20260129-012500-adapter-spec-PLAN.md SPRINT-20260129-012600-cleanup-violations-PLAN.md SPRINT-20260129-012700-deprecate-old-PLAN.md SPRINT-2026-01-28-192541-foundation-PLAN.md SPRINT-2026-01-28-192541-authority-consolidation-PLAN.md SPRINT-2026-01-28-192541-const-value-PLAN.md SPRINT-2026-01-28-192541-event-typing-PLAN.md SPRINT-2026-01-28-192541-foundation-PLAN.md
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

# Canonical Architecture Summary: CanonicalType System

Generated: 2026-01-29T22:53:09Z
Supersedes: CANONICALIZED-SUMMARY-canonical-types-20260129-075723.md (first run — spec-only, missed planning updates)
Documents Analyzed: 14 spec files + 14 planning files across 3 directories

## Source Priority

| Priority | Source | Authority |
|----------|--------|-----------|
| 1 (highest) | `.agent_planning/canonical-type-system/` | Last-minute updates; spec defers to locked decisions here |
| 2 | `design-docs/canonical-types/` | Authoritative spec |
| 3 (lowest) | `.agent_planning/canonical-type/` | Inaccurate first-pass; defer to spec |

## Executive Summary

The CanonicalType system defines a **single type authority** for all values: `CanonicalType = { payload, unit, extent }` where extent contains 5 orthogonal axes (cardinality, temporality, binding, perspective, branch). Signal/field/event are derived classifications, NOT stored.

**This analysis surfaces 3 CRITICAL contradictions** between the spec and the latest planning documents, plus 4 high-impact ambiguities. The previous canonicalization run (20260129-075723) analyzed only the spec documents in isolation and found zero issues — it missed all disagreements because the planning documents were not included.

### Locked Decisions (from canonical-type-system, OVERRIDE spec where they differ)

1. **`tryGetManyInstance` + `requireManyInstance`** — Two explicit helpers replace the single ambiguous `getManyInstance`. The spec says `getManyInstance(t): InstanceRef | null`; the planning locks in try/require pattern instead.

2. **BindingValue removes `referent`** — Spec (00-exhaustive) defines BindingValue with just `unbound | weak | strong | identity`. The implementation had added `referent: ReferentRef` on weak/strong/identity. Decision: REMOVE referent. Referents belong in continuity policies / StateOp args, not the type lattice.

3. **UnitType: NO `{ kind: 'var' }`** — The implementation has 16+ flat kinds including `{ kind: 'var'; id: string }`. The planning locks: unit variables belong in inference-only wrappers, not in canonical type. Restructure to structured nesting (angle, time, space, color).

### Questionable Changes (need resolution)

1. **`Axis<T,V>` vs `AxisTag<T>`** — Spec uses `Axis<T,V>` with `var`/`inst` discriminants. Implementation uses `AxisTag<T>` with `default`/`instantiated`. Planning says replace. This is a fundamental structural question.

2. **ValueExpr `op` vs `kind` discriminant** — Spec uses `op` as the discriminant field on ValueExpr variants. All existing IR types use `kind`. Mixing discriminant names is a consistency question.

3. **Adapter spec restructure** — Planning proposes `TypePattern` with extent-aware matching, `purity`/`stability` fields. Current system uses flattened `TypeSignature`. Scope of change unclear.

## Key Components

### CanonicalType (single authority)
```
CanonicalType = { payload: PayloadType, unit: UnitType, extent: Extent }
```

### Extent (5 axes)
```
Extent = { cardinality, temporality, binding, perspective, branch }
```

### Derived Classifications (NOT stored)
- **signal** := cardinality=one, temporality=continuous
- **field** := cardinality=many(instance), temporality=continuous
- **event** := temporality=discrete (payload=bool, unit=none as hard invariants)

### Hard Invariants (I1–I5)
- **I1**: No field duplicates type authority in CanonicalType
- **I2**: Only explicit ops change axes
- **I3**: Axis enforcement is centralized (single frontend gate)
- **I4**: State is scoped by branch + instance lane identity
- **I5**: Const literal shape matches payload (discriminated union)

## Canonicalization Status

- Critical Contradictions: **3** (UNRESOLVED)
- High-Impact Ambiguities: **4** (UNRESOLVED)
- Terminology Issues: **2** (UNRESOLVED)
- Gaps: **2** (UNRESOLVED)
- Low-Impact Items: **2** (UNRESOLVED)
- Topics Identified: 5

## Recommendations for Next Steps

1. **Resolve the 3 critical contradictions** — These represent real spec disagreements that must be decided before implementation can proceed correctly
2. **Decide the questionable changes** — Axis<T,V> vs AxisTag<T>, op vs kind, adapter restructure
3. **Update the spec** to reflect locked decisions (try/require pattern, BindingValue, UnitType)
4. **Re-run** after resolving to proceed to editorial review and encyclopedia generation
