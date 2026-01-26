# Sprint: test-infra-fix - Fix Continuity Test Infrastructure

Generated: 2026-01-26T05:02:00
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Fix the test helper API mismatch and type errors that prevent crossfade tests from running correctly.

## Scope

**Deliverables:**
- Fixed `createMockRuntimeState` function signature
- Fixed type errors in `continuity-integration.test.ts`
- Passing crossfade tests (or clear indication if crossfade logic itself is broken)

## Work Items

### P0: Fix createMockRuntimeState signature [HIGH]

**Acceptance Criteria:**
- [ ] Function accepts `(overrides?: Partial<RuntimeState>, slotCount?: number)` OR uses object parameter
- [ ] All existing callers compile without errors
- [ ] Tests using custom continuity state actually use that state

**Technical Notes:**
- Current: `(slotCount: number = 100, overrides?: Partial<RuntimeState>)`
- Recommended: `(overrides?: Partial<RuntimeState>, slotCount: number = 100)` to match usage pattern
- OR: Use options object pattern: `(options: { slotCount?: number } & Partial<RuntimeState>)`

### P1: Fix type errors in continuity-integration.test.ts [HIGH]

**Acceptance Criteria:**
- [ ] `testInstanceId` returns `StableTargetId` compatible type
- [ ] `valueSlot(n)` returns proper `ValueSlot` type
- [ ] Lambda functions have correct return types
- [ ] `state.time` null checks added
- [ ] `npx tsc --noEmit` passes for the test file

**Technical Notes:**
- May need to create `testStableTargetId` helper
- May need to create `valueSlot` helper function
- Fix `state.time?.tMs` access pattern

### P2: Verify crossfade tests pass [HIGH]

**Acceptance Criteria:**
- [ ] "blends old and new buffers linearly over time window" passes
- [ ] "uses smoothstep curve when specified" passes
- [ ] All 17 continuity integration tests pass

**Technical Notes:**
- If tests still fail after P0/P1, escalate to Sprint 2 (crossfade logic fix)

## Dependencies

- None - this is foundational test infrastructure

## Risks

| Risk | Mitigation |
|------|------------|
| Changing helper signature breaks other tests | Search for all usages before changing |
| Crossfade logic is also broken | Proceed to Sprint 2 if tests still fail |
