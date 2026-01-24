# Definition of Done: camera-wiring

## P0: Wire camera into AssemblerContext

- [ ] `camera` field added to AssemblerContext literal in ScheduleExecutor.ts `render` case
- [ ] Existing tests still pass (no regression from optional param)
- [ ] New test: `executeFrame(program, state, pool, t, orthoCamera)` produces RenderPassIR with all four screen-space fields
- [ ] L5 invariant statement is demonstrably true: camera flows ScheduleExecutor → assembleRenderPass → projectInstances

## P1: Rewrite pipeline ordering test

- [ ] Old spy-based test removed or replaced
- [ ] New test: compile real patch → executeFrame with camera → verify screen-space output correctness
- [ ] Test proves ordering implicitly: correct output requires fields materialized before projection
- [ ] No Score Disqualifier #4 (simulated integration) patterns remain
- [ ] All L5 tests pass: `npm run test -- --run src/projection/__tests__/level5-assembler-projection.test.ts`

## Overall

- [ ] L5 status updated to "8/8 items at C3+"
- [ ] L5 invariant status updated to SATISFIED
- [ ] Review log entries added to DoD level file
