---
parent: ../INDEX.md
topic: camera-projection
order: 18
tier: T2
---

# Camera & Projection

## Overview

Camera projection is a **kernel** (pure function) executed in RenderAssembler as a mandatory post-schedule stage. It is **NOT** a graph node. The projection kernel transforms `Field<vec3>` worldPosition into `Field<vec2>` screenPosition, `Field<float>` depth, and `Field<bool>` visible.

The Camera & Projection system provides:
- Two projection modes: orthographic (default) and perspective
- Optional Camera block for modulating projection parameters
- Momentary preview mode (Shift key) for inspecting 3D structure
- Contract-defined visibility and depth outputs for renderer

**Architectural position**: Camera projection is a RenderAssembler responsibility, executed after schedule completion but before renderer consumption. It is the final transformation in the world→screen pipeline.

---

## Projection Kernels

RenderAssembler has access to exactly **two projection kernels**. Both produce the same output contract.

### `projectWorldToScreenOrtho`

Orthographic top-down projection. This is the **system default**.

**Default parameters:**
- `center`: `vec3(0.5, 0.5, 1.0)` — world-space center point (z component is target distance for z-positioning, not used in ortho math)
- `orthoWidth`: `1.0`
- `orthoHeight`: `1.0`
- `near`: `0.01`
- `far`: `100.0`

**Identity proof requirement:**
For `z = 0.0` and default parameters:
```
screenX = worldX  (exact in IEEE 754 arithmetic)
screenY = worldY  (exact in IEEE 754 arithmetic)
```

This identity property ensures that layout computations (which produce world-space coordinates) translate directly to screen coordinates at z=0, preserving all layout math exactly.

**Transformation:**
```
screenX = (worldX - center.x) / orthoWidth + 0.5
screenY = (worldY - center.y) / orthoHeight + 0.5
depth = (worldZ - near) / (far - near)
visible = (depth >= 0.0 && depth <= 1.0 && screenX >= 0.0 && screenX <= 1.0 && screenY >= 0.0 && screenY <= 1.0)
```

### `projectWorldToScreenPerspective`

Perspective projection with camera position, tilt, yaw, and field-of-view.

**Preview defaults** (used for momentary Shift preview):
- `distance`: `2.0`
- `tilt`: `35°` (degrees from horizontal)
- `yaw`: `0°`
- `fovY`: `45°` (vertical field of view)
- `near`: `0.01`
- `far`: `100.0`
- `center`: `vec3(0.5, 0.5, 0.0)` — look-at target

**Activation:**
- Momentary Shift preview (hardcoded preview defaults)
- Camera block with `projection = 1` (parameters from Camera block ports)

**Transformation:**
Standard perspective projection matrix derived from camera position, orientation, and FOV. See [16-coordinate-spaces](./16-coordinate-spaces.md) for world-space conventions.

---

## Projection Output Contract

Both projection kernels produce the **same output contract**:

```typescript
interface ProjectionOutputs {
  screenPosition: Field<vec2>;  // over instanceId
  depth: Field<float>;          // over instanceId, range [0, 1], 0=near, 1=far
  visible: Field<bool>;         // over instanceId, false = do not draw
}
```

### `visible` Field Contract

**The `visible` field is a CONTRACT OUTPUT.** Renderers:
- **MUST** treat `visible = false` as "do not draw this instance"
- **MUST NOT** re-derive visibility from screen coordinates or depth
- **MUST NOT** apply additional culling beyond the projection kernel's determination

Rationale: Visibility determination is the projection kernel's responsibility. Re-deriving visibility in renderers would duplicate logic, create inconsistency, and violate single-enforcer principle.

---

## Camera Block

The **Camera block** is a render-side declaration block (same category as render sinks like StepRender). It declares modulation sources for camera parameters but does **NOT** produce outputs consumed by other nodes.

### Camera Block Rules

**Cardinality:**
- Exactly **0 or 1** Camera block per patch
- **2 or more** Camera blocks → compile error
- Rationale: Single camera source of truth. Multiple cameras only when multi-view render target model exists (future).

**Category:**
- Render-side declaration
- Not a compute node
- Not a source block

**Port Set** (all optional inputs, type `Signal<T>`):

| Port | Type | Default (if not connected) |
|------|------|---------------------------|
| `center` | `Signal<vec2>` | `(0.5, 0.5)` |
| `distance` | `Signal<float>` | `2.0` |
| `tilt` | `Signal<float>` | `35.0` (degrees) |
| `yaw` | `Signal<float>` | `0.0` (degrees) |
| `fovY` | `Signal<float>` | `45.0` (degrees) |
| `near` | `Signal<float>` | `0.01` |
| `far` | `Signal<float>` | `100.0` |
| `projection` | `Signal<int>` | `0` (0=ortho, 1=perspective) |

