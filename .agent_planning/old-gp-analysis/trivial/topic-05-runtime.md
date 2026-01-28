---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: trivial
audited: 2026-01-23T12:00:00Z
item_count: 2
---

# Topic 05: Runtime — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- Scalar storage: spec `Float32Array` → code `Float64Array` (higher precision, see R-6)
- State storage: spec `Map<number, Float32Array>` → code `Float64Array` (flat positional, faster)
