# Sprint: Schedule Access Pattern

**Generated:** 2026-01-25T13:21:00Z
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 30 minutes

## Sprint Goal

Replace ~60 'as any' casts for `program.schedule` access with a single `ScheduleIR` type assertion that works across all test files.

## Scope

**Deliverables:**
- Remove all `program.schedule as any` casts
- Properly type schedule access as `ScheduleIR` from pass7-schedule.ts
- Update all files accessing schedule properties (steps, stateSlotCount, etc.)

**Files affected:**
- `src/__tests__/event-blocks.test.ts`
- `src/__tests__/stateful-primitives.test.ts`
- `src/__tests__/EventEvaluator.test.ts`
- `src/__tests__/integration.test.ts`

## Work Items

### P0: Add ScheduleIR type assertion at schedule access point
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Import `ScheduleIR` type from `src/compiler/passes-v2/pass7-schedule.ts`
- [ ] Replace all `program.schedule as any` with `program.schedule as ScheduleIR`
- [ ] Or better: type the return value of compile() to expose schedule properly
- [ ] All tests pass without regression
- [ ] At least 30+ 'as any' casts eliminated per file

**Technical Notes:**
- `ScheduleIR` is the concrete type returned by pass 7 of the compiler
- The issue is that `CompileResult.program` types schedule as abstract
- Adding explicit cast once at access point solves all downstream casts in that file
- Consider: should `CompiledProgram` expose schedule with concrete type instead?

## Dependencies

- Category 1 (branded types) - can run in parallel, no dependencies

## Risks

- **Low:** ScheduleIR is already defined and used in pass 7
- **Medium:** If schedule type is intentionally hidden, cast location may need to move
- **Mitigation:** Check if `CompiledProgram` type should expose schedule as `ScheduleIR`

## Implementation Sequence

1. Import ScheduleIR in each affected file
2. Replace `program.schedule as any` with `program.schedule as ScheduleIR`
3. Run tests after each file
4. Consider whether to update `CompiledProgram` type definition instead

## Stretch Goal

If time permits, evaluate whether `CompiledProgram` type definition should expose schedule as concrete type, eliminating need for casts entirely.
