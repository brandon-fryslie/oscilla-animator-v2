# Sprint: parser-infinite-loop - Fix Parser Infinite Loop on Malformed Input

Generated: 2026-02-03T22:00:00
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Fix the infinite loop in `parser.ts` error recovery, add defensive loop guard in `parseDocument()`, re-enable skipped tests, and clean up temp files.

## Scope

**Deliverables:**
1. Fix `recoverToBlockEnd()` to always advance at least one token
2. Add forward-progress guard in `parseDocument()` loop
3. Add parser test for malformed input error recovery
4. Re-enable skipped integration tests, delete temp repro file

## Work Items

### WI-1: Fix `recoverToBlockEnd()` — always advance [HIGH]

**Problem**: When `bracketDepth` goes negative, the method breaks without calling `advance()`. The cursor stays on the same token.

**Fix**: After the break on line 416, ensure we advance past the offending token. Two approaches:

**Option A (recommended)**: Move the `advance()` call to the top of the loop body (advance first, then check what we just consumed). This guarantees progress on every iteration.

**Option B**: Add `this.advance()` before the `break` on line 416, and similarly for any other early-break path.

**Also**: The `braceDepth = 1` initialization assumes we're inside a block body. But `parseBlock()` calls `recoverToBlockEnd()` at line 86 when it hasn't even entered a brace yet (failed to match IDENT). In this case `braceDepth` should be 0, not 1. Consider: when called from line 86 (before opening brace), the recovery should just skip to the next block-level boundary (next IDENT at top level or EOF), not try to balance braces from depth 1.

**Acceptance Criteria:**
- [ ] `recoverToBlockEnd()` always advances the cursor by at least 1 token
- [ ] Parser terminates on all malformed inputs (no infinite loops)
- [ ] `braceDepth` initialization matches actual parser context

### WI-2: Add forward-progress guard in `parseDocument()` [HIGH]

**Problem**: Even with WI-1 fixed, the `parseDocument()` loop has no safety net. If any future change reintroduces a non-advancing code path, it silently loops forever.

**Fix**: Record `this.current` before calling `parseBlock()`. After the call, if `this.current` hasn't changed, force-advance and add an error. This is a belt-and-suspenders defense.

```typescript
while (!this.isAtEnd()) {
  const before = this.current;
  const block = this.parseBlock();
  if (block) {
    blocks.push(block);
  }
  // Safety: if parsing made no progress, force advance to prevent infinite loop
  if (this.current === before) {
    this.addError('Parser stuck: skipping unexpected token', this.peek().pos);
    this.advance();
  }
  this.skipNewlines();
}
```

**Acceptance Criteria:**
- [ ] `parseDocument()` detects zero-progress iterations and force-advances
- [ ] A descriptive error is emitted when this safety triggers
- [ ] No infinite loop possible regardless of input

### WI-3: Add parser tests for malformed input [HIGH]

**Tests to add:**
1. `parse('invalid syntax { ] }')` → returns errors, does not hang
2. `parse('{ ] }')` → returns errors, does not hang
3. `parse('] } [')` → returns errors, does not hang
4. `parse('')` → returns empty document, no errors
5. `deserializeCompositeFromHCL('invalid syntax { ] }')` → returns error result, does not hang

**Acceptance Criteria:**
- [ ] All 5 malformed input cases terminate and produce errors
- [ ] Tests have a timeout guard (Vitest timeout, e.g. 5 seconds)
- [ ] No test causes OOM

### WI-4: Re-enable integration tests and cleanup [HIGH]

1. Remove `.skip` from `composite-store-integration.test.ts` (or verify it's already removed per handoff doc)
2. Delete `src/patch-dsl/__tests__/_heap-repro.test.ts` (temporary investigation file)
3. Run full test suite to verify no regressions

**Acceptance Criteria:**
- [ ] All 3 previously-skipped integration tests pass
- [ ] `_heap-repro.test.ts` is deleted
- [ ] Full test suite passes with no new failures

## Dependencies

- None — this is a standalone bug fix

## Risks

- **Low**: The `braceDepth` initialization issue (WI-1) could affect other error recovery paths. Mitigation: the forward-progress guard (WI-2) catches any remaining issues.
- **Low**: Re-enabled integration tests might fail for reasons unrelated to the parser fix. Mitigation: run tests one at a time to isolate.

## Files to Modify

| File | Change |
|------|--------|
| `src/patch-dsl/parser.ts` | Fix `recoverToBlockEnd()`, add progress guard in `parseDocument()` |
| `src/patch-dsl/__tests__/parser.test.ts` | Add malformed input tests |
| `src/patch-dsl/__tests__/composite-store-integration.test.ts` | Remove `.skip` |
| `src/patch-dsl/__tests__/_heap-repro.test.ts` | DELETE |
