---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/06-renderer.md
generated: 2026-01-23T00:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
---

# Context: Topic 06 — Renderer

## What the Spec Requires

1. Renderer is a pure sink (I15) — no creative logic, motion, layout, or color decisions
2. RenderFrameIR contains passes, each pass is `{ kind: 'drawPathInstances'; op: DrawPathInstancesOp }`
3. DrawPathInstancesOp combines: PathGeometryTemplate (local-space) + PathInstanceSet (world-space SoA) + PathStyle
4. PathGeometryTemplate references topology by numeric ID, has Float32Array points and pointCount
5. PathTopologyDef: immutable verbs + pointsPerVerb, registered at compile time
6. PathInstanceSet: SoA parallel arrays (positionsWorld, rotations, scales, optional scales2)
7. PathStyle: FillSpec | StrokeSpec discriminated unions with solid/gradient/none
8. Topology registry: numeric array indexed by topologyId (O(1) lookup, no hash maps)
9. Built-in topologies pre-registered: circle, rectangle, regular polygon, line segment
10. Batching: Each DrawPathInstancesOp IS a batch; sort passes by (layer, blend mode)
11. Layer system: LayerConfig with id, order, blend, optional clip
12. Culling: View frustum culling before batching, cull offscreen instances
13. RenderBackend interface: beginFrame, executePass, endFrame
14. Canvas2D backend: topology verbs + points -> Path2D per instance
15. SVG backend: geometry caching, defs/use pattern, DOM pooling
16. Temporal stability (I18): Old program continues until new ready, atomic swap, no blank frames
17. Pass-level prevalidation: topology exists, points buffer exists, pointsCount matches, instance arrays correct length
18. RenderError discriminated union with typed error kinds
19. Fallback rendering: log error, render placeholder, continue with other passes
20. RenderDiagnostics: instanceCount, batchCount, drawCalls, culledInstances, frameTime, gpuTime
21. Visual debug modes: bounding boxes, batch coloring, overdraw, wireframe

## Current State (Topic-Level)

### How It Works Now

The renderer has two codepaths: a production v1 path (`RenderPassIR` with `kind: 'instances2d'`) and a prep v2 path (`RenderFrameIR_Future` with `DrawPathInstancesOp`). The v1 path is used in production: the ScheduleExecutor assembles passes via RenderAssembler, which resolves shapes/topologies/control points into `ResolvedShape`, then Canvas2DRenderer dispatches between primitive topologies (ellipse/rect with topology.render()) and path topologies (using verbs + control points). The v2 path exists as defined types and a renderer function but is not connected to the production pipeline. The SVG renderer only works with v2 frames.

### Patterns to Follow

- Renderer files are in `src/render/` (Canvas2DRenderer.ts, SVGRenderer.ts, future-types.ts)
- Shape/topology types in `src/shapes/` (types.ts, registry.ts, topologies.ts)
- RenderAssembler in `src/runtime/RenderAssembler.ts` bridges schedule execution to render IR
- Topology registration happens at module load (built-ins) and block lowering time (dynamic paths)
- The v2 types in future-types.ts represent the target architecture and are already close to spec

## Work Items

### WI-1: Migrate Topology Registry to Numeric Array

**Status**: WRONG
**Spec requirement**: "Topology registry: array indexed by topologyId. O(1), no hash maps, no string lookups."
**Files involved**:
| File | Role |
|------|------|
| src/shapes/types.ts | TopologyId type (currently `string`) |
| src/shapes/registry.ts | Map-based registry (needs array) |
| src/shapes/topologies.ts | Built-in topologies |
| src/blocks/path-blocks.ts | Registers dynamic topologies with string IDs |
| src/runtime/RenderAssembler.ts | Looks up topologies |
| src/render/Canvas2DRenderer.ts | Uses getTopology() |

**Current state**: TopologyId is `string`, registry is `Map<string, TopologyDef>`, getTopology does map.get(id).
**Required state**: TopologyId is `number`, registry is `PathTopologyDef[]`, getTopology returns topologies[id] with O(1) array access.
**Suggested approach**:
1. Change `TopologyId` from `string` to `number` (branded index type)
2. Replace `TOPOLOGY_REGISTRY: Map` with `const topologies: (TopologyDef | PathTopologyDef)[] = []`
3. Pre-register built-in topologies at indices 0, 1, ...
4. `registerDynamicTopology()` pushes to array and returns new index
5. All blocks store numeric ID instead of string
6. Update PathGeometry.topologyId, StepRender.shape.topologyId
**Risks**: Breaking change across many files; need to update all consumers of TopologyId
**Depends on**: none

### WI-2: Unify Production Frame to DrawPathInstancesOp

**Status**: PARTIAL
**Spec requirement**: "RenderFrameIR contains passes, each is `{ kind: 'drawPathInstances'; op: DrawPathInstancesOp }`"
**Files involved**:
| File | Role |
|------|------|
| src/runtime/ScheduleExecutor.ts | RenderPassIR, RenderFrameIR interfaces |
| src/runtime/RenderAssembler.ts | Assembles passes |
| src/render/Canvas2DRenderer.ts | Renders passes |
| src/render/future-types.ts | Target types (already defined) |

