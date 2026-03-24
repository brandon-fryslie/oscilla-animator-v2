---
parent: INDEX.md
---

# Tier System

This specification uses a three-tier system based on change cost.

## The Question

For any piece of information, ask: **"How expensive would this be to change?"**

## The Tiers

| Tier | File Prefix | Meaning | Contents |
|------|-------------|---------|----------|
| **T1** | `t1_*.md` | Cannot change. Would make this a different application. | Core principles, invariants |
| **T2** | `t2_*.md` | Can change, but it's work. Affects many other things. | Architecture, type system, migration |
| **T3** | `t3_*.md` | Use it or don't. Change freely if something works better. | Examples, checklists, governance |

## Organization

- **Topics are directories**: Each topic (type-system, axes, validation, etc.) has its own directory
- **Tiers are file prefixes**: Within each topic, files are prefixed with `t1_`, `t2_`, or `t3_`
- **Not all topics need all tiers**: Some topics may only have foundational or structural content

## Conflict Resolution

**Lower tier number wins.**

If a `t3_*.md` file conflicts with a `t1_*.md` file, the t1 file wins. No exceptions.

## Reading Guide

For agents working with this specification:

- **Always read**: `**/t1_*.md` (all foundational content across all topics — small and critical, 4 files total)
- **Usually read**: `**/t2_*.md` (all structural content for relevant topics)
- **Consult as needed**: `**/t3_*.md` (reference material when you need specific details)

## This Specification's Tiers

```
principles/
└── t1_single-authority.md       # The core idea — cannot change

type-system/
├── t1_canonical-type.md         # The one true type — cannot change
├── t2_extent-axes.md            # 5-axis structure — hard to change
├── t2_derived-classifications.md # signal/field/event — hard to change
└── t3_const-value.md            # Literal details — change freely

axes/
├── t1_axis-invariants.md        # Axis rules — cannot change
├── t2_cardinality.md            # zero/one/many — hard to change
├── t2_temporality.md            # continuous/discrete — hard to change
├── t2_binding.md                # Binding tags — hard to change
├── t2_perspective.md            # Coordinate frames — hard to change
└── t2_branch.md                 # History lines — hard to change

validation/
├── t1_enforcement-gate.md       # Single gate + guardrails — cannot change
├── t2_axis-validate.md          # Implementation — hard to change
└── t3_diagnostics.md            # Error messages — change freely

migration/
├── t2_value-expr.md             # Unified IR — hard to change
├── t2_unit-restructure.md       # UnitType changes — hard to change
├── t2_adapter-restructure.md    # Adapter patterns — hard to change
├── t3_definition-of-done.md     # Checklists — change freely
└── t3_rules-for-new-types.md    # Governance — change freely
```
