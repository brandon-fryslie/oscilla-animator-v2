# Sprint: runtime-instance-count - Fix Instance Count in Runtime

Generated: 2026-01-19
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Ensure instance count changes from Array block params are respected in runtime execution, not just compilation.

## Problem Summary

Based on diagnostic evidence:
- `[Compiler] Array#b2 created instance instance_0 with count=5000` ✅ Compiler reads param correctly
- UI → Store → Compiler chain verified working via ParamChanged and BlockLowered events
- **Gap**: Runtime execution may not respect new instance counts after recompile

## Root Cause Analysis

The evaluation identified three hypotheses for why visual changes don't appear:

| Hypothesis | Likelihood | Description |
|------------|------------|-------------|
| **Runtime state not recreated** | HIGH | When instance count changes, runtime buffers/state may not resize |
| **GridLayout overrides count** | MEDIUM | GridLayout rows×cols (71×71=5041) may cap visible instances |
| **Program swap incomplete** | LOW | Old program references may persist |

## Scope

**Deliverables:**
1. Verify instance count reaches schedule.instances with new value
2. Ensure runtime state (buffers) resize on instance count change
3. Add diagnostic logging to trace instance count through runtime

## Work Items

### P0: Trace Instance Count Through Runtime

**Acceptance Criteria:**
- [ ] Add logging in `main.ts` after recompile showing `schedule.instances` counts
- [ ] Add logging in `ScheduleExecutor` showing instance counts during execution
- [ ] Confirm whether new instance count reaches runtime execution

**Technical Notes:**
- Key file: `src/runtime/ScheduleExecutor.ts`
- Check `executeFrame()` - does it iterate correct number of instances?
- Check if `currentState` buffers are resized

### P1: Fix Runtime Instance Count Handling

**Acceptance Criteria:**
- [ ] Instance buffers resize when compiled instance count changes
- [ ] GridLayout respects Array block's instance count (doesn't override)
- [ ] Visual result shows correct number of elements after param change

**Technical Notes:**
- May need to recreate state buffers when instance counts differ
- Check `createRuntimeState()` in runtime initialization
- GridLayout should provide positions for however many instances exist

### P2: Verify End-to-End with Diagnostics

**Acceptance Criteria:**
- [ ] Change Array count 5000 → 100 in UI
- [ ] See `[Param] Array#b2.count: 5000 → 100` in Logs
- [ ] See `[Compiler] Array#b2 created instance instance_0 with count=100` in Logs
- [ ] Visual preview shows ~100 circles instead of ~5000

## Dependencies

- ParamChanged event emission (COMPLETED)
- BlockLowered event emission (COMPLETED)
- DiagnosticHub logging to LogPanel (COMPLETED)

## Risks

| Risk | Mitigation |
|------|------------|
| Buffer resize may drop state | Implement continuity-aware buffer resize |
| GridLayout has separate count | Verify GridLayout reads from same instance context |
| Hot-swap timing issues | Add synchronization if needed |

## Files to Modify

1. `src/main.ts` - Add post-recompile instance count logging
2. `src/runtime/ScheduleExecutor.ts` - Verify instance iteration
3. `src/runtime/index.ts` or state creation - Buffer resize logic
4. Possibly `src/blocks/layout-blocks.ts` - GridLayout instance handling

## Success Criteria

When changing Array block's `count` param from 5000 to 100:
1. Logs show ParamChanged event
2. Logs show BlockLowered with count=100
3. Visual canvas renders approximately 100 circles
4. FPS remains stable (no performance regression)
