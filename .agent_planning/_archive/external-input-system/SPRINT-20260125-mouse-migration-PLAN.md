# Sprint: mouse-migration - Mouse Migration

Generated: 2026-01-25
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125.md

## Sprint Goal

Migrate mouse input from hardcoded ExternalInputs interface to the generic channel system, adding mouse button and wheel support.

## Scope

**Deliverables:**
- App writes smoothed mouse to channels: mouse.x, mouse.y, mouse.over
- Add mouse button channels: mouse.button.left.down (pulse), .held (value), .up (pulse)
- Add mouse wheel channels: mouse.wheel.dx, mouse.wheel.dy (accum)
- Remove hardcoded ExternalInputs interface
- Delete mouse switch in evaluator
- Move smoothing to write-side only

## Work Items

### P0: App writes smoothed mouse to channels

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.1
**Status Reference:** EVALUATION-20260125.md - "UI thread maintains mouseSmoothX/Y"

**Acceptance Criteria:**
- [ ] App layer (main.ts or AnimationLoop.ts) writes to writeBus instead of ExternalInputs
- [ ] writeBus.set('mouse.x', smoothedX) called on mousemove
- [ ] writeBus.set('mouse.y', smoothedY) called on mousemove
- [ ] writeBus.set('mouse.over', mouseOver ? 1 : 0) called on enter/leave
- [ ] Smoothing calculated at write-side before writing to bus
- [ ] Mouse following behavior unchanged from user perspective

**Technical Notes:**
- Find where updateSmoothing() is called and where external.mouseX is set
- Replace with writeBus.set() calls
- Keep smoothing logic but apply before writing

---

### P1: Add mouse button channels

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.1
**Status Reference:** EVALUATION-20260125.md - "Mouse (Pulse): mouse.button.left.down"

**Acceptance Criteria:**
- [ ] mousedown event handler calls writeBus.pulse('mouse.button.left.down')
- [ ] mouseup event handler calls writeBus.pulse('mouse.button.left.up')
- [ ] mousemove/frame handler calls writeBus.set('mouse.button.left.held', isDown ? 1 : 0)
- [ ] Same pattern for right button: mouse.button.right.down/up/held
- [ ] Pulse channels read 1 for one frame, then 0
- [ ] Held channel reads current state continuously

**Technical Notes:**
- Track button state in app layer (e.g., leftButtonDown boolean)
- On mousedown: set held=1, pulse down
- On mouseup: set held=0, pulse up
- Use event.button to distinguish left (0), right (2)

---

### P2: Add mouse wheel channels

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 7.1
**Status Reference:** EVALUATION-20260125.md - "Mouse (Accum): mouse.wheel.dx, mouse.wheel.dy"

**Acceptance Criteria:**
- [ ] wheel event handler calls writeBus.add('mouse.wheel.dx', event.deltaX)
- [ ] wheel event handler calls writeBus.add('mouse.wheel.dy', event.deltaY)
- [ ] Delta values normalize per frame (sum all wheel events between commits)
- [ ] Accum channels read total delta for frame, then 0 next frame
- [ ] Sign convention documented (positive = scroll down/right)

**Technical Notes:**
- wheel event provides deltaX and deltaY
- May need to normalize (some browsers use pixels, some use lines)
- Consider dividing by 100 to get reasonable 0-1 range values

---

### P3: Remove hardcoded ExternalInputs interface

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md (principle: no device-specific logic)
**Status Reference:** EVALUATION-20260125.md - "hardcoded mouse switch in evaluator"

**Acceptance Criteria:**
- [ ] ExternalInputs interface removed from RuntimeState.ts
- [ ] createExternalInputs() function removed
- [ ] updateSmoothing() function removed (smoothing now at write-side)
- [ ] RuntimeState.external is now ExternalChannelSystem (not ExternalInputs)
- [ ] SessionState.external is now ExternalChannelSystem
- [ ] All references to state.external.mouseX/smoothX etc. removed
- [ ] TypeScript compiles without errors

**Technical Notes:**
- This is breaking change to RuntimeState interface
- Update all imports and usages
- Tests may need updates

---

### P4: Delete mouse switch in evaluator

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 4.2
**Status Reference:** EVALUATION-20260125.md - "hardcoded switch statement for 3 mouse values"

**Acceptance Criteria:**
- [ ] SignalEvaluator 'external' case is single line: `return state.external.snapshot.getFloat(expr.which)`
- [ ] No references to 'mouseX', 'mouseY', 'mouseOver' literals in evaluator
- [ ] All external channel reads go through snapshot API
- [ ] Existing mouse-following patches work identically

**Technical Notes:**
- This should already be done in Sprint 1, but verify
- If not, do it now as part of cleanup

---

### P5: Move smoothing to write-side only

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 8
**Status Reference:** EVALUATION-20260125.md - "All smoothing is write-side"

**Acceptance Criteria:**
- [ ] Smoothing calculation happens in app layer before writeBus.set()
- [ ] No smoothing in SignalEvaluator or runtime
- [ ] Smoothing lerp factor configurable (default 0.05 per existing code)
- [ ] Raw mouse position not exposed (only smoothed)
- [ ] Smoothing state maintained in app layer (not RuntimeState)

**Technical Notes:**
- Current code has smoothX/smoothY in ExternalInputs
- Move that state to app layer (AnimationLoop or wherever mouse is handled)
- Write smoothed values to channels, not raw

---

## Dependencies

- Requires Sprint 1 (channel-infra) complete
- Requires Sprint 2 (block-surface) complete (for ExternalInput block)
- P0-P2 can be done in parallel
- P3 requires P0-P2 complete (need new system working first)
- P4 and P5 can be done with P3

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mouse event handling spread across files | Medium | Low | Centralize in one place |
| Smoothing behavior changes subtly | Low | Medium | Compare before/after visually |
| Wheel normalization inconsistent | Medium | Low | Test on multiple browsers |
| Button events don't fire in some contexts | Low | Low | Check event listener attachment |
