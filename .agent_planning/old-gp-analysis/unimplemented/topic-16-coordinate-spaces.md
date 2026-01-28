---
topic: 16
name: Coordinate Spaces
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: unimplemented
audited: 2026-01-23T12:00:00Z
item_count: 2
blocks_critical: []
---

# Topic 16: Coordinate Spaces — Unimplemented

## Items

### U-26: z coordinate (3D world space)
**Spec requirement**: World space positions are vec3 (not vec2). "2D" is the special case z=0. Per 3D spec, positions must always be vec3.
**Scope**: Major — requires PayloadType vec3, layout outputs Field<vec3>, renderer consumes vec3 positions
**Blocks**: C-2 (vec3 PayloadType needed first)
**Evidence of absence**: Positions are vec2 throughout (layouts output vec2, renderer consumes vec2)

### U-27: Camera/projection system
**Spec requirement**: Explicit projection stage (orthographic default, perspective on Shift). Camera as RenderAssembler stage.
**Scope**: Major — new projection kernels, camera block, RenderAssembler projection stage
**Blocks**: U-26 (needs vec3 positions first)
**Evidence of absence**: No camera/projection code in src/
