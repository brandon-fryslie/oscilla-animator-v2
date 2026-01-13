# Handoff: Debugger Learning & MCP Improvement

**Created**: 2026-01-12 23:50
**For**: Future implementation work on Chrome DevTools debugging
**Status**: ready-to-start

---

## Objective

Establish Chrome DevTools debugger as the primary investigation tool for runtime issues, replacing console.log-based debugging. Learn the improved MCP tool interface and integrate it into standard debugging workflow.

## Current State

### What's Been Done
- ✅ Completed full Rete.js editor implementation (patch-editor-ui)
- ✅ All acceptance criteria met, tests passing
- ✅ Identified real bug in Hash block (cache all zeros after execution)
- ✅ Learned why print debugging is easier but slower than debugger
- ✅ Understood MCP tool philosophy: dynamic tools based on connection state
- ✅ Identified friction points with old chrome-devtools MCP

### What's In Progress
- 🔄 Testing improved cherry-chrome MCP with dynamic tool surface
- 🔄 Learning new tool signatures and workflow
- 🔄 Discovering what tools are available (tools list not yet visible to Claude)

### What Remains
- [ ] Get dynamic tools working properly (currently not discovering available tools)
- [ ] Complete Hash block bug investigation using debugger
- [ ] Document debugger workflow patterns
- [ ] Fix skipped tests in stateful-primitives.test.ts
- [ ] Establish best practices for when to use debugger vs. print statements

## Context & Background

### Why We're Doing This

**The Problem**: Console.log debugging wins in practice because:
- Zero cognitive load - immediate gratification
- No tool learning curve
- Instant feedback loop
- Easy to add, easy to understand output

**But debuggers are actually much faster** when you know how to use them:
- Set breakpoint once, inspect 100+ values instantly
- Conditional breakpoints for rare cases
- Live state inspection without re-running
- Automatic pause on exceptions
- Orders of magnitude faster for complex debugging

**The Gap**: I treat debugger as last resort, not first instinct. Need to build fluency and habit.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Use cherry-chrome MCP | Native Chrome DevTools access, modern CDP protocol | 2026-01-12 |
| Dynamic tool surface | Reduce cognitive load, context-appropriate tools | 2026-01-12 |
| Context-specific tools | Minimal tools when disconnected, full suite when debugging | 2026-01-12 |
| Learn through practice | Debug real Hash block bug to build skill, not just theory | 2026-01-12 |

### Important Constraints

- **Don't force debugger learning**: Should feel faster/better than alternatives, not mandatory
- **Maintain backward compatibility**: Console.log still available as fallback
- **Token efficiency matters**: Debugger must not waste context on verbose output
- **Make happy path obvious**: Smooth workflow between pause → inspect → step → resume
- **No minified code friction**: Source maps or ability to break on readable code

## Acceptance Criteria

When this work is complete:

- [ ] Debugger tools are discoverable and visible to Claude
- [ ] Can pause execution and get current state snapshot in one call
- [ ] Can step_over, step_in, step_out with natural semantics
- [ ] Can evaluate expressions with frame context from last pause
- [ ] Hash block bug fully debugged and fixed using debugger workflow
- [ ] Documented pattern: "When to reach for debugger vs. print"
- [ ] Skipped tests in stateful-primitives.test.ts are enabled and passing
- [ ] Workflow feels faster and more natural than adding console.logs

## Scope

### Files to Examine
- `src/blocks/signal-blocks.ts` - Hash block implementation (line 259)
- `src/blocks/__tests__/stateful-primitives.test.ts` - 8 skipped tests (lines 80, 176, 222, 250)
- `src/runtime/RuntimeState.ts` - State/cache structure
- `src/compiler/ir/IRBuilder.ts` - Signal compilation

### Related Components
- Cherry-chrome MCP (external tool, not modifying)
- Chrome DevTools Protocol (standard, using correctly)
- Test framework: Vitest (understand test execution)