**Notes:**
- All inputs are modulatable (they accept time-varying signals)
- `center` is `vec2` (XY only); Z component derived from `distance` in perspective mode
- `projection` discriminates kernel: `0` = ortho, `1` = perspective
- Ortho mode uses `center.xy`, `orthoWidth`, `orthoHeight` (not `distance`, `tilt`, `yaw`, `fovY`)
- Perspective mode uses all parameters

### Camera Block Compilation

When a Camera block is present, the compiler emits:

```typescript
program.render.cameraDecl = {
  centerSlot: ValueSlot | null,
  distanceSlot: ValueSlot | null,
  tiltSlot: ValueSlot | null,
  yawSlot: ValueSlot | null,
  fovYSlot: ValueSlot | null,
  nearSlot: ValueSlot | null,
  farSlot: ValueSlot | null,
  projectionSlot: ValueSlot | null,
  // ortho-specific:
  orthoWidthSlot: ValueSlot | null,
  orthoHeightSlot: ValueSlot | null,
};
```

When **no** Camera block is present:
```typescript
program.render.cameraDecl = null;
```

Each slot corresponds to a connected input port. Unconnected ports → slot is `null`, use default value.

---

## RenderAssembler Camera Resolution

RenderAssembler resolves camera parameters using a **strict priority order**:

### Priority Order (highest to lowest)

1. **Momentary preview override** (Shift key held)
   - Uses hardcoded perspective preview defaults
   - Ignores Camera block and system defaults
   - **MUST NOT** change compilation, state, continuity, or export
   - Preview is ephemeral visualization only

2. **Camera block declaration** (if present)
   - Read declared slots from `program.render.cameraDecl`
   - Use per-slot defaults for null slots
   - Respects `projectionSlot` value: 0=ortho, 1=perspective

3. **System defaults** (no Camera block)
   - Orthographic identity projection
   - `projectWorldToScreenOrtho` with default parameters
   - **System defaults are RenderAssembler-owned constants**, NOT DefaultSource blocks

### Default Value Sources

**Camera block present, port not connected:**
Use the per-port default from the Camera Block Port Set table above.

**No Camera block:**
Use orthographic identity: `center=(0.5, 0.5, 1.0)`, `orthoWidth=1.0`, `orthoHeight=1.0`, `near=0.01`, `far=100.0`.

**Rationale:** System defaults are rendering constants, not schedulable values. Introducing DefaultSource blocks for camera defaults would pollute the schedule with render-only concerns.

---

## RenderAssembler Pipeline

RenderAssembler executes the following pipeline **after schedule completion** for each `StepRender` declaration:

### 1. Read Position Slots

```typescript
const positionXY: Field<vec2> = readSlot(stepRender.positionXYSlot);  // required
const positionZ: Field<float> | null = stepRender.positionZSlot
  ? readSlot(stepRender.positionZSlot)
  : null;
```

**Contract requirements:**
- `positionXYSlot`: must be `payload=vec2`, `cardinality=many(instanceId)`, required
- `positionZSlot`: must be `payload=float`, `cardinality=many(instanceId)`, optional
- If both present, `instanceId` must match (same cardinality dimension)
- Mismatched instanceIds → **compile error**

### 2. Compose World Position

```typescript
const worldPos: Field<vec3> = new Float32Array(instanceCount * 3);
for (let i = 0; i < instanceCount; i++) {
  worldPos[i * 3 + 0] = positionXY[i * 2 + 0];  // x
  worldPos[i * 3 + 1] = positionXY[i * 2 + 1];  // y
  worldPos[i * 3 + 2] = positionZ ? positionZ[i] : 0.0;  // z (default 0.0)
}
```

### 3. Resolve Camera Parameters

Execute priority order (preview override → Camera block → system defaults) to obtain:
- Projection kernel selection (`projectWorldToScreenOrtho` or `projectWorldToScreenPerspective`)
- All kernel parameters

### 4. Run Projection Kernel

```typescript
const { screenPosition, depth, visible } = projectionKernel(worldPos, cameraParams);
```

Produces `ProjectionOutputs` per contract.

### 5. Depth Ordering

