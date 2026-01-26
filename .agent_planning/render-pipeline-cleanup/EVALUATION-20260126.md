# Evaluation: Render Pipeline Technical Debt Cleanup (ms5)

**Date:** 2026-01-26
**Epic:** oscilla-animator-v2-ms5
**Verdict:** CONTINUE

## Executive Summary

The render pipeline is **mostly clean** with excellent v2 architecture. Of the 19 child beads, **11 are closed** and **8 remain open**. One bead is blocked (ms5.11). The remaining work falls into three categories:

1. **Quick cleanup** (P3-P4): Debug logging, future-types comments
2. **Feature completion** (P3): Golden angle config, expr DSL runtime, rotation/scale2 wiring
3. **Larger scope** (P2): v1→v2 final migration, intrinsics documentation

## Bead Status Analysis

### Closed (11)
- ms5.1: Wire OutputSpecIR contract or delete dead branch ✓
- ms5.2: Delete dead RenderCircle and RenderRect block definitions ✓
- ms5.3: Resolve TopologyId string/number type mismatch ✓
- ms5.4: Wire OutputSpecIR: compile render frame slot into program outputs ✓
- ms5.5: Replace dead RenderCircle/RenderRect with proper primitive render blocks ✓
- ms5.6: Unify TopologyId to numeric throughout the pipeline ✓
- ms5.7: Implement DrawPrimitiveInstancesOp for non-path topologies ✓
- ms5.10: Rate-limit deprecated signal kernel warnings ✓
- ms5.16: Fix shape payload placeholder in BufferPool and IR bridges ✓
- la0: Preallocate depth-sort permutation buffers (C-25) ✓

### Open (8)
| ID | Title | Priority | Confidence |
|----|-------|----------|------------|
| ms5.8 | Complete v1→v2 render pipeline migration | P2 | HIGH |
| ms5.9 | Remove .bak files and debug logging | P3 | HIGH |
| ms5.11 | Align intrinsics documentation (position, radius) | P2 | BLOCKED |
| ms5.12 | Replace FieldExprArray placeholder | P3 | LOW |
| ms5.13 | Make fieldGoldenAngle turns configurable | P3 | MEDIUM |
| ms5.14 | Fix StepRender.shape/scale optionality | P3 | MEDIUM |
| ms5.15 | Wire rotation and scale2 through IR | P3 | HIGH |
| ms5.17 | Implement PureFn 'expr' kind | P3 | MEDIUM |
| ms5.18 | Update future-types.ts migration comments | P4 | N/A - CLOSED |

### Blocked
- **ms5.11**: Blocked waiting on epic completion (circular dependency with parent). Can be unblocked by completing other P2 items first.

## Technical Findings

### 1. Debug Logging (ms5.9)
**Location:** `src/runtime/ContinuityApply.ts:346-453, 488, 533, 543`
**Finding:** 15+ console.log statements with `[Continuity]` prefix - clearly debug logging that should be removed.

**Location:** `src/runtime/RenderAssembler.ts:1117`
**Finding:** Single `console.warn` for instance not found - should be converted to proper error.

**No .bak files found** - that part is complete.

### 2. Rotation/Scale2 Wiring (ms5.15)
**Status:** Already fully implemented in RenderAssembler!
- `rotationSlot` and `scale2Slot` defined in `StepRender` interface
- Full implementation in `assembleRenderOps` at lines 762-853
- Slicing helpers at lines 923-979
- Depth sort compaction includes rotation/scale2

**Confidence:** HIGH - this bead may be closeable after verification.

### 3. StepRender Shape/Scale Optionality (ms5.14)
**Finding:** Types show `shape?` and `scale?` as optional in `StepRender`:
```typescript
readonly scale?: { readonly k: 'sig'; readonly id: SigExprId };
readonly shape?: ...
```

Need to verify: Does runtime enforce these are present? If so, make non-optional.

### 4. PureFn 'expr' Kind (ms5.17)
**Location:** `src/runtime/SignalEvaluator.ts:227-228`
```typescript
case 'expr':
  throw new Error(`PureFn kind 'expr' not yet implemented`);
```

This is the Expression DSL runtime - allows user-defined expressions to be compiled to PureFn. Medium complexity.

### 5. Golden Angle Turns (ms5.13)
**Location:** `src/runtime/FieldKernels.ts:384`
**Finding:** Hardcoded `turns=50` in golden angle calculation.
**Fix:** Add parameter to kernel signature, wire from block definition.

### 6. FieldExprArray Placeholder (ms5.12)
**Location:** `src/runtime/Materializer.ts:379`
**Finding:** TODO for custom element types - future feature, not blocking current functionality.

### 7. V1→V2 Migration (ms5.8)
**Status:** Exploration confirms v2 is complete:
- No legacy numeric shape encoding
- Full topology-based rendering
- Proper per-instance transforms
- Clean separation of concerns

**Remaining:** Audit for any stray v1 references, remove dead code if found.

### 8. future-types.ts (ms5.18)
**Finding:** File doesn't exist! Likely already removed or renamed. This bead can be closed.

## Recommendations

### Sprint 1: Quick Wins (HIGH confidence)
1. **ms5.9**: Remove debug logging (30 min)
2. **ms5.15**: Verify rotation/scale2 wiring complete, close if so (15 min)
3. **ms5.18**: Close - file doesn't exist (0 min)

### Sprint 2: Feature Completion (MEDIUM confidence)
1. **ms5.14**: Fix StepRender optionality types
2. **ms5.13**: Add turns parameter to fieldGoldenAngle
3. **ms5.17**: Implement PureFn 'expr' kind

### Sprint 3: Verification & Cleanup (HIGH confidence)
1. **ms5.8**: Final v1 audit and verification
2. **ms5.11**: Unblock and complete intrinsics documentation

### Deferred
- **ms5.12**: FieldExprArray - future feature, not blocking

## Questions Resolved

- **Are there .bak files?** No.
- **Is rotation/scale2 wired?** Yes, fully implemented.
- **Does future-types.ts exist?** No - bead can close.
- **Is v2 migration complete?** Yes, architecturally clean.

## Questions Remaining

- **ms5.15**: Need verification that block lowering actually emits rotationSlot/scale2Slot
- **ms5.14**: What's the actual runtime enforcement for shape/scale?
- **ms5.17**: What expression syntax does 'expr' kind need to support?
