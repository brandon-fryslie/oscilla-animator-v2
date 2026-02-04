# Definition of Done: parser-infinite-loop

## Verification Criteria

1. **No infinite loop**: `npx vitest run src/patch-dsl/__tests__/parser.test.ts` completes in < 10 seconds
2. **Malformed input handled**: Parser returns errors (not hangs) for `'invalid syntax { ] }'`, `'{ ] }'`, `'] } ['`
3. **Integration tests pass**: `npx vitest run src/patch-dsl/__tests__/composite-store-integration.test.ts` passes all 3 previously-skipped tests
4. **No temp files**: `_heap-repro.test.ts` does not exist
5. **Full suite green**: `npm run test` passes with no new failures
6. **Forward-progress invariant**: `parseDocument()` has a mechanical guard against zero-progress iterations

## Exit Criteria for Each Work Item

| WI | Done When |
|----|-----------|
| WI-1 | `recoverToBlockEnd()` always advances ≥1 token, braceDepth init matches context |
| WI-2 | `parseDocument()` has progress guard, tested with assertion |
| WI-3 | 5 malformed input parser tests pass with timeout |
| WI-4 | `.skip` removed, `_heap-repro.test.ts` deleted, full suite green |
