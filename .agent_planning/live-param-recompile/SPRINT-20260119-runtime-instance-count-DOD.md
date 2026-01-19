# Definition of Done: Runtime Instance Count Fix

## Sprint: runtime-instance-count
Generated: 2026-01-19

## Acceptance Criteria

### 1. Diagnostic Tracing (P0)
- [ ] After recompile, log `schedule.instances` with instance ID and count
- [ ] In ScheduleExecutor, log instance count being executed
- [ ] Console shows clear trace from param change → compile → runtime

### 2. Instance Count Propagation (P1)
- [ ] When Array.count changes from 5000 → 100:
  - [ ] Compiler emits BlockLowered with count=100
  - [ ] schedule.instances shows count=100 for the Array's instance
  - [ ] Runtime executes exactly 100 iterations for field operations
- [ ] Runtime state buffers resize appropriately for new instance count
- [ ] No buffer overrun or underrun errors

### 3. Visual Verification (P2)
- [ ] Canvas shows approximately the correct number of circles
- [ ] Count reduction (5000 → 100) visibly reduces circle count
- [ ] Count increase (100 → 5000) visibly increases circle count
- [ ] Changes happen within 1 second of slider adjustment

### 4. Build & Tests
- [ ] `npm run build` passes with no errors
- [ ] All existing tests pass
- [ ] No new console errors or warnings

## Test Procedure

1. Start app with `npm run dev`
2. Open Logs panel
3. Observe initial: `[Compiler] Array#b2 created instance instance_0 with count=5000`
4. Select Array block in Flow editor
5. In Inspector, change `count` from 5000 to 100
6. Observe Logs:
   - `[Param] Array#b2.count: 5000 → 100`
   - `[Compiler] Array#b2 created instance instance_0 with count=100`
7. Observe Preview: circle count visibly reduced
8. Change count back to 5000
9. Observe Logs show count=5000
10. Observe Preview: circle count visibly increased

## Out of Scope

- Continuity/identity preservation during count changes (separate sprint)
- Animation smoothing during count transitions
- GridLayout param changes (focus is Array.count)
