---
status: CANONICAL
generated: 20260129-235000
updated: 20260129-180000
update_history:
  - date: 20260129-180000
    sources_added: 2
    topics_added: 1
    topics_updated:
      - type-system/t1_canonical-type.md
      - type-system/t2_derived-classifications.md
      - type-system/t3_const-value.md
      - validation/t2_axis-validate.md
      - validation/t3_diagnostics.md
      - migration/t3_definition-of-done.md
    resolutions_made: 12
approved_by: User
approval_method: bulk_approve
source_documents: 31
topics: 5
---

# CanonicalType System: Canonical Specification Index

> **STATUS: CANONICAL**
> This is the authoritative source of truth for the CanonicalType system.
> Last updated: 2026-01-29T18:00:00Z (integrated 2 new sources, 12 resolutions)

Generated: 2026-01-29T23:50:00Z
Approved by: User
Source Documents: 29 files from `design-docs/canonical-types/`, `.agent_planning/canonical-type/`, `.agent_planning/canonical-type-system/`

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [TIERS](./TIERS.md) | Explains the three-tier system |
| [GLOSSARY](./GLOSSARY.md) | Term definitions |
| [Resolution Log](./RESOLUTION-LOG.md) | Decision history |

## Topics

| # | Topic | T1 Files | T2 Files | T3 Files |
|---|-------|----------|----------|----------|
| 01 | [Principles](./principles/) | [single-authority](./principles/t1_single-authority.md) | - | - |
| 02 | [Type System](./type-system/) | [canonical-type](./type-system/t1_canonical-type.md) | [extent-axes](./type-system/t2_extent-axes.md), [derived-classifications](./type-system/t2_derived-classifications.md), [inference-types](./type-system/t2_inference-types.md) | [const-value](./type-system/t3_const-value.md) |
| 03 | [Axes](./axes/) | [axis-invariants](./axes/t1_axis-invariants.md) | [cardinality](./axes/t2_cardinality.md), [temporality](./axes/t2_temporality.md), [binding](./axes/t2_binding.md), [perspective](./axes/t2_perspective.md), [branch](./axes/t2_branch.md) | - |
| 04 | [Validation](./validation/) | [enforcement-gate](./validation/t1_enforcement-gate.md) | [axis-validate](./validation/t2_axis-validate.md) | [diagnostics](./validation/t3_diagnostics.md) |
| 05 | [Migration](./migration/) | - | [value-expr](./migration/t2_value-expr.md), [unit-restructure](./migration/t2_unit-restructure.md), [adapter-restructure](./migration/t2_adapter-restructure.md) | [definition-of-done](./migration/t3_definition-of-done.md), [rules-for-new-types](./migration/t3_rules-for-new-types.md) |

## Tier Distribution

- **T1 (Foundational)**: 4 files across 4 topics — cannot change without making this a different system
- **T2 (Structural)**: 11 files across 4 topics — can change, but affects many things
- **T3 (Optional)**: 4 files across 3 topics — reference material, change freely

## Recommended Reading Order

### For Newcomers

1. **[TIERS](./TIERS.md)** — Understand the organization system
2. **[Single Authority](./principles/t1_single-authority.md)** — The core idea
3. **[CanonicalType](./type-system/t1_canonical-type.md)** — The one true type
4. **[Derived Classifications](./type-system/t2_derived-classifications.md)** — signal/field/event + helpers
5. **[Axis Invariants](./axes/t1_axis-invariants.md)** — The rules
6. **[GLOSSARY](./GLOSSARY.md)** — Reference as needed

### For Implementers

1. **[Axis Invariants](./axes/t1_axis-invariants.md)** — Know the rules
2. **[Enforcement Gate](./validation/t1_enforcement-gate.md)** — 17 guardrails
3. **[Axis Validation](./validation/t2_axis-validate.md)** — Implementation
4. **[Unit Restructure](./migration/t2_unit-restructure.md)** — UnitType changes
5. **[ValueExpr](./migration/t2_value-expr.md)** — Unified IR + mapping table
6. **[Adapter Restructure](./migration/t2_adapter-restructure.md)** — Adapter patterns
7. **[Rules for New Types](./migration/t3_rules-for-new-types.md)** — Governance
8. **[GLOSSARY](./GLOSSARY.md)** — Naming conventions

### For Agents

- **Always read**: `**/t1_*.md` (4 foundational files — small and critical)
- **Usually read**: `**/t2_*.md` for relevant topics
- **Consult as needed**: `**/t3_*.md` for reference material

## Search Hints

| Looking for... | Go to |
|----------------|-------|
| The type shape | [type-system/t1_canonical-type.md](./type-system/t1_canonical-type.md) |
| PayloadType values | [type-system/t1_canonical-type.md#payloadtype](./type-system/t1_canonical-type.md) |
| UnitType (8 kinds) | [type-system/t1_canonical-type.md#unittype](./type-system/t1_canonical-type.md) |
| signal/field/event rules | [type-system/t2_derived-classifications.md](./type-system/t2_derived-classifications.md) |
| Instance helpers | [type-system/t2_derived-classifications.md#instance-extraction](./type-system/t2_derived-classifications.md) |
| Inference types | [type-system/t2_inference-types.md](./type-system/t2_inference-types.md) |
| tryDeriveKind | [type-system/t2_derived-classifications.md#tryderivekind](./type-system/t2_derived-classifications.md) |
| BindingMismatchError | [validation/t3_diagnostics.md#bindingmismatcherror](./validation/t3_diagnostics.md) |
| CI forbidden patterns | [migration/t3_definition-of-done.md#ci-gate-test](./migration/t3_definition-of-done.md) |
| CameraProjection enum | [type-system/t3_const-value.md](./type-system/t3_const-value.md) |
| Cardinality (zero/one/many) | [axes/t2_cardinality.md](./axes/t2_cardinality.md) |
| Binding (not a lattice) | [axes/t2_binding.md](./axes/t2_binding.md) |
| Validation gate | [validation/t1_enforcement-gate.md](./validation/t1_enforcement-gate.md) |
| 17 guardrails | [validation/t1_enforcement-gate.md#the-17-guardrails](./validation/t1_enforcement-gate.md) |
| ValueExpr mapping | [migration/t2_value-expr.md](./migration/t2_value-expr.md) |
| Migration checklist | [migration/t3_definition-of-done.md](./migration/t3_definition-of-done.md) |
| Any term | [GLOSSARY.md](./GLOSSARY.md) |
| Why a decision was made | [RESOLUTION-LOG.md](./RESOLUTION-LOG.md) |

## Appendices

- [Source Map](./appendices/source-map.md) — Which sources contributed to which sections
- [Superseded Documents](./appendices/superseded-docs.md) — Archived original documents

---

## About This Encyclopedia

This specification was generated through a structured canonicalization process:

1. **Source Analysis**: 29 documents analyzed for contradictions and ambiguities
2. **Resolution**: 14 items resolved through iterative refinement
3. **Editorial Review**: Peer design review conducted — 5 non-blocking concerns, 2 design questions, all resolved
4. **User Approval**: All 18 decisions approved (bulk approval)
5. **Update 2026-01-29**: 2 gap analysis documents integrated (12 additional resolutions, 1 new topic)

Resolution history is preserved in [RESOLUTION-LOG.md](./RESOLUTION-LOG.md).