See [Depth Ordering Contract](#depth-ordering-contract) below.

### 6. Assemble RenderFrameIR

Package `screenPosition`, `depth`, `visible`, shape, color, size, rotation, etc. into `RenderFrameIR` passes for renderer consumption.

---

## Depth Ordering Contract

The renderer **MUST** draw instances in **stable depth order** every pass.

### Ordering Rules

**Primary key:** `depth` (far-to-near)
- Larger `depth` values (farther from camera) drawn first
- Smaller `depth` values (nearer to camera) drawn last, overpainting farther objects

**Tie-break:** lane index (ascending)
- If `depth[i] == depth[j]`, lower lane index drawn first
- Ensures deterministic ordering

**Visibility:** `visible = false` lanes **MUST be skipped** (not drawn)

**Stability:** Equal-depth instances maintain relative order from lane index (stable sort required).

### Two-Phase Ordering

RenderAssembler performs a two-phase ordering strategy:

**Phase 1: Fast-path detection**
Check if `depth` array is already monotone decreasing (far-to-near):
```typescript
let alreadyOrdered = true;
for (let i = 1; i < instanceCount; i++) {
  if (visible[i] && visible[i - 1] && depth[i] > depth[i - 1]) {
    alreadyOrdered = false;
    break;
  }
}
```

If true, skip sorting (common case for flat layouts or stable camera).

**Phase 2: Stable permutation**
If not already ordered, compute stable sort permutation:
```typescript
const indices = new Uint32Array(instanceCount);
for (let i = 0; i < instanceCount; i++) indices[i] = i;

stableSort(indices, (a, b) => {
  if (!visible[a] && !visible[b]) return 0;
  if (!visible[a]) return 1;  // invisible to end
  if (!visible[b]) return -1;
  if (depth[a] !== depth[b]) return depth[b] - depth[a];  // far-to-near
  return a - b;  // tie-break by lane index
});
```

**Permutation storage:**
- **MUST** be preallocated (no per-frame allocation)
- Reuse same `Uint32Array` buffer across frames
- Reallocate only when `instanceCount` increases

**Rationale:** Depth ordering is renderer responsibility (it controls draw sequence), but RenderAssembler provides the ordering data. Preallocated permutation avoids GC pressure in the hot render loop.

---

## StepRender Contract (Updated)

```typescript
interface StepRender {
  positionXYSlot: ValueSlot;           // Field<vec2>, mandatory, cardinality=many(instanceId)
  positionZSlot: ValueSlot | null;     // Field<float>, optional, cardinality=many(instanceId)
  shapeSlot: ScalarSlotRef;            // shape2d handle, cardinality=one
  colorSlot: ValueSlot;                // Field<vec4> or Signal<vec4>
  sizeSlot: ValueSlot;                 // Field<vec2> or Signal<vec2>
  rotationSlot: ValueSlot | null;      // Field<float> or Signal<float>, optional
  // ... additional render properties
}
```

**Position contract:**
- `positionXYSlot`: Required, `payload=vec2`, `cardinality=many(instanceId)`
- `positionZSlot`: Optional, `payload=float`, `cardinality=many(instanceId)`
- If both present, `instanceId` must match (compiler enforced)
- Mismatch → compile error

**See also:** [06-renderer.md](./06-renderer.md) for full StepRender specification.

---

## Forward Path

**Multiple cameras:** Only when multi-view render target model exists. Until then, 2+ Camera blocks is a **hard compile error**.

**Future multi-view model:** Each Camera block would target a named render view. RenderAssembler would execute projection per-view. Renderer would composite views. This requires:
- Render target / viewport system
- Camera→view binding
- Multi-pass rendering architecture

**Current model:** Single camera, single projection, single output canvas.

---

## Related Topics

- [16-coordinate-spaces](./16-coordinate-spaces.md) — World-space coordinate system and conventions
- [05-runtime](./05-runtime.md) — Schedule execution and value slot addressing
- [06-renderer](./06-renderer.md) — Renderer consumption of projection outputs
- [17-layout-system](./17-layout-system.md) — Layout kernels that produce world-space positions

## Key Terms

- **projectWorldToScreenOrtho** — Orthographic projection kernel (default)
- **projectWorldToScreenPerspective** — Perspective projection kernel (preview / Camera block)
- **Camera Block** — Render-side declaration block for modulating projection parameters
- **visible** — Contract output field indicating whether instance should be drawn
- **depth** — Normalized distance from camera, range [0, 1], 0=near, 1=far
- **depthSlot** — (historical term, now `depth` field in ProjectionOutputs)

## Relevant Invariants

- **I15** (Renderer is sink) — Renderer consumes projection outputs, does not produce them
- **I8** (Slot-addressed) — Camera parameter values resolved from slots at runtime
- **I1** (Single source of truth) — Exactly one camera, one projection result per frame
- **I4** (Single enforcer) — Visibility determined once by projection kernel, not re-derived by renderer

---

**Tier:** T2 (Structural) — Defines rendering pipeline structure and contracts.
