# Definition of Done: camera-block

## Functional Requirements

- [ ] Camera block exists in block registry with isActive + parameter inputs
- [ ] Camera block compiles to `CameraDeclIR` on the program
- [ ] RenderAssembler reads camera from program slots (not from executeFrame argument)
- [ ] `executeFrame` no longer accepts `camera?: CameraParams`
- [ ] Main.ts writes `camera.isActive` to external channel map
- [ ] Shift key activates perspective (via channel → ExternalInput → Camera block)
- [ ] Toolbar toggle activates perspective (same path)
- [ ] Default program includes Camera block wired to ExternalInput('camera.isActive')

## Quality Requirements

- [ ] All existing tests pass
- [ ] New unit test for Camera block lowering
- [ ] New unit test for CameraDeclIR resolution in assembler
- [ ] TypeScript compiles with no errors
- [ ] `npm run build` succeeds

## Verification

- [ ] App loads with perspective OFF by default
- [ ] Hold Shift → perspective activates (visual check)
- [ ] Release Shift → perspective deactivates
- [ ] Toolbar toggle → perspective persists
- [ ] Console shows no errors or warnings
- [ ] Camera parameters (distance, tilt, yaw, fov) produce correct visual when modified

## What This Does NOT Include

- Animated camera parameters (future — wire oscillator outputs to Camera inputs)
- Camera orbit/pan controls (viewer interaction — separate feature)
- Depth sorting in renderer (separate sprint)
- Visibility culling in renderer (separate sprint)
