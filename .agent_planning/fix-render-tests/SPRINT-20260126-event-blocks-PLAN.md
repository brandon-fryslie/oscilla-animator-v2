# Sprint: event-blocks - Fix Event Blocks Test Lookup Strategy
Generated: 2026-01-26
Confidence: MEDIUM: 4, HIGH: 0, LOW: 0
Status: RESEARCH REQUIRED

## Sprint Goal
Fix event-blocks.test.ts to correctly find and verify event signal values.

## Scope
**Deliverables:**
- Investigate event signal evaluation flow
- Update test lookup strategy to find event signals correctly
- Verify all 4 failing event tests pass

## Work Items

### P0: Investigate event signal flow
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Understand how eventRead signals are stored (slot vs offset mapping)
- [ ] Understand schedule step ordering for event evaluation
- [ ] Document the correct way to find event signal values in tests

**Unknowns to Resolve:**
- What slot type stores event-derived signals?
- Is `slotToOffset` mapping correct for event slots?
- Are `evalSig` steps the right place to look for event signals?

**Exit Criteria:**
- Clear understanding of event signal storage and lookup
- Documented approach for test fixes

### P1: Fix EventToSignalMask tests
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] `outputs 1.0 when pulse event fires` passes
- [ ] `outputs 1.0 every frame for pulse` passes

**Technical Notes:**
- Tests currently iterate over evalSig steps looking for value 1.0
- May need to use different slot lookup or different step types

### P2: Fix SampleHold tests
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] `latches input value when pulse trigger fires` passes
- [ ] `SampleHold output can drive downstream blocks` passes

**Technical Notes:**
- SampleHold depends on correct event signal lookup
- May also need to verify slot offset mapping

## Dependencies
- Requires understanding of event system internals

## Risks
- Event system may have changed significantly
- Test strategy may need fundamental rework
