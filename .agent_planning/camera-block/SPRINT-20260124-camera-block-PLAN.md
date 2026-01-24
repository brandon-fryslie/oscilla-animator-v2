# Sprint: camera-block - Camera Block Implementation
Generated: 2026-01-24
Confidence: HIGH: 7, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement the Camera block as a first-class render-global declaration emitted by the compiler and resolved from ordinary signal slots each frame. Camera parameters are produced by normal signal evaluation steps and consumed by the render assembler via a deterministic frame-globals resolver. Remove all viewer-level/hardcoded camera injection paths. per spec `design-docs/_new/3d/camera-v2/01-basics.md`

## Spec Reference
`design-docs/_new/3d/camera-v2/01-basics.md` — sections referenced as §N below.

## Work Items

### P0: Type System Extensions (§1)

**Acceptance Criteria:**
- [ ] Add `cameraProjection` to the `PayloadType` union in `src/core/canonical-types.ts`
- [ ] Add `cameraProjection` to `PAYLOAD_STRIDE` with stride = 1
- [ ] Ensure unit kinds used by the Camera block exist exactly as: `norm01`, `scalar`, `deg`
- [ ] Ensure `signalType(...)` (and any helpers that construct `SignalType`) accepts payload `cameraProjection` with no unit

**Technical Notes:**
- `cameraProjection` is stored as numeric in a single f64 slot and interpreted as int32 via `projI32 = (value | 0)`.
- Projection decoding is deterministic: `projI32 === 1` => perspective, otherwise orthographic.
- There is no implicit adapter/coercion between `float` and `cameraProjection`.

---

### P0: CameraDeclIR and CompiledProgramIR (§3)

**Acceptance Criteria:**
- [ ] `CameraDeclIR` interface with 9 ValueSlot fields (projectionSlot, centerXSlot, centerYSlot, distanceSlot, tiltDegSlot, yawDegSlot, fovYDegSlot, nearSlot, farSlot)
- [ ] `renderGlobals: readonly CameraDeclIR[]` added to CompiledProgramIR
- [ ] renderGlobals defaults to `[]` in all existing compilation paths (no Camera block = empty array)
- [ ] All existing tests pass (renderGlobals is additive)

**Technical Notes:**
- Add to `src/compiler/ir/program.ts` or `src/compiler/ir/types.ts` depending on where CompiledProgramIR lives
- renderGlobals.length constraint (0 or 1) is enforced by the compiler pass, not the type

---

### P0: Camera Block Definition (§2)

**Acceptance Criteria:**
- [ ] Camera block registered with type='Camera', category='render', capability='render'
- [ ] 9 input ports exactly matching spec §2.2 (projection, centerX, centerY, distance, tiltDeg, yawDeg, fovYDeg, near, far)
- [ ] Each port has correct PayloadType, unit, and default source value per spec
- [ ] projection port: `one+continuous<cameraProjection>`, default Const(0)
- [ ] centerX/Y: `one+continuous<float unit=norm01>`, defaults 0.5
- [ ] distance: `one+continuous<float unit=scalar>`, default 2.0
- [ ] tiltDeg: `one+continuous<float unit=deg>`, default 35.0
- [ ] yawDeg: `one+continuous<float unit=deg>`, default 0.0
- [ ] fovYDeg: `one+continuous<float unit=deg>`, default 45.0
- [ ] near: `one+continuous<float unit=scalar>`, default 0.01
- [ ] far: `one+continuous<float unit=scalar>`, default 100.0
- [ ] No outputs
- [ ] lower() allocates 9 ValueSlots (one per input port) and registers a `CameraDeclIR` render-global referencing those slots

**Technical Notes:**
- File: `src/blocks/camera-block.ts`
- Camera has no outputs; it is a render sink.
- lower() MUST:
  - allocate one `ValueSlot` per input port (projection, centerX, centerY, distance, tiltDeg, yawDeg, fovYDeg, near, far)
  - return a normal LowerResult with empty outputs
  - call `ctx.b.addRenderGlobal(cameraDecl)` where `cameraDecl: CameraDeclIR` references the 9 allocated slots
- lower() MUST NOT introduce bespoke evaluation logic; the compiler's normal wiring emits the evaluation steps that write these 9 slots each frame.

---

### P0: Compiler Pass - Camera Declaration Collection (§4.2)

**Acceptance Criteria:**
- [ ] Dedicated compiler pass (or extension to existing pass) scans lowered results for Camera block declarations
- [ ] Enforces uniqueness: >1 Camera block → compile error `E_CAMERA_MULTIPLE` with message "Only one Camera block is permitted."
- [ ] Sets `program.renderGlobals = []` if no Camera block
- [ ] Sets `program.renderGlobals = [cameraDecl]` if exactly one Camera block
- [ ] Schedule ordering: camera slot evaluation steps run before render assembly (natural consequence of signal phase ordering)

