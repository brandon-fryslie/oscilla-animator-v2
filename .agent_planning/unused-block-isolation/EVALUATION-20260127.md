# Evaluation: Unused Block Error Isolation

**Topic**: Blocks whose output is not connected/used should not trigger compilation errors
**Date**: 2026-01-27
**Verdict**: CONTINUE

## Problem Statement

Currently, if a block has an error (e.g., invalid expression, type mismatch, missing input), the entire patch fails to compile - even if that block's output is never used by any render pipeline. This creates a poor authoring experience:

- Users can't experiment with broken blocks "off to the side"
- WIP blocks prevent the rest of the patch from running
- Debugging is harder because you can't see the working parts render

## Current Architecture Analysis

### Compilation Pipeline (Pass 1-7)

1. **Pass 6 (Block Lowering)**: Iterates through ALL blocks in dependency order (from SCC)
   - Every block is lowered, regardless of whether its output is used
   - Errors accumulate in an array
   - If ANY error exists → entire compilation fails (compile.ts:262-270)

2. **Pass 7 (Schedule Construction)**: Traces backward from render blocks
   - `findRenderBlocks()` identifies render sinks
   - `collectRenderTargets()` traces dependencies from render blocks
   - Only render-reachable blocks generate execution steps
   - BUT: This comes AFTER Pass 6 - errors already accumulated

### What We Have

- **Authoring validators** already detect disconnected blocks (W_GRAPH_DISCONNECTED_BLOCK)
- **Pass 7** already computes reachability from render blocks (used for scheduling)
- **Error accumulation** pattern means we can filter errors post-lowering

### What We Need

1. Compute reachability BEFORE Pass 6 (or reuse Pass 7 logic earlier)
2. Filter errors: keep only errors from reachable blocks
3. Still emit warnings for disconnected blocks (existing)
4. Optionally: skip lowering of unreachable blocks entirely (performance)

## Design Options

### Option A: Filter Errors Post-Pass6 (Minimal Change)

After Pass 6, compute reachability and filter `unlinkedIR.errors` to only include errors from reachable blocks. Non-reachable block errors become warnings.

**Pros**:
- Minimal code change
- Reuses existing Pass 7 reachability logic
- Safe (no behavioral change for reachable blocks)

**Cons**:
- Still does work lowering unreachable blocks (wasted computation)
- Reachability computed twice (once for filtering, once in Pass 7)

### Option B: Compute Reachability Before Pass 6 (Optimal)

Add a reachability pass between Pass 5 and Pass 6. Mark unreachable blocks. Pass 6 either:
- Skips lowering unreachable blocks entirely, OR
- Lowers them but tags errors as "from unreachable block"

**Pros**:
- Cleaner architecture
- Can skip lowering for performance
- Single reachability computation

**Cons**:
- More code to write
- Adds a new pass

### Option C: Lazy Lowering (Most Optimal)

Only lower blocks that Pass 7 requests. This requires restructuring the compilation flow.

**Pros**:
- Maximum performance (only compile what's needed)

**Cons**:
- Major refactor
- Pass 6/7 boundary becomes blurry
- Harder to reason about

## Recommendation

**Option A** for Sprint 1, with **Option B** as a follow-up optimization.

- Option A is safe, minimal, and solves the user problem
- We can refactor to Option B later if performance matters
- Option C is over-engineering for the current problem

## Implementation Approach

1. Extract reachability computation from Pass 7 into a reusable function
2. After Pass 6, compute set of "render-reachable" blocks
3. Partition errors:
   - Errors from reachable blocks → keep as errors (fail compilation)
   - Errors from unreachable blocks → convert to warnings (allow compilation)
4. Pass warnings to diagnostic system alongside errors
5. Add tests for:
   - Disconnected block with error → compiles with warning
   - Connected block with error → still fails compilation
   - Complex graph with mix of reachable/unreachable errors

## Affected Files

- `src/compiler/compile.ts` - Error filtering logic
- `src/compiler/passes-v2/pass7-schedule.ts` - Extract reachability (reuse)
- `src/compiler/reachability.ts` (new) - Reachability computation
- `src/compiler/__tests__/compile.test.ts` - New tests
- `src/diagnostics/types.ts` - May need new warning code

## Risks

1. **Unintended semantic change**: Users might rely on disconnected blocks failing compilation. Mitigation: Clear warning message explains the block was skipped.

2. **Partial compilation state**: If we allow partial success, runtime must handle missing outputs gracefully. Mitigation: Unreachable blocks don't appear in schedule, so runtime never references them.

3. **Debugging confusion**: Errors in disconnected blocks become warnings, user might miss them. Mitigation: Warning message is prominent, UI could highlight disconnected blocks.

## Confidence Assessment

**HIGH** - The approach is well-understood, the code paths are clear, and we have existing patterns to follow.
