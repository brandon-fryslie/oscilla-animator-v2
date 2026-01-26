# Sprint: quick-wins - Debug Logging Cleanup & Bead Closures

Generated: 2026-01-26
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Remove debug logging from runtime and close beads that are already complete.

## Scope

**Deliverables:**
- Remove `[Continuity]` debug console.log statements from ContinuityApply.ts
- Convert RenderAssembler console.warn to proper error handling
- Close ms5.18 (future-types.ts doesn't exist)
- Verify ms5.15 status and document actual work remaining

## Work Items

### P0: Remove debug logging from ContinuityApply.ts [HIGH]

**Bead:** ms5.9
**Acceptance Criteria:**
- [ ] All `console.log` statements with `[Continuity]` prefix removed from ContinuityApply.ts
- [ ] No debug logging remains in production code paths
- [ ] Test file logging in `__tests__/` is acceptable (not production)

**Technical Notes:**
- Lines to remove: 346-348, 401, 413, 416, 418, 434, 437, 453, 488, 533, 543
- Total: ~15 console.log statements
- These were clearly debug aids, not user-facing diagnostics

### P1: Convert RenderAssembler warning to error [HIGH]

**Bead:** ms5.9 (continued)
**Acceptance Criteria:**
- [ ] `console.warn` at line 1117 converted to thrown error or diagnostic
- [ ] Error includes context (instanceId, step info)
- [ ] Empty array return removed (fail fast instead)

**Technical Notes:**
- Location: `src/runtime/RenderAssembler.ts:1117`
- Current: `console.warn(\`RenderAssembler: Instance ${step.instanceId} not found\`);`
- Change to: `throw new Error(\`...\`)` with better context
- This indicates a compilation bug, should fail loudly

### P2: Close ms5.18 (future-types.ts) [HIGH]

**Bead:** ms5.18
**Acceptance Criteria:**
- [ ] Verify file doesn't exist (confirmed in evaluation)
- [ ] Close bead with reason: "File removed/renamed, no migration comments to update"

**Technical Notes:**
- File `src/compiler/ir/future-types.ts` does not exist
- Likely removed during prior cleanup or never created
- Bead is obsolete

## Dependencies

- None - these are independent cleanup tasks

## Risks

- **Low risk**: Debug logging removal is straightforward
- **Mitigation**: Run tests after removal to ensure no functional changes
