---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-24T12:00:00Z
item_count: 0
---

# Topic 02: Block System — Items for Review

## Resolved

### R-3: Bus/rail as regular blocks instead of derived block meta
**Resolution**: User decided to REMOVE bus/rail from spec. Spec updated — DerivedBlockMeta now has 3 variants (defaultSource, wireState, lens). EdgeRole `busTap` also removed.

### R-4: BlockRole with extra top-level variants (timeRoot, bus, domain, renderer)
**Resolution**: User decided spec is MINIMUM. Spec updated — BlockRole definition now states implementations may extend with additional kinds.
