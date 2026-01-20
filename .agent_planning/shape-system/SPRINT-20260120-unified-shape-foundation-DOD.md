# Definition of Done: unified-shape-foundation

**Sprint:** Unified Shape Model Foundation
**Confidence:** HIGH

## Acceptance Criteria

### 1. Core Types Defined

- [ ] `TopologyId` type exists (string literal type)
- [ ] `TopologyDef` interface with id, params[], render function
- [ ] `ParamDef` interface with name, type, default
- [ ] `ShapeRef` interface with topologyId, paramSlots[]
- [ ] Types exported from `src/shapes/types.ts`

### 2. Built-in Topology Registry

- [ ] `TOPOLOGY_ELLIPSE` defined with params: rx, ry, rotation
- [ ] `TOPOLOGY_RECT` defined with params: width, height, rotation, cornerRadius
- [ ] `getTopology(id)` returns correct TopologyDef
- [ ] Registry is immutable (frozen objects)
- [ ] Default values specified for all params

### 3. Ellipse Block

- [ ] Inputs: rx (float), ry (float) with defaults
- [ ] Output: ShapeRef with topologyId='ellipse'
- [ ] ParamSlots created for rx, ry
- [ ] Rotation defaults to 0 (input optional for now)
- [ ] Compiles without errors
- [ ] Lowering produces correct IR

### 4. Rect Block

- [ ] Inputs: width (float), height (float) with defaults
- [ ] Output: ShapeRef with topologyId='rect'
- [ ] ParamSlots created for width, height
- [ ] Rotation and cornerRadius default to 0
- [ ] Compiles without errors
- [ ] Lowering produces correct IR

### 5. Render Pipeline

- [ ] ShapeRef or equivalent flows through IR
- [ ] Schedule carries topology + param slot refs
- [ ] Executor evaluates param values each frame
- [ ] Renderer receives topology + evaluated params

### 6. Canvas Rendering

- [ ] Renderer calls `topology.render(ctx, params)`
- [ ] Ellipse renders with `ctx.ellipse()` using actual rx, ry
- [ ] Rect renders with `ctx.fillRect()` using actual width, height
- [ ] NO hardcoded switch statements for shape types
- [ ] Visual: ellipse with rx≠ry shows correct aspect ratio
- [ ] Visual: rect with width≠height shows correct dimensions

### 7. Tests

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all existing tests)
- [ ] steel-thread.test.ts works with new shape model
- [ ] New unit tests for topology registry
- [ ] New unit tests for Ellipse/Rect block lowering

### 8. Demo

- [ ] main.ts demo uses Ellipse (not placeholder Circle)
- [ ] Demo renders correctly in browser
- [ ] Can change rx/ry and see visual difference

## Verification Commands

```bash
# Type check
npm run typecheck

# Run tests
npm test

# Run dev server and visually verify
npm run dev
```

## Not In Scope

- Path topology (separate sprint)
- Per-particle topology variation
- Stroke vs fill mode
- Path operators (trim, warp, boolean)
- Advanced morphing/interpolation

## Success Metric

The foundation is correct if adding a new shape (e.g., Triangle, Star) requires ONLY:
1. Defining a new TopologyDef
2. Registering it
3. Creating a block that outputs ShapeRef with that topologyId

No changes to: renderer, schedule, executor, IR types.
