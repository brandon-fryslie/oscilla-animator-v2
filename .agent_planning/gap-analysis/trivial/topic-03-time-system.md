---
topic: 03
name: Time System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: trivial
audited: 2026-01-23T12:00:00Z
item_count: 1
---

# Topic 03: Time System — Trivial Gaps

- `TimeRoot` → `InfiniteTimeRoot`: spec says TimeRoot, code uses InfiniteTimeRoot (to distinguish from potential FiniteTimeRoot). src/blocks/time-blocks.ts:15
