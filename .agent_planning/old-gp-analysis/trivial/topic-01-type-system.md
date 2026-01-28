---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: trivial
audited: 2026-01-23T12:00:00Z
item_count: 2
---

# Topic 01: Type System — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- `shape` → `shape2d`: src/core/canonical-types.ts:126 uses `'shape'` where spec says `'shape2d'`
- DEFAULTS_V0 structure uses constructor functions instead of plain objects (functional, correct behavior, cosmetic difference from spec's pseudocode)
