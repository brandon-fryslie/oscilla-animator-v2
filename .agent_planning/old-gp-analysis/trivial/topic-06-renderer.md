---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: trivial
audited: 2026-01-23T12:00:00Z
item_count: 6
---

# Topic 06: Renderer — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- `PathGeometryTemplate` → `PathGeometry`: src/render/future-types.ts:89
- `PathInstanceSet` → `InstanceTransforms`: src/render/future-types.ts:117
- `positionsWorld` → `position`: src/render/future-types.ts:122
- `scales` → `size: number | Float32Array`: src/render/future-types.ts:125
- `scales2` → `scale2`: src/render/future-types.ts:131
- `pointCount` → `pointsCount`: src/render/future-types.ts:100
