# 11 - Type 2 Parametric Foundation

Spec target: `../WebGPU-Complete/workstreams/slices/S03-first-type2-parametric.md`, `../WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`

// [LAW:one-type-per-behavior] Type 2 is not "more Type 1". It is a separate class with template topology in ShapeBank and per-instance control points in Arena.

## Where We Are

- The current recovery work is still focused on restoring one canonical Type 1/base path.
- The runtime taxonomy in `src/` still does not have a full class-specific execution model for Type 2.
- The active renderer assumptions still lean toward rigid/topology-fetch mental models rather than analytical vertex evaluation from template progression plus Arena control points.
- This means the repo does not yet have the correct foundation for Type 2, even if some lower-level base-path seams are being repaired.

## Foundation Goal

- Establish Type 2 as the next post-base class after the Type 1/base path has been validated.
- Encode the correct data contract:
  - ShapeBank stores template progression / topology metadata
  - Arena stores per-instance control points and dynamic params
  - vertex evaluation computes space analytically rather than consuming rigid CPU-realized geometry
- Build the compile/runtime/render seams needed for one first Type 2 slice without jumping ahead to the full family of parametric variants.

## Validation Gate Before Starting

- Do not begin this work immediately after `RECOVER-10` lands.
- First pause and validate the recovered base path end-to-end.
- Only start Type 2 foundation once the corrected Type 1/base-path ownership model has been deliberately validated and accepted as a stable base.

## First Draft Proposal

- Add Type 2 as an explicit shape class with its own compile/runtime/render contract.
- Treat Type 2 template topology as canonical ShapeBank data, not as rigid mesh payload.
- Route per-instance control points and dynamic parameters through canonical Arena ownership.
- Add the class-specific seams required for analytical vertex evaluation and compatible draw-prep bucketing.
- Do not collapse Type 2 into the Type 1 rigid path or the legacy realized-mesh compatibility path.
