# Definition of Done: kill-legacy-surfaces
Generated: 2026-01-31-160000

## Verification Checklist

### WI-1: RenderAssembler Legacy Removal
- [ ] `grep -r "evaluateSignal\|SignalEvaluator" src/runtime/RenderAssembler.ts` returns nothing
- [ ] `npm run build` passes (no type errors from removed APIs)
- [ ] `npm run test` — all tests pass
- [ ] Dev server runs, renders correctly (manual verification)

### WI-2: Legacy File Deletion
- [ ] `ls src/runtime/SignalEvaluator.ts src/runtime/EventEvaluator.ts src/runtime/Materializer.ts` — all return "No such file"
- [ ] `grep -r "from.*SignalEvaluator\|from.*EventEvaluator\|from.*Materializer" src/` — returns nothing (excluding test migration artifacts)
- [ ] `npm run build` passes
- [ ] `npm run test` — all tests pass

### WI-3: Tripwire Test
- [ ] `src/runtime/__tests__/no-legacy-evaluator.test.ts` exists
- [ ] Test passes in `npm run test`
- [ ] Test fails if a legacy import is added (verify by temporarily adding one)

### Sprint-Level Acceptance
- [ ] `grep -rn "evaluateSignal\|evaluateEvent" src/runtime/ --include="*.ts" | grep -v __tests__ | grep -v ".test."` returns nothing
- [ ] No legacy evaluator symbols in `src/runtime/index.ts` exports
- [ ] Commit message references this sprint and the architectural goal
