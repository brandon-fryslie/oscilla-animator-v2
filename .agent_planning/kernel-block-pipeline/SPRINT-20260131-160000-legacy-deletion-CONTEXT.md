# Implementation Context: legacy-deletion
Generated: 2026-01-31-160000

## Key Files

### Must Delete
- `src/runtime/SignalEvaluator.ts`
- `src/runtime/EventEvaluator.ts`
- `src/runtime/Materializer.ts`
- Any test files exclusively testing legacy evaluators

### Must Modify
- `src/runtime/index.ts` — Remove legacy exports
- Any file with dangling imports after deletion

### Verification Commands

```bash
# Verify no legacy files remain
find src/runtime -name "SignalEvaluator*" -o -name "EventEvaluator*" -o -name "Materializer.ts" 2>/dev/null

# Verify no legacy imports in production code
grep -rn "from.*SignalEvaluator\|from.*EventEvaluator\|from.*[^V]Materializer" src/ --include="*.ts" | grep -v __tests__ | grep -v ".test."

# Verify no legacy symbols exported
grep -n "evaluateSignal\|evaluateEvent\|materialize" src/runtime/index.ts

# Full build + test
npm run build && npm run test
```

## Expected Test Count Change

Current: 2057 passed, 15 skipped, 2 todo
Expected after deletion: ~2040+ (some legacy-specific tests removed, but most tests exercise behavior through the full pipeline and should be unaffected)

Any test count drop > 30 should be investigated — it would suggest tests we're losing coverage on that should be ported to ValueExpr evaluators.
