# Evaluation: External Input System — Channel Map + Camera Block

**Date:** 2026-01-24
**Verdict:** CONTINUE — user resolved architectural questions

## Resolved Decisions

1. **Architecture**: Option D (Channels Map with commit step) — `state.externalChannels: Map<string, number>`
2. **Camera**: Normal/standard block with `isActive` boolean input (from channel map)
3. **Camera activation**: Block reads `isActive` from external channel → produces CameraParams when active, null when inactive
4. **Pattern**: Matches time system — channel values written at frame start, blocks read them via `sigExternal()`

## Scope

### Sprint 1: Channel Map Infrastructure
- Replace `ExternalInputs` interface with `externalChannels: Map<string, number>` (double-buffered)
- Update `SignalEvaluator` to read from map
- Add `sigExternal()` to IRBuilder
- Create `ExternalInput` block (generic channel reader)
- Wire mouse inputs through channel map (replaces hardcoded fields)
- Implement "Step 1: Sample inputs" in executeFrame

### Sprint 2: Camera Block
- Define Camera block with `isActive` boolean input + camera parameter inputs
- Camera block `lower()` emits signals that write to `program.render.cameraDecl`
- RenderAssembler resolves camera from program slots (not from executeFrame parameter)
- Remove `camera?: CameraParams` parameter from `executeFrame`
- Main.ts writes `camera.isActive` to channel map instead of constructing CameraParams directly
- Shift key / toolbar toggle remain as input sources writing to channel

## Risk Assessment

- **LOW**: Channel map is straightforward Map infrastructure
- **LOW**: ExternalInput block follows existing block patterns exactly
- **MEDIUM**: Camera block integration with RenderAssembler requires careful slot wiring
- **LOW**: Mouse migration is a direct port from hardcoded fields to named channels
