---
topic: 17
name: Layout System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 2
priority_reasoning: circleLayout phase treated as [0,1] not radians; circleLayout missing input clamp.
---

# Topic 17: Layout System — Critical Gaps

## Items

### C-10: circleLayout phase treated as [0,1] not radians
**Problem**: The circleLayout kernel treats phase as [0,1] range for full rotation (formula: `angle = 2π * (t + phase)`). Spec says formula should be `angle = phase + 2π * t` where phase is in radians. A phase of π should rotate by π radians, but code interprets it as π full rotations.
**Evidence**: src/runtime/FieldKernels.ts:477 — `angle = TWO_PI * (indexArr[i] + phase)`
**Obvious fix?**: Partially — depends on R-5 (phase representation decision). If phase stays as unit:phase01, then current [0,1] cycle semantics ARE correct (spec needs updating). If phase becomes radians, change formula to `angle = phase + TWO_PI * indexArr[i]`.

### C-14: circleLayout does not clamp input t to [0,1]
**Problem**: Spec says first step is `t_i = clamp(t[i], 0, 1)`. Code uses indexArr[i] directly without clamping. While normalizedIndex is typically in [0,1], the kernel contract should enforce it for robustness (lineLayout correctly clamps at FieldKernels.ts:587).
**Evidence**: src/runtime/FieldKernels.ts:477 — no clamp on indexArr[i]
**Obvious fix?**: Yes — add `const t_i = Math.max(0, Math.min(1, indexArr[i]))` and use t_i in angle calculation.
