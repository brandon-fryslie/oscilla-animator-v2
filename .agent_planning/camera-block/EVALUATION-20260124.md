# Camera Block Sprint Plan
Sprint: 2026-01-24

## Sprint Goal
Implement the Camera block as a first-class render-global declaration emitted by the compiler and resolved from ordinary signal slots each frame. Camera parameters are produced by normal signal evaluation steps and consumed by the render assembler via a deterministic frame-globals resolver. Remove all viewer-level/hardcoded camera injection paths.

## Background
The spec requires a Camera block with 9 input ports producing a CameraDeclIR render-global. The compiler must enforce uniqueness and the assembler must read resolved camera parameters from frame globals, not from external parameters or viewer-level toggles.

---

### P0: Type System Extensions (§1)

**Acceptance Criteria:**
- [ ] Add `cameraProjection` to the `PayloadType` union in `src/core/canonical-types.ts`
- [ ] Add `cameraProjection` to `PAYLOAD_STRIDE` with stride = 1
- [ ] Ensure unit kinds used by the Camera block exist exactly as: `norm01`, `scalar`, `deg`
- [ ] Ensure `canonicalType(...)` (and any helpers that construct `CanonicalType`) accepts payload `cameraProjection` with no unit

**Technical Notes:**
- `cameraProjection` is stored as numeric in a single f64 slot and interpreted as int32 via `projI32 = (value | 0)`.
- Projection decoding is deterministic: `projI32 === 1` => perspective, otherwise orthographic.
- There is no implicit adapter/coercion between `float` and `cameraProjection`.

---

### P0: Camera Block Definition (§2)

**Acceptance Criteria:**
- [ ] Register Camera block in `src/blocks/camera-block.ts` with 9 input ports:
  - projection: cameraProjection, one+continuous
  - centerX: float norm01, one+continuous
  - centerY: float norm01, one+continuous
  - distance: float scalar, one+continuous
  - tiltDeg: float deg, one+continuous
  - yawDeg: float deg, one+continuous
  - fovYDeg: float deg, one+continuous
  - near: float scalar, one+continuous
  - far: float scalar, one+continuous
- [ ] All ports have default constant sources matching spec defaults.
- [ ] No output ports.
- [ ] Uniqueness constraint: only 0 or 1 Camera blocks allowed.
- [ ] lower() allocates 9 ValueSlots (one per input port) and registers a `CameraDeclIR` render-global referencing those slots.

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
- [ ] Add `renderGlobals` field to `CompiledProgramIR` with type `readonly CameraDeclIR[]`
- [ ] Implement compiler pass that collects renderGlobals from IRBuilder
- [ ] Enforce uniqueness: 0 or 1 CameraDeclIR allowed, else emit E_CAMERA_MULTIPLE error

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
- [ ] Implement frame globals resolver module that runs after schedule execution and before render assembly
- [ ] Iterates `program.renderGlobals` and reads slots using slotMeta offsets
- [ ] Applies deterministic sanitization (§5.2):
    - Clamp distance, near, far, fovYDeg to spec ranges
    - Wrap yawDeg to [0,360)
    - projection: `projI32 = (val | 0)` then `projI32 === 1 ? 'persp' : 'ortho'`
    - radians: `deg * Math.PI / 180` for tilt/yaw/fovY
- [ ] Produces `ResolvedCameraParams` object consumed by assembler
- [ ] Applies default camera params only if no Camera block is present

**Technical Notes:**
- Defaults are applied ONLY when `program.renderGlobals` is empty.
- No-Camera-block default tilt is 0 (flat view); Camera block default tilt is 35° (tilted view). This is intentional.

---

### P0: RenderAssembler Integration (§6)

**Acceptance Criteria:**
- [ ] Remove `camera` parameter from `executeFrame`
- [ ] Remove `camera` field from `AssemblerContext`
- [ ] AssemblerContext gains required field `resolvedCamera: ResolvedCameraParams` and all projection code reads ONLY from this field
- [ ] All camera-dependent shader uniforms and calculations read from resolvedCamera

---

### P0: Remove Hardcoded Camera Paths

**Acceptance Criteria:**
- [ ] Remove all viewer-level camera injection paths (Shift preview, toolbar toggle)
- [ ] Remove usage of `PERSP_CAMERA_DEFAULTS` from main.ts and runtime
- [ ] Ensure perspective activation only via Camera block with `projection=1`

