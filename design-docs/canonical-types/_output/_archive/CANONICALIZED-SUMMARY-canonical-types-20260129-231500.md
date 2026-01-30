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

# Canonical Architecture Summary: CanonicalType System

Generated: 2026-01-29T23:15:00Z
Supersedes: CANONICALIZED-SUMMARY-canonical-types-20260129-225309.md
Documents Analyzed: 15 spec files + 14 planning files across 3 directories (new: 99-INVARIANTS-FOR-USAGE.md)

## Source Priority

| Priority | Source | Authority |
|----------|--------|-----------|
| 1 (highest) | `.agent_planning/canonical-type-system/` | Last-minute updates; spec defers to locked decisions here |
| 2 | `design-docs/canonical-types/` | Authoritative spec (including new 99-INVARIANTS-FOR-USAGE.md) |
| 3 (lowest) | `.agent_planning/canonical-type/` | Inaccurate first-pass; defer to spec |

## Executive Summary

The CanonicalType system defines a **single type authority** for all values: `CanonicalType = { payload, unit, extent }` where extent contains 5 orthogonal axes (cardinality, temporality, binding, perspective, branch). Signal/field/event are derived classifications, NOT stored.

**All 14 questions/contradictions resolved.** Additionally, the editorial review surfaced and resolved 2 design questions (Q1: CardinalityValue.zero semantics, Q2: BindingValue ordering) and 2 spec refinements (N4: constructor unit asymmetry, N5: SigExprEventRead output type).

### Resolved Decisions (Canonical)

1. **Axis representation**: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }` (spec wins; `AxisTag<T>` deprecated)
2. **UnitType**: 8 structured kinds (none, scalar, norm01, count, angle, time, space, color); NO `{ kind: 'var' }` in canonical type
3. **Instance helpers**: `tryGetManyInstance` + `requireManyInstance` (replaces `getManyInstance`)
4. **ValueExpr discriminant**: `kind` (not `op`), for consistency with all existing IR unions
5. **Adapter restructure**: Full TypePattern/ExtentPattern/ExtentTransform now; purity+stability mandatory
6. **Evaluation accuracy**: 20% assessment is correct (structural, not superficial)
7. **Referent removal**: Referent data moves to continuity policies / StateOp args; binding axis is nominal tags (NOT a lattice)
8. **Perspective/Branch**: Include full value domains in spec, mark non-default as "v1+"
9. **Guardrail #11 example**: Updated from `op` to `kind` (N1)
10. **ValueExpr variant mapping**: Total mapping — all 24 legacy variants map to 6 ValueExpr ops, no new variants (G2)
11. **Constructor unit asymmetry**: `canonicalSignal` default unit=scalar is intentional; `canonicalField` requires explicit unit. Default is constructor convenience only, never inference fallback (N4)
12. **SigExprEventRead output**: `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })` — float 0.0/1.0 gating, never bool (N5)
13. **CardinalityValue.zero**: Compile-time-only value class. Const blocks emit zero. Requires explicit lift ops to become one/many. NOT "scalar" (Q1)
14. **BindingValue**: Nominal tags with equality-only semantics. NO ordering, NO lattice. Tags constrain what ops are allowed, not a hierarchy (Q2)

## Key Components

### CanonicalType (single authority)
```
CanonicalType = { payload: PayloadType, unit: UnitType, extent: Extent }
```

### PayloadType (closed set)
```
float | int | bool | vec2 | vec3 | color | cameraProjection
```

### UnitType (8 structured kinds - RESOLVED C2)
```
none | scalar | norm01 | count
| angle(radians|degrees|phase01)
| time(ms|seconds)
| space(ndc|world|view, dims:2|3)
| color(rgba01)
```
NO `{ kind: 'var' }` in canonical type.

### Extent (5 axes)
```
Extent = { cardinality, temporality, binding, perspective, branch }
```
Each axis uses `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }` (RESOLVED C1).

### Derived Classifications (NOT stored)
- **const** := cardinality=zero (compile-time only, no runtime lanes)
- **signal** := cardinality=one, temporality=continuous
- **field** := cardinality=many(instance), temporality=continuous
- **event** := temporality=discrete (payload=bool, unit=none as hard invariants)

### Hard Invariants (I1-I5)
- **I1**: No field duplicates type authority in CanonicalType
- **I2**: Only explicit ops change axes
- **I3**: Axis enforcement is centralized (single frontend gate)
- **I4**: State is scoped by branch + instance lane identity
- **I5**: Const literal shape matches payload (discriminated union)

### Guardrails (17 rules from 99-INVARIANTS-FOR-USAGE.md)
The guardrails document codifies enforcement rules for agent/developer use. All 17 rules align with canonical decisions (guardrail #11 example updated from `op` to `kind` per N1).

## Canonicalization Status

- Resolved: **14/14** (100%)
- Editorial review items: **7/7 resolved** (B1, N1-N5, Q1, Q2)
- Topics Identified: 5
- Sources: 15 spec files + 14 planning files

## Status

All items resolved. Editorial review complete. Ready for approval run and encyclopedia generation.
