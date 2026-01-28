# Definition of Done: Camera Block Implementation

## Acceptance Criteria

### 1. Type System
- [ ] `cameraProjection` is added to the `PayloadType` union
- [ ] `PAYLOAD_STRIDE['cameraProjection'] === 1` (scalar slot, not multi-stride)
- [ ] `canonicalType('cameraProjection', { unit: undefined })` (no numeric unit; it is an enum-like payload)
- [ ] Camera numeric inputs use existing payload+unit exactly:
  - [ ] `centerX`, `centerY`: payload `float`, unit `norm01`
  - [ ] `distance`, `near`, `far`: payload `float`, unit `scalar`
  - [ ] `tiltDeg`, `yawDeg`, `fovYDeg`: payload `float`, unit `deg`

### 2. IR Types
- [ ] `CameraDeclIR` exists and contains exactly 9 slot references:
  - [ ] `projection: ValueSlot`
  - [ ] `centerX: ValueSlot`
  - [ ] `centerY: ValueSlot`
  - [ ] `distance: ValueSlot`
  - [ ] `tiltDeg: ValueSlot`
  - [ ] `yawDeg: ValueSlot`
  - [ ] `fovYDeg: ValueSlot`
  - [ ] `near: ValueSlot`
  - [ ] `far: ValueSlot`
- [ ] `CompiledProgramIR` exposes `renderGlobals: readonly CameraDeclIR[]`
- [ ] When there is no Camera block, compilation produces `renderGlobals = []` (no implicit globals)

### 3. Camera Block
- [ ] Block registered with `type='Camera'`, 9 input ports, 0 outputs
- [ ] Port names match the IR fields exactly: `projection`, `centerX`, `centerY`, `distance`, `tiltDeg`, `yawDeg`, `fovYDeg`, `near`, `far`
- [ ] Port payload/unit/defaults match the camera spec exactly (no alternate encodings)
- [ ] `lower()` allocates 9 signal slots and emits schedule steps to evaluate each input each frame
- [ ] `lower()` registers the global declaration via the builder (single mechanism): `ctx.b.addRenderGlobal(cameraDecl)`
- [ ] Camera block is render-global (not per-instance): it does not create an InstanceId and does not produce any Field outputs

### 4. Compiler Pass
- [ ] Compiler collects camera globals from `renderGlobals` (produced via builder registration)
- [ ] 0 Camera blocks → `renderGlobals = []`
- [ ] 1 Camera block → `renderGlobals = [decl]`
- [ ] 2+ Camera blocks → compile error `E_CAMERA_MULTIPLE`

### 5. Frame Globals Resolution
- [ ] `resolveCameraFromGlobals(state, slotMeta, program.renderGlobals)` reads slots and returns `ResolvedCameraParams`
- [ ] Projection decode is discrete and deterministic:
  - [ ] `projI32 = (projectionValue | 0)`
  - [ ] `projection = (projI32 === 1) ? 'perspective' : 'ortho'` (only 0/1 are meaningful; all other integers map to ortho)
- [ ] Sanitization rules are applied exactly and tested:
  - [ ] `centerX`, `centerY`: clamp to `[0,1]`
  - [ ] `distance`: clamp to `(0, +inf)` with a concrete minimum epsilon (per spec)
  - [ ] `tiltDeg`, `yawDeg`, `fovYDeg`: degrees → radians conversion; `fovYDeg` clamped to safe range (per spec)
  - [ ] `near`, `far`: clamp to `(0, +inf)` and enforce `near < far` with deterministic fix-up (per spec)
  - [ ] NaN/Inf inputs: replaced with the corresponding default deterministically (per spec)
- [ ] When `renderGlobals = []`, the resolver returns the default camera (ortho identity) per spec

### 6. Assembler Integration
- [ ] `executeFrame` has NO `camera` parameter and NO camera-related override parameter
- [ ] `AssemblerContext` has NO camera field
- [ ] RenderAssembler obtains camera only from `ResolvedCameraParams` produced by frame-globals resolution
- [ ] Projection dispatch uses only the resolved projection enum (no float thresholding)
- [ ] Screen centering / camera center application happens in the assembler per spec

### 7. Hardcoded Removal
- [ ] No `PERSP_CAMERA_DEFAULTS` usage in `main.ts` or any hot-path execution code
- [ ] No `CameraStore.ts` (or equivalent UI state) controlling projection
- [ ] No Shift key camera preview/toggle path
- [ ] No toolbar button or viewer-side camera injection path
- [ ] The only way to enable perspective is via a Camera block in the patch

### 8. Tests
- [ ] Unit: Camera block compilation produces CameraDeclIR
- [ ] Unit: E_CAMERA_MULTIPLE diagnostic
- [ ] Unit: `cameraProjection` decoding: values {1, 0, -1, 2, 100, NaN, +Inf, -Inf} map deterministically to {perspective, ortho} per spec
- [ ] Unit: All 9 parameter sanitization rules (clamps + NaN/Inf defaults + near/far ordering) are covered
- [ ] Integration: Signal → slot write → resolved camera → correct projection kernel output (ortho vs perspective)
- [ ] Unit: Default camera values (no Camera block)
- [ ] Integration: Signal → slot → resolved camera → projection output
- [ ] Existing L1-L10 tests pass (updated for new API)
- [ ] All project tests pass (typecheck + test suite)

## Verification Method
- `npm run typecheck` passes
- `npm run test` passes (all existing + new camera tests)
- No runtime imports of CameraStore in main execution path
- grep confirms there is no camera parameter and no camera override parameter on `executeFrame`
