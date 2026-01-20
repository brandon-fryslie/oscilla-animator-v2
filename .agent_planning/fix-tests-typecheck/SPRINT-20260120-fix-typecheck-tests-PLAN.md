# Sprint: fix-typecheck-tests - Fix TypeScript and Test Failures

**Generated**: 2026-01-20
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Fix all 19 TypeScript compilation errors and 4 test failures. All issues are related to outdated test code that doesn't match current event type definitions.

## Scope

**Deliverables:**
1. Fix DiagnosticHub.test.ts to use correct event shapes
2. Add missing `progress` property to `EffectiveTime` interface
3. Implement or work around missing `getBySeverity`/`getByDomain` methods

## Work Items

### P0: Fix TypeScript compilation errors in DiagnosticHub.test.ts

**Acceptance Criteria:**
- [ ] All `GraphCommittedEvent` emissions include `reason` and `diffSummary`
- [ ] All `CompileBeginEvent` emissions include `trigger`
- [ ] All `CompileEndEvent` emissions use `status` (not `success`), `durationMs`, and `diagnostics` (not `errors`)
- [ ] TypeScript reports 0 errors in `DiagnosticHub.test.ts`

**Technical Notes:**
- Must create proper `Diagnostic` objects with all required fields
- Use helper functions to reduce repetition in test code

### P1: Add `progress` property to EffectiveTime interface

**Acceptance Criteria:**
- [ ] `EffectiveTime` interface includes `progress?: number`
- [ ] TypeScript reports 0 errors in `SignalEvaluator.ts`

**Technical Notes:**
- The `progress` field is used in `SignalEvaluator.ts:111` for time-based progress tracking
- Making it optional (`progress?: number`) is safe since the evaluator already uses `?? 0`

### P2: Fix tests that call missing methods (getBySeverity, getByDomain)

**Acceptance Criteria:**
- [ ] Tests for severity filtering pass
- [ ] Tests for domain filtering pass
- [ ] Either methods are added to DiagnosticHub OR tests use existing `filter()` method

**Technical Notes:**
- `DiagnosticHub` has a `filter(diagnostics, filter)` method that can filter by severity and domain
- Decision: Add convenience methods for cleaner API (matches test expectations)

## Dependencies

None - all changes are self-contained.

## Risks

| Risk | Mitigation |
|------|------------|
| Test logic was testing wrong behavior | Verify expected behavior matches spec before fixing |
| Breaking other tests | Run full test suite after changes |

## Implementation Order

1. First: Add `progress` to `EffectiveTime` (smallest change, unblocks typecheck)
2. Second: Fix event shapes in DiagnosticHub.test.ts
3. Third: Add convenience methods or update filter usage
4. Finally: Run full test suite to verify

## Success Metrics

- `npm run typecheck` passes with 0 errors
- `npm test` passes with 0 failures (excluding skipped tests)
