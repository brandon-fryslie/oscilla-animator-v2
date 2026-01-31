# Definition of Done: legacy-deletion
Generated: 2026-01-31-160000

## Verification Checklist

### WI-1: File Deletion
- [ ] No legacy evaluator files in `src/runtime/`
- [ ] No legacy evaluator imports in production code
- [ ] `npm run build` passes
- [ ] `npm run test` passes

### WI-2: Clean Dependencies
- [ ] No dangling imports
- [ ] No orphaned code from deleted files
- [ ] Runtime exports reviewed

### Sprint-Level (the "done-done" check)
- [ ] `grep -rn "SignalEvaluator\|EventEvaluator\|Materializer" src/runtime/ --include="*.ts" | grep -v ValueExpr | grep -v __tests__ | grep -v ".test."` returns NOTHING
- [ ] Dependency graph from runtime entrypoints excludes all legacy modules
- [ ] Architecture doc updated to reflect single-path reality