**Technical Notes:**
- This sprint removes viewer-level camera injection (Shift preview and toolbar toggle) entirely.
- After this change, the only way to get perspective is to add a Camera block to the patch and set `projection = 1` (or wire a signal into `projection`).

---

## Risks and Open Questions
- Clarify exact semantics of centerX/centerY vs existing camTarget in kernel
- Verify default camera parameter values and behavior
- Confirm removal of CameraStore or its migration to UI-only role feeding into Camera block inputs

---

## Deliverables
- Camera block source in `src/blocks/camera-block.ts`
- CameraDeclIR type and compiler pass updates
- Frame globals resolver module
- RenderAssembler updates
- Removal of executeFrame camera parameter and viewer toggles

---

## Timeline
Sprint duration: one week starting 2026-01-24

---

## References
- Spec document section 6 (Camera block)
- Existing codebase and planning docs

# Evaluation: camera-block
Timestamp: 2026-01-24
Git Commit: 108d2e9

## Executive Summary
Overall: 0% complete | Critical issues: 5 | Tests reliable: N/A (no camera-block tests exist)

The camera-block spec describes a comprehensive integration where camera becomes an ordinary block with 9 signal ports, stored in value slots, with a CameraDeclIR in CompiledProgramIR.renderGlobals. **None of this exists.** The current system uses a completely different architecture: a viewer-level CameraStore toggle that passes hardcoded `PERSP_CAMERA_DEFAULTS` as a function parameter through `executeFrame` into the RenderAssembler. This is the exact thing the spec says to remove.

A planning document exists at `.agent_planning/external-input-system/SPRINT-20260124-camera-block-PLAN.md` but it diverges from the spec in significant ways (isActive port, only 6 params vs 9, optional cameraDecl vs renderGlobals array, different IR shape). No implementation work has begun.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| Camera block in registry | NOT_STARTED | No "Camera" block type registered in src/blocks/ |
| CameraDeclIR type exists | NOT_STARTED | No type definition anywhere in codebase |
| renderGlobals on CompiledProgramIR | NOT_STARTED | Field does not exist |
| cameraProjection PayloadType | NOT_STARTED | Not in PayloadType union (src/core/canonical-types.ts:122-129) |
| Frame globals resolver | NOT_STARTED | No such module exists |
| executeFrame has no camera param | FAILS | executeFrame still accepts `camera?: CameraParams` (src/runtime/ScheduleExecutor.ts:50) |
| Assembler reads from frame globals | FAILS | Assembler reads from AssemblerContext.camera (RenderAssembler.ts:261) |

## Missing Checks
- Unit test: Camera block compilation with 9 signal ports producing CameraDeclIR
- Unit test: Compilation fails with E_CAMERA_MULTIPLE when 2 Camera blocks exist
- Unit test: cameraProjection enum sanitization (values 0,1,2,-1,NaN,Infinity)
- Unit test: All 9 camera param sanitization rules (clamp, wrap, min-max)
- Unit test: No-Camera-block default camera values match spec section 6.2
- Integration test: Camera signals flow through slot system and appear in resolved camera params
- Verification: executeFrame takes NO camera parameter

## Findings

### Type System: cameraProjection PayloadType
**Status**: NOT_STARTED
**Evidence**: `src/core/canonical-types.ts:122-129` - PayloadType union is `'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'bool' | 'shape'`. No `cameraProjection`.
**Issues**:
- Spec requires `cameraProjection` as a new PayloadType
- Spec requires integer conversion rule: `projI32 = (value | 0)` with fallback to ORTHO
- No unit model for `deg`, `norm01`, `scalar` kinds exists in a way that maps to port type constraints
- PAYLOAD_STRIDE table at canonical-types.ts:138 would need a new entry

### Camera Block Definition
**Status**: NOT_STARTED
**Evidence**: `src/blocks/` contains no file with "camera" in name. Grep for "Camera" in blocks/ returns zero matches.
**Issues**:
- No `Camera` BlockDef registered
- Spec requires 9 input ports (projection, centerX, centerY, distance, tiltDeg, yawDeg, fovYDeg, near, far)
- All ports must be `one+continuous` cardinality with appropriate PayloadTypes
- Each port needs a default source (Const blocks with spec-defined values)
- Block must have no outputs
- Uniqueness constraint: only 0 or 1 Camera blocks allowed

