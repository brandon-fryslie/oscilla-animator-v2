# Implementation Context: P2-Remaining Critical Items

Generated: 2026-01-24T13:00:00Z

## C-2: vec3/shape2d PayloadType

### Key Files
- `src/core/canonical-types.ts` — PayloadType definition, PAYLOAD_STRIDE, strideOf()
- `src/blocks/instance-blocks.ts` — Layout block definitions (vec2→vec3 migration in progress)
- `src/runtime/FieldKernels.ts` — Field kernel implementations
- `src/runtime/Materializer.ts` — Field materialization pipeline
- `src/runtime/ScheduleExecutor.ts` — Frame execution

### Current Progress
- vec3 already in PayloadType union
- PAYLOAD_STRIDE already has vec3: 3
- BufferPool already supports vec3f32 format
- Working directory has uncommitted vec2→vec3 layout block changes
- Tests need updating to expect vec3 output from layouts

### Related Work
- 3D DoD Levels 1-4 define the full vec3 migration path
- Level 1 invariant: Float32Array(N*3) with z=0 from layouts

---

## C-8: EventPayload Design

### Key Files
- `src/runtime/RuntimeState.ts` — `eventScalars: Uint8Array` (current boolean flags)
- `src/runtime/ScheduleExecutor.ts` — Event clearing per frame (line ~216)
- `src/compiler/ir/types.ts` — `StepEvalEvent`, `EventSlotId`, `EventExprId`
- `src/types/index.ts` — Event-related types

### Architecture Notes
- Current: Uint8Array with 0/1 per event slot, cleared every frame
- Target: Map<EventSlotId, EventPayload[]> with data-carrying payloads
- Must preserve: "events fire for exactly one tick" semantics (spec §6.1)
- Must support: value, timestamp, source identification
- Consider: pre-allocated pools for EventPayload objects (hot path)

---

## C-9: RenderPassIR Migration

### Key Files
- `src/runtime/ScheduleExecutor.ts` — Currently produces `kind: 'instances2d'` RenderPassIR
- `src/runtime/RenderAssembler.ts` — v2 assembly path exists (assembleRenderFrame_v2)
- `src/render/future-types.ts` — Target DrawPathInstancesOp type definitions
- `src/render/Canvas2DRenderer.ts` — Backend consuming RenderPassIR
- Beads tracker: oscilla-animator-v2-ms5

### Migration Path
1. Ensure all rendering goes through v2 assembly
2. Update Canvas2DRenderer to consume DrawPathInstancesOp[] directly
3. Remove legacy instances2d format from RenderPassIR
4. Remove v1 assembly code path

---

## C-12: PathStyle Blend/Layer

### Key Files
- `src/render/future-types.ts` — PathStyle definition (line ~50)
- `src/runtime/RenderAssembler.ts` — buildPathStyle() function
- `src/render/Canvas2DRenderer.ts` — Style application

### Design Notes
- BlendMode maps to Canvas2D globalCompositeOperation
- LayerId enables depth/ordering control (separate from z-depth)
- Layer system (U-21) should be designed before implementing this
