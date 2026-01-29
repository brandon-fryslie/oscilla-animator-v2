# Plan Approval: Domain Transformation System

**Timestamp**: 2026-01-25T17:18:24Z
**Topic**: domain-transforms
**Status**: APPROVED (auto-approved per /do:it instructions)

## Overview

The original epic **oscilla-animator-v2-8m2** was reframed based on architectural guidance.

### What Changed

**Original**: "Domain Transformation System (Adapters)" - vague epic with incomplete stub
**Clarification**: User provided comprehensive spec for 6 core adapter blocks
**New Plan**: Phase-based implementation starting with cardinality transforms

### Key Guidance (from user)

1. **Domain transformations must be explicit** - never implicit compiler insertion
2. **6 core blocks** are the foundation beyond Broadcast:
   - Reduce, SampleFieldAt, ScatterToField (cardinality)
   - EventToSignalHold, SignalToEventCrossing (temporality)
   - Clock (time primitive)
3. **Each block carries explicit policy** - semantics nailed down, not guessed
4. **All transforms visible in IR** - for debugging and inspectability

## Sprints Approved

### ✅ Sprint 1: Reduce Block (Phase 1a)
- Status: **READY FOR IMPLEMENTATION**
- Confidence: **HIGH**
- Effort: 2-3 days
- Deliverable: Reduce block (many→one aggregation via mean/sum/min/max/rms/any/all)
- Files: SPRINT-1769356704-reduce-{PLAN,DOD,CONTEXT}.md

**Why start with Reduce**:
- Simplest of the 6 blocks
- No temporality complexity
- Closes the control loop with Broadcast
- High confidence path to unblock other work

### 📋 Sprint 2-3: SampleFieldAt & ScatterToField (Phase 1b-1c)
- Status: **PLANNED** (not included in this approval)
- Confidence: HIGH
- Effort: 2 days each
- Deliverable: Both cardinality-only transforms

### ⏸️ Sprint 4-5: EventToSignalHold & SignalToEventCrossing (Phase 2)
- Status: **BLOCKED** (needs schedule coordination spec)
- Confidence: MEDIUM
- Effort: 3-4 days
- Blocker: Must clarify when discrete events fire relative to continuous evaluation

### ⏸️ Sprint 6: Clock (Phase 3)
- Status: **BLOCKED** (needs TimeRoot design decisions)
- Confidence: MEDIUM
- Effort: 1-2 days
- Blocker: State management for phase accumulation

## Documentation Created

```
.agent_planning/domain-transforms/
├── EVALUATION-1769356704.md          # Problem analysis & reframing
├── DOMAIN-TRANSFORMS-SPEC.md         # Full architectural spec (6 blocks)
├── SPRINT-1769356704-reduce-PLAN.md  # Phase 1a implementation plan
├── SPRINT-1769356704-reduce-DOD.md   # Definition of Done
├── SPRINT-1769356704-reduce-CONTEXT.md  # Technical guidance
└── USER-RESPONSE-1769356704.md       # This file
```

## Next Steps

1. **Immediately**: Start Phase 1a (Reduce block implementation)
   - Follow SPRINT-1769356704-reduce-PLAN.md
   - ~2-3 days effort
   - HIGH confidence work

2. **After Reduce works**: Plan Phases 1b-1c (SampleFieldAt, ScatterToField)
   - Builds on Reduce infrastructure
   - Same pattern, slightly more complex

3. **Before Phase 2**: Resolve schedule coordination questions
   - When do events fire relative to continuous?
   - Update DOMAIN-TRANSFORMS-SPEC.md with answers
   - Then proceed with EventToSignalHold, SignalToEventCrossing

4. **Before Phase 3**: Clarify TimeRoot state management
   - How does Clock phase persist across hot reload?
   - Determine immutability requirements
   - Then proceed with Clock

## Success Criteria for Phase 1a

✅ All tests pass
✅ Reduce block compiles and runs
✅ Full graph with Broadcast→Reduce works
✅ No regressions in existing adapter tests
✅ Code follows project patterns

---

**Related Beads Item**: oscilla-animator-v2-8m2 (remains open until all phases complete)