**Current state**: Production uses v1 (RenderPassIR with resolvedShape). V2 types exist but are not used in production pipeline.
**Required state**: Single RenderFrameIR with DrawPathInstancesOp as the pass type. RenderAssembler emits DrawPathInstancesOp directly.
**Suggested approach**:
1. Update RenderAssembler to emit DrawPathInstancesOp (already has all needed data)
2. Update Canvas2DRenderer to consume DrawPathInstancesOp only (v2 path already works)
3. Remove v1 types (RenderPassIR, ResolvedShape, ShapeDescriptor)
4. Integrate SVGRenderer with production pipeline
**Risks**: Large migration; must maintain working renderer during transition
**Depends on**: WI-1 (topology IDs must be numeric for PathGeometry.topologyId)

### WI-3: Add Layer System

**Status**: MISSING
**Spec requirement**: "Layers provide deterministic z-ordering: LayerConfig with id, order, blend, clip. Passes sorted by (layer, blend mode)."
**Files involved**:
| File | Role |
|------|------|
| src/render/future-types.ts | Add layer to PathStyle or DrawPathInstancesOp |
| src/render/Canvas2DRenderer.ts | Sort passes before rendering |
| src/blocks/render-blocks.ts | Add optional layer input to RenderInstances2D |

**Current state**: No layer concept exists. Passes render in emission order.
**Required state**: Each pass has a layer assignment. Renderer sorts by (layer.order, blend mode) before executing passes.
**Suggested approach**:
1. Define LayerConfig interface (id, order, blend, clip)
2. Add `layer?: LayerId` to DrawPathInstancesOp or PathStyle
3. In renderFrame, sort passes by (layer, blend) before drawing
4. Add default layer (order=0) for passes without explicit layer
**Risks**: Need to decide where layer lives (per-pass vs per-style); spec shows it in PathStyle
**Depends on**: WI-2 (operates on DrawPathInstancesOp)

### WI-4: Add View Frustum Culling

**Status**: MISSING
**Spec requirement**: "Instances outside the view are not rendered. Culling happens before batching."
**Files involved**:
| File | Role |
|------|------|
| src/render/Canvas2DRenderer.ts | Add culling before render loop |

**Current state**: All instances are rendered regardless of position.
**Required state**: Compute bounds for each pass/instance, skip offscreen content.
**Suggested approach**:
1. For each pass, compute AABB from positions + scale
2. Check intersection with viewport bounds (0,0,width,height)
3. Skip fully offscreen passes entirely
4. For partially visible passes, could cull individual instances (optimization)
**Risks**: Performance of culling check must be less than cost of drawing; for small instance counts culling may be slower
**Depends on**: none

### WI-5: Add RenderDiagnostics and Visual Debug Modes

**Status**: MISSING
**Spec requirement**: "RenderDiagnostics: instanceCount, batchCount, drawCalls, culledInstances, frameTime, gpuTime. Visual debug modes: bounding boxes, batch coloring, overdraw, wireframe."
**Files involved**:
| File | Role |
|------|------|
| src/render/Canvas2DRenderer.ts | Collect and report diagnostics |

**Current state**: Frame time is tracked in main.ts/HealthMonitor but not as structured render diagnostics. No visual debug modes.
**Required state**: Renderer reports structured diagnostics per frame. Optional visual debug overlays.
**Suggested approach**:
1. Define RenderDiagnostics interface
2. Accumulate counts during frame render (instances, passes, culled)
3. Add optional debug mode flag to renderFrame
4. Implement wireframe mode (stroke instead of fill)
5. Implement bounding box overlay
**Risks**: Performance impact of diagnostic collection in hot path
**Depends on**: WI-4 (culledInstances requires culling)

### WI-6: Add Typed RenderError and Fallback Rendering

**Status**: MISSING
**Spec requirement**: "RenderError discriminated union. On error: log, render placeholder (pink square), continue with other passes."
**Files involved**:
| File | Role |
|------|------|
| src/render/Canvas2DRenderer.ts | Error handling per pass |

**Current state**: Errors throw plain Error objects and abort rendering.
**Required state**: Typed errors caught per-pass, placeholder rendered, other passes continue.
**Suggested approach**:
1. Define RenderError type with all spec variants
2. Wrap each pass execution in try-catch
3. On error, render pink square at pass center, log structured error
4. Continue rendering subsequent passes
**Risks**: Silent failures could hide bugs; need good error surfacing in UI
**Depends on**: none

### WI-7: Formal RenderBackend Interface

**Status**: MISSING
**Spec requirement**: "`interface RenderBackend<TTarget> { beginFrame, executePass, endFrame }`"
**Files involved**:
| File | Role |
|------|------|
| src/render/Canvas2DRenderer.ts | Refactor to implement interface |
| src/render/SVGRenderer.ts | Already class-based, adapt to interface |

**Current state**: Canvas2DRenderer is a function (renderFrame), SVGRenderer is a class. No shared interface.
**Required state**: Both implement `RenderBackend<TTarget>` with beginFrame/executePass/endFrame.
**Suggested approach**:
1. Define RenderBackend interface in render/types.ts
2. Refactor Canvas2DRenderer to class implementing RenderBackend<CanvasRenderingContext2D>
3. Adapt SVGRenderer to implement RenderBackend<SVGSVGElement>
4. Update consumers to use interface
**Risks**: API change for main.ts and other consumers of renderFrame
**Depends on**: WI-2 (passes must be DrawPathInstancesOp for executePass)
