---
topic: 17
name: Layout System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 2
blocks_critical: []
---

# Topic 17: Layout System — Unimplemented

## Items

### U-30: Spiral layout kernel
**Spec requirement**: Spec mentions "Grid, Spiral, Random layouts". Spiral layout produces positions along a spiral pattern.
**Scope**: new kernel in FieldKernels.ts + block in instance-blocks.ts
**Blocks**: nothing — standalone additive
**Evidence of absence**: No spiralLayout kernel. Golden angle helper exists (fieldGoldenAngle) but is angle-only, not a full position layout.

### U-31: Random layout kernel
**Spec requirement**: Spec mentions "Grid, Spiral, Random layouts". Random layout produces random positions.
**Scope**: new kernel in FieldKernels.ts + block in instance-blocks.ts
**Blocks**: nothing — standalone additive
**Evidence of absence**: No randomLayout kernel. randomId intrinsic provides per-element random values but not random positions.