### CameraDeclIR and CompiledProgramIR.renderGlobals
**Status**: NOT_STARTED
**Evidence**: Grep for `renderGlobals`, `CameraDeclIR` across codebase returns only the spec file and planning docs. `src/compiler/ir/program.ts` CompiledProgramIR interface (lines 53-84) has no `renderGlobals` field.
**Issues**:
- CameraDeclIR type needs 9 ValueSlot fields (projectionSlot, centerXSlot, etc.)
- CompiledProgramIR needs `renderGlobals: readonly CameraDeclIR[]` with length 0 or 1 constraint
- Compiler pass needed to scan lowered results for Camera declarations and enforce uniqueness
- Error diagnostic E_CAMERA_MULTIPLE needed

### Lowering and Schedule Emission
**Status**: NOT_STARTED
**Evidence**: No Camera block definition exists, so no lower() function exists.
**Issues**:
- Camera block lower() must emit 9 StepEvalSig steps (one per port signal)
- Must produce ValueSlots that get referenced by CameraDeclIR
- Schedule ordering invariant: camera slots must be written before render assembly reads them
- Current scheduler (pass7-schedule.ts) has no concept of render globals

### Frame Globals Resolution
**Status**: NOT_STARTED
**Evidence**: No `FrameGlobals` type, no `ResolvedCameraParams` type anywhere in src/.
**Issues**:
- Spec requires per-frame resolution after schedule execution
- Must iterate program.renderGlobals and read slots using slotMeta offsets
- Deterministic sanitization rules (clamp, wrap, deg-to-rad conversions)
- Result stored as FrameGlobals for assembler consumption
- This is a new execution phase between schedule execution and render assembly

### RenderAssembler Integration (Removing camera parameter)
**Status**: NOT_STARTED (current code actively contradicts spec)
**Evidence**:
- `src/runtime/ScheduleExecutor.ts:50` - `executeFrame` takes `camera?: CameraParams`
- `src/runtime/ScheduleExecutor.ts:109-114` - AssemblerContext.camera set from executeFrame param
- `src/runtime/RenderAssembler.ts:253-262` - AssemblerContext has `camera?: CameraParams` field
- `src/main.ts:1057-1059` - Camera params hardcoded from PERSP_CAMERA_DEFAULTS with CameraStore.isActive toggle
**Issues**:
- executeFrame's camera parameter must be REMOVED (spec section 6.1)
- AssemblerContext.camera must be REMOVED
- Assembler must read resolved camera from frame globals
- Default camera (no Camera block) must be applied in frame globals resolver, not assembler

### CameraStore (viewer-level toggle)
**Status**: EXISTS but contradicts spec
**Evidence**: `src/stores/CameraStore.ts` - MobX store with isShiftHeld/isToggled/isActive
**Issues**:
- The spec says camera is a block with signal inputs. The current CameraStore is a viewer-level UI toggle.
- CameraStore itself may survive as a UI control that writes to an external input channel which feeds the Camera block's `isActive`-like input. However...
- The spec has NO `isActive` input on the Camera block. The spec says if no Camera block exists, default ortho is used. If a Camera block exists, its signals drive the projection.
- The planning doc invented `isActive` which doesn't exist in the spec.

### Current Hardcoded PERSP_CAMERA_DEFAULTS
**Status**: Must be REMOVED from main.ts usage
**Evidence**: `src/main.ts:27` imports PERSP_CAMERA_DEFAULTS, `src/main.ts:1058` uses it
**Issues**:
- Spec says camera defaults come from the Camera block's default sources
- PERSP_CAMERA_DEFAULTS as a module-level constant in perspective-kernel.ts is fine for tests/reference
- But main.ts should NOT be constructing CameraParams from this constant
- The kernel function signatures (camPosX/Y/Z, camTargetX/Y/Z) don't match the spec's parameter model (tiltDeg, yawDeg, distance, centerX, centerY)
- A translation layer (the sanitization/resolution step) must convert spec params to kernel params

