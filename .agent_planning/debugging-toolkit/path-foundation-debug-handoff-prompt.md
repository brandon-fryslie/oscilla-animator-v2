 Handoff: Path Foundation - Debug Session

  Context

  We're implementing path-foundation - the ability to render polygon/path shapes instead of just circles/ellipses.

  What's Been Done

  1. Core Implementation Complete:
    - PathVerb enum, PathTopologyDef types in src/shapes/types.ts
    - DOMAIN_CONTROL intrinsics (index, position) in src/core/domain-registry.ts
    - ProceduralPolygon block in src/blocks/path-blocks.ts
    - polygonVertex kernel in src/runtime/Materializer.ts
    - Path rendering in src/render/Canvas2DRenderer.ts
    - Pipeline integration in pass7-schedule.ts and ScheduleExecutor.ts
    - Dynamic topology registration in src/shapes/registry.ts
  2. Bugs Fixed:
    - Instance inference now uses position field, not first instance (was showing 5 particles instead of 5000)
    - Removed silent fallbacks in renderer - now throws clear errors
  3. Current State:
    - Typecheck passes, all tests pass (426)
    - 5000 particles render (correct count)
    - But they render as circles, not pentagons
    - No error in console, no warning - silent failure somewhere

  The Bug

  ProceduralPolygon block creates:
  - shape output: SigExprShapeRef with topologyId='polygon-5' and controlPointField pointing to the computed vertex positions
  - controlPoints output: Field<vec2> with the 5 vertex positions

  When only shape is connected to Render block:
  - The controlPointField embedded in the SigExprShapeRef should be extracted by pass7
  - It should create a StepMaterialize for the control points
  - It should add controlPoints slot to StepRender
  - Executor should read the buffer and pass to renderer
  - Renderer should draw pentagons

  Somewhere in this chain, control points are not reaching the renderer. The renderer has a debug log that should print [Renderer] shape: ...
  controlPoints: ... but it's not appearing, suggesting either:
  - The render path isn't being called at all
  - The shape is resolving to legacy mode (number) before we get there

  Key Files to Investigate

  1. src/compiler/passes-v2/pass7-schedule.ts:344-356 - Where controlPointField is extracted
  2. src/runtime/ScheduleExecutor.ts:225-246 - Where controlPoints buffer is read
  3. src/render/Canvas2DRenderer.ts:78-85 - Debug logging (currently not firing)
  4. src/blocks/path-blocks.ts:184-189 - Where sigShapeRef is created with controlPointField

  Test Patch Setup

  1. Load "Original" demo patch
  2. Replace Ellipse block with ProceduralPolygon block
  3. Connect ProceduralPolygon.shape → Render.shape (only this connection)
  4. Expected: 5000 pentagons | Actual: 5000 circles

  Commits

  Recent relevant commits on master:
  - 9121f27 - fix(renderer): Render path shapes at particle positions
  - 9793fbd - fix(schedule): Infer render instance from position field
  - 18c0448 - fix(types): Align IR types with IRBuilderImpl
  - ca7ffc7 - feat(path): Complete path foundation

  Next Steps

  1. Add targeted logging to trace where control points get lost:
    - In pass7 resolveShapeInfo() - is controlPointField being extracted?
    - In pass7 buildContinuityPipeline() - is StepRender getting controlPoints?
    - In ScheduleExecutor - is the step present? Is slot populated?
  2. Or wait for debug tooling (Debug Probe, Compilation Inspector, Runtime Inspector, Patch Export) to make this systematic

  Resume Command

  /do:it path-foundation

  Continue debugging why control points aren't reaching the renderer.
  The path-foundation implementation is complete but pentagons render as circles.
  See .agent_planning/shape-system/ for full plans and handoff context.

