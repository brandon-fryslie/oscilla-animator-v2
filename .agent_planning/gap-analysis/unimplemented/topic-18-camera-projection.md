---
topic: 18
name: Camera & Projection
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/18-camera-projection.md
category: unimplemented
audited: 2026-01-24T00:00:00Z
item_count: 5
---

# Topic 18: Camera & Projection - UNIMPLEMENTED Items

## U-1: Camera Block Definition

**Spec requirement (lines 101-135):**
The Camera block is a render-side declaration block with 8 optional input ports:
- center (Signal<vec2>), distance (Signal<float>), tilt (Signal<float>), yaw (Signal<float>)
- fovY (Signal<float>), near (Signal<float>), far (Signal<float>), projection (Signal<int>)

**Status:** No Camera block exists in `src/blocks/`. Searched all block files -- no camera-related block definitions found. The golden test in `src/projection/__tests__/level10-golden-tests.test.ts` (line 641) explicitly marks this as "future feature" with `describe.skip`.

**Partial progress:** The `CameraDeclIR` type is defined in `src/compiler/ir/program.ts` (lines 45-56) and `renderGlobals` field exists on `CompiledProgramIR`, but it is always `[]` (line 534 of `src/compiler/compile.ts`).

---

## U-2: Compiler Enforcement of Camera Uniqueness (0 or 1 per patch)

**Spec requirement (lines 107-110):**
> Exactly 0 or 1 Camera block per patch
> 2 or more Camera blocks -> compile error

**Status:** No compiler pass validates camera block count. The `convertLinkedIRToProgram` function hardcodes `renderGlobals: []`. No block lowering pass handles camera blocks.

---

## U-3: RenderAssembler Camera Resolution Priority (Camera Block Path)

**Spec requirement (lines 166-196):**
Priority order: momentary preview override -> Camera block declaration -> system defaults.

**Status:**
- Momentary preview (Shift key): DONE (CameraStore + viewer-level camera param in ScheduleExecutor)
- Camera block path: UNIMPLEMENTED (no Camera block to read from)
- System defaults: DONE (ORTHO_CAMERA_DEFAULTS used when no camera param)

The RenderAssembler accepts a `camera?: CameraParams` parameter from the ScheduleExecutor, which comes from the viewer-level store. The Camera block -> slot reading path does not exist.

---

## U-4: StepRender positionXYSlot / positionZSlot Split

**Spec requirement (lines 204-217):**
```typescript
positionXYSlot: ValueSlot;        // Field<vec2>, mandatory
positionZSlot: ValueSlot | null;  // Field<float>, optional
```
Position must be split into XY (mandatory) and Z (optional) slots with matching instanceId validation.

**Status:** The implementation uses a single `positionSlot: ValueSlot` (src/compiler/ir/types.ts, line 460). The RenderAssembler promotes vec2 to vec3 by padding z=0, but there is no separate `positionZSlot` that can be independently connected.

**Impact:** Users cannot author depth as a separate Field<float> connected to Z. The implementation conflates XY and Z into a single position buffer. This also blocks the 2.5D profile (Topic 19) which requires independent Z authoring.

---

## U-5: Ortho Projection Parameters (center, orthoWidth, orthoHeight)

**Spec requirement (lines 32-36):**
Ortho default parameters include:
- center: vec3(0.5, 0.5, 1.0)
- orthoWidth: 1.0
- orthoHeight: 1.0
- near: 0.01
- far: 100.0

The spec formula is:
```
screenX = (worldX - center.x) / orthoWidth + 0.5
screenY = (worldY - center.y) / orthoHeight + 0.5
```

**Implementation (src/projection/ortho-kernel.ts):**
```typescript
export interface OrthoCameraParams {
  readonly near: number;
  readonly far: number;
}
// Identity: screenXY === worldXY
out.screenX = worldX;
out.screenY = worldY;
```

**Status:** The ortho kernel only has `near`/`far` params. It lacks `center`, `orthoWidth`, `orthoHeight`. The identity proof passes because the implementation skips the center/width/height transform entirely (hard-coded identity). When center != (0.5,0.5) or width/height != 1.0, the spec formula would produce different results.

**Note:** The identity proof IS satisfied for defaults, which is correct. But the kernel cannot handle non-default center/dimensions, which the Camera block would need.