**Technical Notes:**
- IRBuilder owns a `renderGlobals` accumulator.
- The Camera block’s lower() registers its decl via `ctx.b.addRenderGlobal(decl)`.
- This pass validates `program.renderGlobals`:
  - 0 decls => `program.renderGlobals = []`
  - 1 decl  => `program.renderGlobals = [decl]`
  - 2+ decls => emit `E_CAMERA_MULTIPLE` and fail compilation.

---

### P0: Frame Globals Resolver (§5)

**Acceptance Criteria:**
- [ ] `ResolvedCameraParams` interface matching spec §5.1 (projection, centerX, centerY, distance, tiltRad, yawRad, fovYRad, near, far)
- [ ] `resolveCameraFromGlobals(program, state)` function that:
  - Iterates program.renderGlobals
  - If kind==='camera', reads 9 slots from state.values.f64 using slotMeta offsets
  - Applies deterministic sanitization (§5.2):
    - centerX/Y: clamp01
    - distance: max(val, 0.0001)
    - tiltDeg: clamp(-89.9, 89.9)
    - yawDeg: wrapDegrees ((d%360)+360)%360
    - fovYDeg: clamp(1, 179)
    - near: max(val, 0.000001)
    - far: max(val, near + 0.000001)
    - projection: `projI32 = (val | 0)` then `projI32 === 1 ? 'persp' : 'ortho'`
    - radians: `deg * Math.PI / 180` for tilt/yaw/fovY
  - Returns ResolvedCameraParams
- [ ] If renderGlobals is empty, returns default camera (spec §6.2)

**Technical Notes:**
- This runs AFTER schedule execution (all evalSig steps done) but BEFORE render assembly
- Default camera values match spec §6.2: ortho, center=(0.5,0.5), distance=2.0, tilt=0, yaw=0, fov=45°, near=0.01, far=100
- Defaults are applied ONLY when `program.renderGlobals` is empty.
- No-Camera-block default tilt is 0 (flat view); Camera block default tilt is 35° (tilted view). This is intentional.

---

### P0: RenderAssembler Integration (§6)

**Acceptance Criteria:**
- [ ] `executeFrame` signature: REMOVE `camera?: CameraParams` parameter
- [ ] `AssemblerContext`: REMOVE `camera` field
- [ ] After schedule execution, call `resolveCameraFromGlobals(program, state)` to get ResolvedCameraParams
- [ ] AssemblerContext gains required field `resolvedCamera: ResolvedCameraParams` and all projection code reads ONLY from this field
- [ ] Assembler uses resolvedCamera.projection to determine ortho vs perspective
- [ ] Assembler derives kernel params (camPosX/Y/Z, camTargetX/Y/Z, camUpX/Y/Z, fovY, near, far) from ResolvedCameraParams using the existing deriveCamPos pattern
- [ ] Screen centering (§6.3): after NDC projection, apply `screenX = (ndcX * 0.5 + centerX)`, `screenY = (-ndcY * 0.5 + centerY)`

**Technical Notes:**
- The existing `projectInstances()` function takes `CameraParams` discriminated union. Update it to take `ResolvedCameraParams` instead.
- The derivation from (tiltRad, yawRad, distance, centerX, centerY) to (camPos, camTarget, camUp) is what `deriveCamPos` in perspective-kernel.ts already does — reuse that math.
- Screen centering is a NEW concept not in current kernels. It's a post-projection adjustment.

---

### P0: Remove Hardcoded Camera Paths

**Acceptance Criteria:**
- [ ] `src/main.ts`: Remove `PERSP_CAMERA_DEFAULTS` import and usage at line 1057-1059
- [ ] `src/main.ts`: Update `executeFrame` call to not pass camera parameter
- [ ] `src/stores/CameraStore.ts`: Remove or repurpose (see note)
- [ ] `src/main.ts`: Remove Shift key listener for camera toggle (lines 1247-1256)
- [ ] `src/ui/components/app/Toolbar.tsx`: Remove or repurpose 3D button (lines 221-241)
- [ ] All existing tests updated to not pass camera parameter to executeFrame
- [ ] All 3D DoD L1-L10 tests updated for new API (resolveCameraFromGlobals instead of camera parameter)

**Technical Notes:**
- This sprint removes viewer-level camera injection (Shift preview and toolbar toggle) entirely.
- After this change, the only way to get perspective is to add a Camera block to the patch and set `projection = 1` (or wire a signal into `projection`).

---

## Dependencies
- None external. All required infrastructure (slots, signals, block registry, compiler passes) exists.

## Risks
- **Test update volume**: ~40+ tests reference the camera parameter on executeFrame. These all need updating.
- **Screen centering**: New math not in current kernels. Needs careful implementation to match spec §6.3.
- **Kernel param derivation**: Must bridge ResolvedCameraParams (tilt/yaw/distance model) to kernel's (camPos/camTarget/camUp model). deriveCamPos() exists but needs verification against spec semantics.