### Out of Scope
- Modifying chrome-devtools MCP internals (that's your work)
- Refactoring Hash block implementation (just debug why it's broken)
- Changing test runner or framework
- Building a new debugger from scratch

## The Real Bug (Discovered)

### Symptom
Hash block compiles successfully but produces all-zero cache values after execution.

### Evidence
```
state.cache.sigValues: [0, 0, 0, 0, 0, ... (all 1000 entries are 0)]
```

### Root Cause (Hypothesis)
The test is searching for hash values in `[0, 1)` range, but:
1. Cache might contain uninitialized slots (zeros)
2. Hash output slot might not be getting written
3. `sigZip` might not be connecting to the cache properly
4. Frame cache slot allocation might be failing silently

### Debugger Workflow Needed
1. Set breakpoint on `executeFrame()` call
2. Step into frame execution
3. Inspect what `sigZip` produces
4. Check if Hash node is in the compiled schedule
5. See where cache writes should happen
6. Verify slot allocation succeeded

## Implementation Approach

### Phase 1: Tool Discovery (CURRENT)
1. Connect to Chrome
2. Navigate to test page
3. Discover available tools in connected state
4. Test basic pause/resume/step operations

### Phase 2: Debug the Hash Bug
1. Run failing test with debugger breakpoint
2. Pause at `executeFrame()`
3. Get snapshot of execution state
4. Step through to see what Hash block produces
5. Find where cache write fails
6. Fix the underlying issue

### Phase 3: Fix Skipped Tests
1. Fix the TimeMs bug (done - use InfiniteTimeRoot.tMs instead)
2. Un-skip Hash tests (done - removed it.skip)
3. Debug why they're failing
4. Fix root cause (likely Hash output not in cache)

### Phase 4: Document & Validate
1. Write "When to use debugger" guide
2. Verify all tests pass
3. Update planning docs
4. Document workflow patterns

## Known Gotchas

- **Tool discovery issue**: Tools not showing up in available list - may be MCP initialization delay
- **Minified code**: Bundle is minified, so breakpoints on source locations might be tricky
- **Frame persistence**: Need to understand how frame_id works between pause/resume cycles
- **Cache semantics**: Unclear exactly how cache.sigValues maps to signal IDs vs. indices

## Reference Materials

### Conversation Context
- Discussed why debugger wins over console.log despite higher learning curve
- Established that speed advantage (10x+) justified for complex bugs
- Identified friction: tool learning vs. immediate gratification trade-off
- User provided improved cherry-chrome MCP with dynamic tools

### Code References
- Hash block: `src/blocks/signal-blocks.ts:259-302`
- Test file: `src/blocks/__tests__/stateful-primitives.test.ts`
- RuntimeState: `src/runtime/RuntimeState.ts:190-211`

### MCP Documentation
- cherry-chrome: Dynamic tools based on connection state
- Tools change: disconnected → connected → debugging → back to connected
- Reduces cognitive load by hiding irrelevant tools

## Questions & Blockers

### Open Questions
- [ ] Why are tools not appearing in available list after Chrome connection?
- [ ] What's the exact tool signature for pause/snapshot/step commands?
- [ ] How does frame_id persist across multiple operations?
- [ ] Should Hash block output be cached or not? (Design question)

### Current Blockers
- 🔴 **BLOCKER**: Tools not discoverable - can't see what's available after connecting
- May need to wait for MCP implementation fix or user guidance

### Need User Input On
- Should we debug the MCP tool discovery issue, or take a different approach?
- Is there a way to list available tools dynamically?
- Should I try different tool naming patterns?

## Testing Strategy

### Existing Tests
- 274 tests passing currently
- 8 tests skipped in stateful-primitives.test.ts
- Tests use Vitest framework

### New Tests Needed
- None - fixing existing tests
- Just need to enable and fix the skipped ones

### Debugger Testing
- Test pause/resume cycle
- Test step_over execution
- Test expression evaluation with frame context
- Test multiple pause points

## Success Metrics

- [ ] `npm run test` shows 282 tests passing (no skips)
- [ ] Hash block produces correct normalized [0, 1) output values
- [ ] Debugger workflow is natural and fast
- [ ] Can answer "what's in the cache?" in <10 seconds using debugger
- [ ] Feel motivated to use debugger for next bug instead of console.log

---

## Next Steps for Agent

**Immediate**:
1. Investigate MCP tool discovery issue - why aren't tools showing after connection?
2. Try to get a list of available tools somehow
3. If stuck, ask user for tool name examples to try

**When tools work**:
1. Connect to Chrome and navigate to app
2. Open stateful-primitives test
3. Set breakpoint on `executeFrame()`
4. Step through Hash block execution
5. Inspect cache state at each step
6. Identify where cache write fails

**When bug is found**:
1. Fix root cause (likely in IRBuilder.sigZip or cache slot handling)
2. Re-run tests
3. Enable all skipped tests
4. Verify they pass

**Before finishing**:
1. Document debugger workflow for this specific bug
2. Note what you learned about debugging strategy
3. Update this handoff with results
4. Mark as complete in beads

---

## Learning Objectives

By completing this work, you (Claude) will have internalized:

1. **Debugger speed advantage**: Concrete example where debugger 10x faster than console.log
2. **Breakpoint strategy**: How to place breakpoints strategically to answer questions
3. **Snapshot thinking**: Getting all relevant state at once vs. piecemeal logging
4. **Step semantics**: Understanding what step_in, step_over, step_out actually do
5. **Habit formation**: Build muscle memory for "pause first, log second"

This is not about tools - it's about developing professional debugging instincts.
