---
parent: ../INDEX.md
---

# Source Document Map

Which original documents contributed to which parts of this specification.

## Primary Sources

| Source | Topics | Priority |
|--------|--------|----------|
| `design-docs/canonical-types/00-exhaustive-type-system.md` | type-system, validation, appendices | P2 (spec) |
| `design-docs/canonical-types/01-CanonicalTypes.md` | type-system | P2 |
| `design-docs/canonical-types/02-How-To-Get-There.md` | migration | P2 |
| `design-docs/canonical-types/03-Types-Analysis.md` | migration | P2 |
| `design-docs/canonical-types/04-CanonicalTypes-Analysis.md` | type-system | P2 |
| `design-docs/canonical-types/05-LitmusTest.md` | principles, validation | P2 |
| `design-docs/canonical-types/06-DefinitionOfDone-90%.md` | migration | P2 |
| `design-docs/canonical-types/07-DefinitionOfDone-100%.md` | migration | P2 |
| `design-docs/canonical-types/09-NamingConvention.md` | migration | P2 |
| `design-docs/canonical-types/10-RulesForNewTypes.md` | migration | P2 |
| `design-docs/canonical-types/11-Perspective.md` | axes | P2 |
| `design-docs/canonical-types/12-Branch.md` | axes | P2 |
| `design-docs/canonical-types/14-Binding-And-Continuity.md` | axes | P2 |
| `design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md` | principles, axes | P2 |
| `design-docs/canonical-types/99-INVARIANTS-FOR-USAGE.md` | validation | P2 |

## Planning Sources

| Source | Topics | Priority |
|--------|--------|----------|
| `.agent_planning/canonical-type-system/SPRINT-*-core-types-PLAN.md` | type-system, axes | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-constructors-helpers-PLAN.md` | type-system | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-value-expr-PLAN.md` | migration | P1 (MEDIUM) |
| `.agent_planning/canonical-type-system/SPRINT-*-axis-validate-PLAN.md` | validation | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-unit-restructure-PLAN.md` | migration | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-adapter-spec-PLAN.md` | migration | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-cleanup-violations-PLAN.md` | axes | P1 (LOCKED) |
| `.agent_planning/canonical-type-system/SPRINT-*-deprecate-old-PLAN.md` | migration | P1 |
| `.agent_planning/canonical-type-system/EVALUATION-20260129-012028.md` | appendices | P1 |

## Earlier Planning (Lower Priority)

| Source | Notes |
|--------|-------|
| `.agent_planning/canonical-type/EVALUATION-2026-01-28-191553.md` | Superseded by 20260129 evaluation |
| `.agent_planning/canonical-type/EXPLORE-2026-01-28-191553.md` | Raw facts, consumed by evaluation |

## Gap Analysis Sources (Update 2026-01-29)

| Source | Topics | Priority |
|--------|--------|----------|
| `.agent_planning/gap-analysis/RESOLUTIONS.md` | type-system, validation, migration | P1 (user-approved resolutions) |
| `.agent_planning/gap-analysis/SUMMARY.md` | type-system, validation, migration, axes | P1 (gap analysis results) |

**Topics affected**: type-system (t1, t2, t3), validation (t2, t3), migration (t3)
**New topic created**: type-system/t2_inference-types.md
**Resolutions added**: GQ1-GQ13 (12 decisions)

## Source Priority

| Priority | Source Directory | Authority |
|----------|-----------------|-----------|
| 1 (highest) | `.agent_planning/gap-analysis/` | User-approved gap analysis resolutions |
| 2 | `.agent_planning/canonical-type-system/` | Latest locked decisions |
| 3 | `design-docs/canonical-types/` | Authoritative spec |
| 4 (lowest) | `.agent_planning/canonical-type/` | Inaccurate first-pass |
