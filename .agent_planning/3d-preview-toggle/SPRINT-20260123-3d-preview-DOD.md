# Definition of Done: 3d-preview-toggle

**Sprint:** 3d-preview-toggle
**Generated:** 2026-01-23

## Acceptance Criteria

### P0: CameraStore

- [ ] `CameraStore` class exists with MobX observables
- [ ] `isShiftHeld`, `isToggled` are observable booleans
- [ ] `isActive` is a computed getter (`isShiftHeld || isToggled`)
- [ ] `setShiftHeld(held)` and `toggle()` are MobX actions
- [ ] RootStore has `readonly camera: CameraStore`
- [ ] TypeScript compiles without errors

### P1: Viewer-side Projection

- [ ] `applyViewerProjection()` promotes vec2 → vec3 (z=0)
- [ ] Calls `projectInstances()` with perspective camera params
- [ ] Populates `screenPosition` (stride 2, normalized [0,1])
- [ ] Populates `screenRadius` (per-instance foreshortened size)
- [ ] Original `position` buffer is never mutated
- [ ] TypeScript compiles without errors

### P2: Renderer Uses screenPosition

- [ ] Canvas2DRenderer reads `screenPosition` when present
- [ ] Canvas2DRenderer reads `screenRadius` when present
- [ ] SVGRenderer reads `screenPosition` when present
- [ ] SVGRenderer reads `screenRadius` when present
- [ ] No regression when fields are absent (existing behavior preserved)

### P3: Animation Loop Wiring

- [ ] `store.camera.isActive` checked each frame after executeFrame
- [ ] Projection applied only when active
- [ ] Uses `PERSP_CAMERA_DEFAULTS` (tilt=35deg, distance=2.0, target=0.5,0.5,0)
- [ ] No recompilation triggered by toggle

### P4: Shift Key Listener

- [ ] Holding Shift activates 3D preview
- [ ] Releasing Shift deactivates 3D preview
- [ ] Works with window-level keydown/keyup events
- [ ] Cleanup on teardown (removeEventListener)

### P5: Toolbar Toggle Button

- [ ] "3D" button visible in toolbar
- [ ] Click toggles persistent 3D mode
- [ ] Visual indicator when active (highlighted/gradient)
- [ ] Tooltip shows "3D Preview (hold Shift)"
- [ ] Reactive to MobX state changes

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Hold Shift → animation shows tilted perspective view
- [ ] Release Shift → animation returns to flat top-down view
- [ ] Click toolbar "3D" button → persistent perspective view
- [ ] Click again → returns to flat view
- [ ] Both Shift and button work independently and together
- [ ] No console errors during toggle
- [ ] Animation continuity unaffected by toggle (no jumps/resets)
- [ ] Performance: < 1ms overhead for 5000-element patches
