# Sprint: camera-block — Camera as Standard Block with isActive Input

Generated: 2026-01-24
Confidence: HIGH: 3, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Make Camera a normal block with an `isActive` boolean input fed from the external input channel map. Remove the `camera?: CameraParams` hack from executeFrame.

## Scope

**Deliverables:**
- Camera block registered with isActive + parameter inputs
- Compiler emits `cameraDecl` on CompiledProgramIR
- RenderAssembler resolves camera from program slots (not executeFrame param)
- executeFrame `camera` parameter removed
- Main.ts writes `camera.isActive` to channel map

## Work Items

### P0: Camera block definition and registration

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `Camera` block registered with `capability: 'render'` (it controls rendering behavior)
- [ ] Input: `isActive` (float, 0/1, `exposedAsPort: true` — wirable from ExternalInput block)
- [ ] Input: `projection` (float, 0=ortho 1=perspective, `exposedAsPort: false`, default 1)
- [ ] Input: `distance` (float, default 2.0, `exposedAsPort: false`)
- [ ] Input: `tilt` (float, degrees, default 35, `exposedAsPort: false`)
- [ ] Input: `yaw` (float, degrees, default 0, `exposedAsPort: false`)
- [ ] Input: `fovY` (float, degrees, default 45, `exposedAsPort: false`)
- [ ] No outputs (Camera is a sink — it writes to render context, not signal graph)
- [ ] `lower()` emits camera declaration referencing input signal slots

**Technical Notes:**
- Camera is a **render-affecting block** — it doesn't produce signals, it configures rendering
- `isActive` is the key input: when 0, no projection applied (orthographic identity). When 1, perspective projection with the block's parameter values.
- `lower()` should emit a render declaration (new concept: `ctx.b.declareCameraParams(slots)`)
- Only one Camera block allowed per program (enforce at compile or warn)

### P1: Compiler camera declaration emission

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `CompiledProgramIR` gains `cameraDecl?: CameraDeclIR` field
- [ ] `CameraDeclIR` holds slot references for each camera parameter
- [ ] Compiler's render step collection populates `cameraDecl` from Camera block's lower output
- [ ] If no Camera block in graph, `cameraDecl` is undefined (system defaults apply)

**Technical Notes:**
- `CameraDeclIR` shape:
  ```typescript
  interface CameraDeclIR {
    isActiveSlot: Slot;
    projectionSlot: Slot;
    distanceSlot: Slot;
    tiltSlot: Slot;
    yawSlot: Slot;
    fovYSlot: Slot;
  }
  ```
- All slots are always present (block always has all params, even with defaults)
- Compiler resolves these from the Camera block's lowering output

### P2: RenderAssembler resolves camera from program slots

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] `assembleRenderPass` reads `program.cameraDecl` to get camera params
- [ ] If `cameraDecl.isActiveSlot` evaluates to 0, no projection (identity/ortho)
- [ ] If evaluates to 1, build `CameraParams` from slot values and project
- [ ] Camera defaults are: perspective, distance=2, tilt=35°, yaw=0°, fov=45°
- [ ] `AssemblerContext.camera` field removed (camera comes from program, not context)

**Technical Notes:**
- Read slots from `state.values.f64[slot.offset]` (same as other signal reads)
- `deriveCamPos(target, tilt, yaw, distance)` already exists in perspective kernel
- Convert degrees to radians for fovY and tilt

### P3: Remove executeFrame camera parameter + wire main.ts

**Confidence:** MEDIUM (integration risk — touches many call sites)

**Acceptance Criteria:**
- [ ] `executeFrame` signature loses `camera?: CameraParams` parameter
- [ ] All callers updated (main.ts, tests)
- [ ] Main.ts writes `camera.isActive` to channel map: `state.externalChannels.stage('camera.isActive', store!.camera.isActive ? 1 : 0)`
- [ ] Shift key and toolbar toggle both write to `camera.isActive` channel
- [ ] Visual behavior unchanged: Shift/toggle still activates perspective view

**Technical Notes:**
- Main.ts: remove `const camera: CameraParams | undefined = ...` block
- Instead: `state.externalChannels.stage('camera.isActive', store!.camera.isActive ? 1 : 0);`
- The Camera block in the default patch/graph reads this via ExternalInput('camera.isActive') → Camera.isActive
- Default patch needs a Camera block wired to ExternalInput (or Camera block defaults isActive to reading from channel)

#### Unknowns to Resolve
- How does the default patch/program get a Camera block? Does the default layout include one?
- If no Camera block in user's graph, isActive channel writes go nowhere — is that OK?

#### Exit Criteria
- Confirm default program template includes Camera block
- OR confirm that "no Camera block = no projection" is acceptable default behavior

## Dependencies

- Sprint 1 (channel-map) must be complete first — Camera block uses ExternalInput/channels

## Risks

- **Default program needs Camera block**: If the default patch doesn't include a Camera block, perspective won't work until user adds one. Mitigation: include Camera in default layout/program.
- **Single Camera block enforcement**: What if user places two Camera blocks? First-wins or error? Mitigation: compiler warns and uses first found.
- **Slot reading in assembler**: Need to verify assembler has access to signal state at the right time. The assembler runs after schedule execution, so slots should be populated.
