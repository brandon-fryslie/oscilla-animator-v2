# Sprint: continuity-crossfade - Fix Continuity Crossfade Tests
Generated: 2026-01-26
Confidence: MEDIUM: 2, HIGH: 0, LOW: 0
Status: RESEARCH REQUIRED

## Sprint Goal
Fix continuity crossfade tests to correctly verify blend behavior.

## Scope
**Deliverables:**
- Investigate crossfade state initialization
- Fix mock setup in crossfade tests
- Verify both failing tests pass

## Work Items

### P0: Investigate crossfade behavior
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Understand what `slewBuffer.set([...])` represents
- [ ] Understand how `applyContinuity` reads old vs new values
- [ ] Understand when domain change triggers crossfade start

**Unknowns to Resolve:**
- Is `slewBuffer` the "old" values or something else?
- How does `applyContinuity` determine the crossfade source/target?
- Is the mock state setup correct for the expected behavior?

**Exit Criteria:**
- Clear understanding of crossfade state flow
- Documented correct mock setup

### P1: Fix linear crossfade test
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] `blends old and new buffers linearly over time window` passes
- [ ] Test correctly initializes old values (10, 20, 30)
- [ ] Test correctly expects lerp progression

**Technical Notes:**
- Test expects output at t=0 to be old values (10, 20, 30)
- Currently getting new values (100, 200, 300) instead
- May need to initialize slewBuffer differently

### P2: Fix smoothstep crossfade test
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] `uses smoothstep curve when specified` passes
- [ ] Smoothstep curve calculations are verified

**Technical Notes:**
- Same underlying issue as linear crossfade
- Once P1 is fixed, P2 should also work

## Dependencies
- Requires understanding of continuity state management

## Risks
- May require changes to mock setup strategy
- Crossfade semantics may have changed
