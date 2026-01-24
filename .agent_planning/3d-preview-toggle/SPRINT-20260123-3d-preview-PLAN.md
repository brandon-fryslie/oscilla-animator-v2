# Sprint: 3d-preview-toggle - Shift-Hold & Toolbar 3D Preview

**Generated:** 2026-01-23
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add a viewer-only 3D perspective preview that activates via hold-Shift (momentary) or a toolbar toggle button (persistent). No recompilation, no runtime/continuity changes — pure viewer transform.

## Scope

**Deliverables:**
1. CameraStore (MobX observable for projection state)
2. Viewer-side projection (vec2→vec3 promotion + perspective kernel)
3. Renderer updates (use screenPosition when available)
4. Animation loop wiring (apply projection after executeFrame)
5. Shift key listener
6. Toolbar toggle button

## Work Items

### P0: CameraStore

**Files:** `src/stores/CameraStore.ts` (NEW), `src/stores/RootStore.ts`

**Acceptance Criteria:**
- [ ] `isShiftHeld: boolean` observable (tracks momentary shift-hold)
- [ ] `isToggled: boolean` observable (tracks toolbar button state)
- [ ] Computed `isActive: boolean` = `isShiftHeld || isToggled`
- [ ] `setShiftHeld(held: boolean)` action
- [ ] `toggle()` action (flips isToggled)
- [ ] Wired into RootStore as `readonly camera: CameraStore`

### P1: Viewer-side Projection Utility

**Files:** `src/render/viewerProjection.ts` (NEW)

**Acceptance Criteria:**
- [ ] `applyViewerProjection(frame: RenderFrameIR, camera: CameraParams): void`
- [ ] Promotes vec2 position (stride 2) to vec3 (z=0) per pass
- [ ] Calls `projectInstances()` from RenderAssembler
- [ ] Writes `screenPosition`, `screenRadius`, `depth`, `visible` onto each pass
- [ ] Does NOT mutate original `position` buffer (read-only)

### P2: Renderer Uses screenPosition

**Files:** `src/render/Canvas2DRenderer.ts`, `src/render/SVGRenderer.ts`

**Acceptance Criteria:**
- [ ] When `pass.screenPosition` is present, renderer uses it instead of `pass.position`
- [ ] When `pass.screenRadius` is present, renderer uses it for sizing instead of uniform `pass.scale`
- [ ] When neither is present, behavior is unchanged (no regression)
- [ ] Both renderers handle this identically

### P3: Animation Loop Wiring

**Files:** `src/main.ts`

**Acceptance Criteria:**
- [ ] After `executeFrame()`, check `store.camera.isActive`
- [ ] If active, call `applyViewerProjection(frame, perspCamera)`
- [ ] Uses `PERSP_CAMERA_DEFAULTS` from perspective-kernel
- [ ] No camera passed to `executeFrame()` itself (viewer-only path)

### P4: Shift Key Listener

**Files:** `src/main.ts`

**Acceptance Criteria:**
- [ ] `keydown` with `e.key === 'Shift'` sets `store.camera.setShiftHeld(true)`
- [ ] `keyup` with `e.key === 'Shift'` sets `store.camera.setShiftHeld(false)`
- [ ] Listeners cleaned up on teardown
- [ ] Works regardless of focus (window-level listener)

### P5: Toolbar Toggle Button

**Files:** `src/ui/components/app/Toolbar.tsx`

**Acceptance Criteria:**
- [ ] "3D" button visible in toolbar action buttons area
- [ ] Clicking toggles `store.camera.toggle()`
- [ ] Visual state reflects `store.camera.isActive` (highlighted when active)
- [ ] Tooltip explains Shift-hold shortcut
- [ ] Uses observer pattern (reactive to MobX state)

## Architecture Decision

**Viewer-side projection with vec2→vec3 promotion** rather than changing the pipeline to vec3 globally. Rationale:
- Matches spec: "Shift preview must not cause recompiles or IR changes; it should be a pure viewer transform"
- Minimal blast radius — no changes to Materializer, field kernels, or compilation
- Projection math is already implemented and tested in `src/projection/`
- The full vec3 pipeline migration (Level 5/6 DOD) is separate future work

## Not In Scope

- Changing position buffers to vec3 globally (separate migration)
- Passing camera through `executeFrame` → assembler (Level 5/6 DOD)
- Depth sorting or culling (Level 7)
- Camera parameter UI (tilt/yaw/distance sliders)
- Continuity changes
- SVG export with 3D
