# Slot System Simplification - Overview

**Generated**: 2026-01-25
**Topic**: slot-simplification

## Executive Summary

The slot/stride/slotMeta system has accumulated complexity through incremental additions. What should be simple "allocate, write, read" patterns have become tangled with dual code paths, scattered registration, and special cases.

**Total complexity identified:**
- 15+ files involved in slot handling
- 3 allocation methods doing similar things
- 4 places computing stride from payload
- 2 step types for writing signals (evalSig vs slotWriteStrided)
- 6 storage classes
- 10+ registration call sites
- Hardcoded slot 0 for time.palette

## Sprint Overview

| Sprint | Confidence | Status | Key Deliverable |
|--------|------------|--------|-----------------|
| unified-slots | HIGH: 4, MED: 2 | PARTIALLY READY | One allocSlot method, slotMeta at allocation time |
| single-write-path | HIGH: 1, MED: 3 | RESEARCH REQUIRED | One writeSlot step type, eliminate evalSig/slotWriteStrided |
| time-normalization | HIGH: 1, MED: 1, LOW: 1 | RESEARCH REQUIRED | Remove hardcoded slot 0, time flows through normal slots |

## Dependency Graph

```
unified-slots (FIRST)
    |
    +-----> single-write-path
    |           |
    |           v
    +-----> time-normalization
```

**unified-slots** is the foundation. It removes the scattered stride computation and registration, making subsequent simplifications possible.

**single-write-path** eliminates the dual execution path complexity. It depends on unified-slots because the new allocSlot provides stride information needed for unified writes.

**time-normalization** removes the last special case. It depends on both previous sprints because time needs unified allocation and unified write steps.

## Confidence Breakdown

### HIGH Confidence (Ready for /do:it)

1. **P0: Centralize Stride** - Mechanical deletion of duplicate switch statements
2. **P0: Unified allocSlot** - Clear design, straightforward implementation
3. **P1: Remove slotMeta from compile.ts** - Direct consequence of unified allocSlot
4. **P1: Update All Block Lowering** - Mechanical refactoring
5. **P0: Remove Reserved Slot 0** - Clear deletion target
6. **P2: Update pass7-schedule.ts** - Follows from single-write-path design

### MEDIUM Confidence (Research First)

1. **P2: Remove Continuity Allocation** - Need to determine proper type for continuity slots
2. **P2: Consolidate ValueRefPacked** - Need to audit all consumers
3. **P0: Design Unified Write Step** - Need compile-time vs runtime stride verification decision
4. **P1: Update IRBuilder for Write Steps** - Need to understand debug tap dependency
5. **P2: Update ScheduleExecutor** - Need performance benchmarks
6. **P1: Update InfiniteTimeRoot** - Need design for palette component handling

### LOW Confidence (Exploration Needed)

1. **P2: Remove SigExprTime Direct Access** - Performance and timeState dependencies unknown

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change to IRBuilder interface | HIGH | Comprehensive tests, incremental migration per block file |
| Performance regression from unified writes | MEDIUM | Benchmark before committing to design |
| Debug tap depends on removed methods | MEDIUM | Audit and design alternative before starting |
| Continuity system depends on untyped slots | MEDIUM | Audit before starting P2 |
| Time wrap detection breaks | LOW | Understand timeState before changing |

## What "Done" Looks Like

After all three sprints:

1. **ONE allocation method**: `allocSlot(type)` returns slot, stride, storage, offset
2. **ONE write step**: `writeSlot` handles scalar and multi-component
3. **NO special cases**: Time signals allocate and write like any other signal
4. **NO registration calls**: Slot metadata created at allocation time
5. **NO hardcoded slots**: Slot 0 is not special
6. **NO dual paths**: evalSig and slotWriteStrided are gone

Code becomes:
```typescript
// Block lowering
const { slot } = ctx.b.allocSlot(type);
const sigId = ctx.b.sigConst(value, type);
ctx.b.emitSlotWrite(slot, [sigId]);
return { out: { k: 'sig', id: sigId, slot, type } };

// Runtime execution
case 'writeSlot':
  for (let i = 0; i < step.inputs.length; i++) {
    state.values.f64[offset + i] = evaluateSignal(step.inputs[i]);
  }
```

## Files Generated

```
.agent_planning/slot-simplification/
├── EVALUATION-20260125.md                    # Current state analysis
├── OVERVIEW.md                               # This file
├── SPRINT-20260125-unified-slots-PLAN.md     # Sprint 1 plan
├── SPRINT-20260125-unified-slots-DOD.md      # Sprint 1 DoD
├── SPRINT-20260125-unified-slots-CONTEXT.md  # Sprint 1 implementation details
├── SPRINT-20260125-single-write-path-PLAN.md # Sprint 2 plan
├── SPRINT-20260125-single-write-path-DOD.md  # Sprint 2 DoD
├── SPRINT-20260125-single-write-path-CONTEXT.md # Sprint 2 implementation details
├── SPRINT-20260125-time-normalization-PLAN.md   # Sprint 3 plan
├── SPRINT-20260125-time-normalization-DOD.md    # Sprint 3 DoD
└── SPRINT-20260125-time-normalization-CONTEXT.md # Sprint 3 implementation details
```

## Next Steps

1. **Start with unified-slots sprint** - P0 work items are HIGH confidence
2. **After P0 complete**, block lowering updates can be parallelized
3. **Research questions** for single-write-path should be answered before starting
4. **Benchmark** time access performance before time-normalization