## Ambiguities Found
| Area | Question | How LLM Guessed | Impact |
|------|----------|-----------------|--------|
| isActive input | Does Camera block have an isActive boolean input? | Planning doc added isActive port (not in spec) | HIGH - spec has no isActive; projection mode is the projection enum slot (0=ortho, 1=persp). If isActive is added, it contradicts the spec model where projection mode IS the activation mechanism. |
| centerX/centerY semantics | Spec says NDC centering post-projection. Current kernel has camTargetX/Y/Z world-space. | Planning doc omits centerX/centerY entirely | HIGH - spec has 9 ports, planning doc has 6 ports. Missing: centerX, centerY, near. The screen centering formula in spec 6.3 is different from world-space camera target. |
| Unit enforcement | Spec says ports have units (norm01, deg, scalar). How is this enforced at compile time? | Not addressed | MEDIUM - CanonicalType has unit axis but current PayloadTypes don't encode unit constraints in a way that prevents misuse |
| Default patch inclusion | Should default demo patches include a Camera block? | Planning doc asks this as unknown | MEDIUM - spec is silent on demos. Current patches have no Camera block. |
| PerspectiveCameraParams vs ResolvedCameraParams | Current kernel uses (camPos, camTarget, camUp, fovY, near, far). Spec uses (centerX, centerY, distance, tiltRad, yawRad, fovYRad, near, far, projection). | Not reconciled | HIGH - a derivation layer must translate spec params to kernel params. deriveCamPos() partially handles this but with different parameter names and semantics. |

## Planning Document Divergences from Spec

The existing planning document at `.agent_planning/external-input-system/SPRINT-20260124-camera-block-PLAN.md` has several significant deviations from the spec:

1. **isActive port**: Plan adds `isActive` (float 0/1) input. Spec has no such port -- the projection enum (0=ortho, 1=persp) IS the activation.
2. **Only 6 params**: Plan has (isActive, projection, distance, tilt, yaw, fovY). Spec has 9: (projection, centerX, centerY, distance, tiltDeg, yawDeg, fovYDeg, near, far).
3. **CameraDeclIR shape**: Plan uses `cameraDecl?: CameraDeclIR` (optional field). Spec uses `renderGlobals: readonly CameraDeclIR[]` (array, length 0 or 1).
4. **No sanitization**: Plan doesn't mention the deterministic sanitization rules (clamping, wrapping, deg-to-rad).
5. **No frame globals resolver**: Plan has assembler reading slots directly. Spec has a separate resolution phase.
6. **External input dependency**: Plan depends on "Sprint 1 (channel-map)" for ExternalInput blocks. Spec mentions no external input -- camera ports are wired like any other signal.

## Recommendations
1. **Discard the planning doc** -- it materially diverges from the spec on port count, IR shape, and activation model
2. **Add `cameraProjection` PayloadType** to canonical-types.ts with stride 1
3. **Add `CameraDeclIR` type** to compiler/ir/types.ts with all 9 slot fields
4. **Add `renderGlobals` field** to CompiledProgramIR
5. **Register Camera block** with exactly the 9 ports from spec section 2.2
6. **Create frame globals resolver** module that runs between schedule execution and render assembly
7. **Remove `camera` parameter** from executeFrame and AssemblerContext
8. **Bridge current PerspectiveCameraParams to ResolvedCameraParams** -- the deriveCamPos() function already handles tilt/yaw/distance, but centerX/centerY screen-space offset and the sanitization rules are new work

## Verdict
- [x] PAUSE - Ambiguities need clarification

### Questions needing answers:
1. **isActive**: The planning doc adds an isActive port not in the spec. Is camera activation done via the projection enum (spec model: ortho=0, persp=1) or via a separate boolean? This determines block port count (9 vs 10).
2. **CameraStore fate**: Once Camera is a block, does CameraStore survive as a UI control that somehow feeds into the Camera block? Or is it replaced entirely? The spec is silent on viewer-level toggles -- it only specifies the block-level signal system.
3. **centerX/centerY vs camTarget**: The spec's screen centering formula (section 6.3) is a POST-projection NDC offset. The current kernel uses world-space camera target. Are these different concepts coexisting, or does centerX/centerY replace camTarget?
4. **Default patch**: When no Camera block is in the graph, the spec says defaults apply (ortho, 2.0 distance, etc.). But the current UX has Shift-to-preview-perspective. How does perspective activation work in the new model without a Camera block in the patch?