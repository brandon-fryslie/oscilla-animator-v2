---
topic: 06
name: Renderer
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/06-renderer.md
audited: 2026-01-23T00:00:00Z
has_gaps: true
counts: { done: 12, partial: 7, wrong: 2, missing: 7, na: 5 }
---

# Topic 06: Renderer

## DONE

- Renderer is sink, not engine (I15): Canvas2DRenderer.ts clearly states "Renderer is a pure sink" and performs no creative logic — src/render/Canvas2DRenderer.ts:8-9
- No creative motion/layout/color in renderer: All motion comes from patch, renderer only draws — src/render/Canvas2DRenderer.ts:11-12
- DrawPathInstancesOp interface defined: Full interface with geometry/instances/style separation — src/render/future-types.ts:151-163
- PathGeometry (local-space points + topology): Interface with topologyId, verbs, points, pointsCount — src/render/future-types.ts:89-104
- InstanceTransforms (world-space transforms): Interface with count, position, size, rotation, scale2 — src/render/future-types.ts:117-132
- PathStyle interface: Fill, stroke, opacity, blend rule support — src/render/future-types.ts:50-77
- PathVerb constants: MOVE=0, LINE=1, CUBIC=2, QUAD=3, CLOSE=4 — src/shapes/types.ts:100-111
- PathTopologyDef interface: verbs, pointsPerVerb, totalControlPoints, closed — src/shapes/types.ts:132-141
- Canvas2D backend renders paths: Uses verbs + control points to draw paths — src/render/Canvas2DRenderer.ts:231-317
- V2 renderer function exists: renderFrameV2 and renderDrawPathInstancesOp — src/render/Canvas2DRenderer.ts:329-467
- World->viewport transform (position): position * (width, height) — src/render/Canvas2DRenderer.ts:177, 402-403
- Scale uses min(width, height) for isotropy: D = Math.min(width, height) — src/render/Canvas2DRenderer.ts:240-241

## PARTIAL

- RenderFrameIR structure: Current v1 uses `RenderPassIR` with `kind: 'instances2d'` instead of spec's `RenderPassIR = { kind: 'drawPathInstances'; op: DrawPathInstancesOp }`. V2 (`RenderFrameIR_Future`) exists as separate type but not used in production — src/runtime/ScheduleExecutor.ts:36-39, src/render/future-types.ts:180-183
- PathInstanceSet (SoA layout): Current InstanceTransforms uses `position` (Float32Array) instead of spec's `positionsWorld`. Has `size` instead of `scales`. Missing: `scales` name convention — src/render/future-types.ts:117-132
- Topology registry uses string IDs (Map): Spec requires numeric IDs with O(1) array lookup. Implementation uses `Map<TopologyId, TopologyDef>` where `TopologyId = string` — src/shapes/registry.ts:19, src/shapes/types.ts:16
- RenderInstances2D block: Has positions, colors, shape, scale inputs but missing optional `rotations`, `geometry`, `layer` slots per spec — src/blocks/render-blocks.ts:122-171
- SVG backend: Implements `<defs>/<use>` pattern and geometry caching, but not integrated with production frame pipeline (only works with `RenderFrameIR_Future`) — src/render/SVGRenderer.ts:161-375
- Pass-level prevalidation: Validates topology and control points before hot loop, but does not check points count matches topology or instance array lengths — src/render/Canvas2DRenderer.ts:162-169
- Per-instance rotation and scale2: Implemented in Canvas2DRenderer for both v1 and v2 paths, but v1 RenderPassIR uses optional fields not yet populated by the production assembler — src/render/Canvas2DRenderer.ts:186-192

## WRONG

- Topology registry uses Map (string keys): Spec explicitly requires "O(1) numeric array lookup" with `const topologies: PathTopologyDef[] = []` and array indexing. Implementation uses `Map<TopologyId, TopologyDef>` with string keys — src/shapes/registry.ts:19-22
- PathGeometryTemplate divergence: Spec defines `PathGeometryTemplate` with `topologyId: number`, `points: Float32Array`, `pointCount: number`. Implementation's `PathGeometry` in future-types uses correct fields but the production `RenderPassIR` uses `resolvedShape` which embeds verbs directly from topology rather than referencing by numeric ID — src/runtime/ScheduleExecutor.ts:78-81 vs spec

## MISSING

- Layer system: No `LayerConfig`, `LayerId`, or layer ordering/sorting implemented. Passes are rendered in emission order, not by layer priority — spec: "Lower order renders first"
- Culling: No view frustum culling or bounds checking for offscreen instances — spec: "Instances outside the view are not rendered"
- Batching/sorting by (layer, blend mode): No pass sorting or state-change minimization logic — spec: "Sort passes by (layer, blend mode)"
- RenderDiagnostics interface: No `instanceCount`, `batchCount`, `drawCalls`, `culledInstances`, `frameTime`, `gpuTime` diagnostic structure in the renderer — spec: Render diagnostics
- Visual debug modes: No bounding boxes, batch coloring, overdraw, or wireframe modes — spec: Visual Debug Modes
- RenderError discriminated union: No typed render error structure with `invalid_geometry`, `topology_not_found`, `points_count_mismatch`, etc. Errors are thrown as plain Error objects — spec: Render Errors
- Fallback rendering (pink square on error): No placeholder rendering when a pass fails — spec: "Render placeholder (pink square, error marker)"

## N/A

- Per-Instance Shapes (drawPathInstancesField): T3 future, Field<shape2d> not implemented — spec explicitly marks as "T3, Future"
- WebGL/WebGPU backend: T3 future — spec explicitly marks as "Future, T3"
- Capability negotiation (BackendCaps): T3 future — spec explicitly marks as "T3, Future"
- Temporal stability / atomic swap: Involves hot-swap runtime coordination. Crossfade exists in continuity system but not in renderer frame swap — spec: partial T2/T3 concern
- Buffer persistence across hot-swap: Involves runtime hot-swap; continuity system handles some of this — spec: relates to runtime hot-swap
