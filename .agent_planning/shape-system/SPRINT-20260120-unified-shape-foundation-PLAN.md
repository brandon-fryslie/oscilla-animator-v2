# Sprint: unified-shape-foundation - Unified Shape Model Foundation

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

**Supersedes:** SPRINT-20260120-shape-fundamentals-PLAN.md (rejected - did not account for path extensibility)

## Sprint Goal

Implement the unified shape model (ShapeRef + TopologyDef) that works for ALL shapes: Ellipse, Rect, AND future Path. Build the foundation once, correctly.

## Core Design (from DESIGN-unified-shape-model.md)

**Key Insight:** All shapes = Topology (static, compile-time) + Fields (dynamic, runtime)

```typescript
interface ShapeRef {
  topologyId: TopologyId;      // What kind of shape (compile-time)
  paramSlots: SlotRef[];       // Where the dynamic params live (runtime)
}

interface TopologyDef {
  id: TopologyId;
  params: ParamDef[];          // name + type (float, vec2, etc.)
  render: RenderFn;            // How to draw it
}
```

**Built-in Topologies:**
- `TOPOLOGY_ELLIPSE`: params=[rx, ry, rotation], render=ctx.ellipse()
- `TOPOLOGY_RECT`: params=[width, height, rotation, cornerRadius], render=ctx.fillRect()

**Future Path Topologies:**
- Custom topologies with verbs[] + control points
- Same ShapeRef mechanism, more complex params

## Scope

**Deliverables:**
1. TopologyDef type and built-in topology registry
2. ShapeRef type as the output of shape blocks
3. Ellipse/Rect blocks output ShapeRef (not placeholder floats)
4. Renderer dispatches based on topology, not hardcoded switch
5. Param slots wired through schedule to renderer

## Work Items

### P0: Define Core Types

**Files:** `src/shapes/types.ts` (new), `src/shapes/topologies.ts` (new)

**Acceptance Criteria:**
- [ ] `TopologyId` type defined (string literal)
- [ ] `TopologyDef` interface defined with id, params[], render function
- [ ] `ParamDef` interface: name, type ('float' | 'vec2'), default
- [ ] `ShapeRef` interface: topologyId, paramSlots[]
- [ ] `SlotRef` type for referencing runtime param values

**Technical Notes:**
- Keep types simple and extensible
- Render function signature: `(ctx: CanvasRenderingContext2D, params: Record<string, number|vec2>) => void`

### P1: Built-in Topology Registry

**Files:** `src/shapes/topologies.ts`, `src/shapes/registry.ts` (new)

**Acceptance Criteria:**
- [ ] `TOPOLOGY_ELLIPSE` defined with params=[rx, ry, rotation]
- [ ] `TOPOLOGY_RECT` defined with params=[width, height, rotation, cornerRadius]
- [ ] `getTopology(id: TopologyId): TopologyDef` function
- [ ] Topologies are immutable, registered at module load
- [ ] Rotation defaults to 0, cornerRadius defaults to 0

**Technical Notes:**
```typescript
export const TOPOLOGY_ELLIPSE: TopologyDef = {
  id: 'ellipse',
  params: [
    { name: 'rx', type: 'float', default: 0.02 },
    { name: 'ry', type: 'float', default: 0.02 },
    { name: 'rotation', type: 'float', default: 0 },
  ],
  render: (ctx, p) => {
    ctx.ellipse(0, 0, p.rx, p.ry, p.rotation, 0, Math.PI * 2);
  }
};
```

### P2: Update Shape Blocks to Output ShapeRef

**Files:** `src/blocks/primitive-blocks.ts`

**Acceptance Criteria:**
- [ ] Ellipse.lower() creates ShapeRef with topologyId='ellipse'
- [ ] Rect.lower() creates ShapeRef with topologyId='rect'
- [ ] ParamSlots created for each shape parameter (rx, ry for ellipse; width, height for rect)
- [ ] ShapeRef passed through signal/field system
- [ ] Input signals (rx, ry, width, height) bound to param slots

**Technical Notes:**
- Rotation input can be added (defaults to 0)
- CornerRadius input can be added to Rect (defaults to 0)
- Shape output carries ShapeRef, not raw numbers

### P3: IR and Schedule Updates

**Files:** `src/compiler/ir/types.ts`, `src/compiler/passes-v2/pass7-schedule.ts`

**Acceptance Criteria:**
- [ ] ShapeRef representable in IR (or reference to it)
- [ ] Schedule knows which topology to use per render pass
- [ ] Param slot values evaluated and passed to render step
- [ ] Both Signal<shape> and Field<shape> work

**Technical Notes:**
- TopologyId is compile-time constant (known after lowering)
- Param values are runtime (evaluated each frame)
- Per-particle: each particle gets same topology, different param values

### P4: Renderer Uses Topology Dispatch

**Files:** `src/render/Canvas2DRenderer.ts`

**Acceptance Criteria:**
- [ ] Renderer receives ShapeRef or topology+params
- [ ] `getTopology(id).render(ctx, params)` called for each shape
- [ ] No hardcoded switch(shape) { case 0: ... }
- [ ] Per-particle rendering iterates and calls topology.render()
- [ ] Visual verification: ellipse and rect render correctly

**Technical Notes:**
- Renderer becomes topology-agnostic
- Adding new shapes = adding new TopologyDef, no renderer changes
- Position transform (translate) happens before topology.render()

### P5: Wire Through Schedule Executor

**Files:** `src/runtime/ScheduleExecutor.ts`

**Acceptance Criteria:**
- [ ] Executor evaluates param slot values each frame
- [ ] Passes topology + evaluated params to renderer
- [ ] Handles both uniform params (Signal) and per-particle params (Field)
- [ ] Performance acceptable (no major regression)

**Technical Notes:**
- Param evaluation follows existing signal/field evaluation patterns
- ShapeRef.paramSlots reference slots already in schedule

## Dependencies

- None (foundational work)

## Risks

| Risk | Mitigation |
|------|------------|
| Complexity creep from abstraction | Keep MVP minimal - just ellipse/rect, defer rotation/cornerRadius if needed |
| Breaking existing patches | Update main.ts demo simultaneously |
| Render function type safety | Use discriminated param object, test thoroughly |

## Test Plan

- [ ] Unit test: TopologyDef registry returns correct definitions
- [ ] Unit test: Ellipse block outputs ShapeRef with correct topologyId
- [ ] Unit test: Rect block outputs ShapeRef with correct topologyId
- [ ] Integration test: steel-thread compiles with unified shape model
- [ ] Visual test: Ellipses render with rx≠ry showing correct aspect ratio
- [ ] Visual test: Rectangles render with width≠height showing correct dimensions

## Future Work (NOT in this sprint)

- Path topology with verbs + control points
- Per-particle topology variation (different shapes per particle)
- Stroke vs fill mode
- Path operators (trim, warp, boolean ops)

## Why This Approach

The user correctly identified that treating Ellipse/Rect as special cases and Path as "something different" would lead to throwaway work. The unified model:

1. **Ellipse and Rect are just trivial topologies** - single verb, fixed param count
2. **Path uses the same mechanism** - just more params (control points as Field<vec2>)
3. **Renderer is topology-agnostic** - dispatch on TopologyDef, not hardcoded switch
4. **Extensible without rewrites** - new shapes = new TopologyDef registration
