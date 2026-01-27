# Definition of Done: deprecated-removal Sprint

**Generated:** 2026-01-27T12:00:00
**Sprint:** Remove All Deprecated Types and Functions

## Completion Criteria

### Code Quality

- [ ] No `@deprecated` comments remain in production code
- [ ] No TypeScript errors or warnings
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)

### Specific Removals Verified

- [ ] `NumericUnit` type alias removed from src/core/canonical-types.ts
- [ ] `PAYLOAD_STRIDE` constant removed from src/core/canonical-types.ts
- [ ] `PAYLOAD_STRIDE` removed from src/types/index.ts exports
- [ ] `getStateSlots()` method removed from IRBuilderImpl.ts
- [ ] `getStateSlots()` removed from IRBuilder.ts interface
- [ ] `CompileError.kind` field removed
- [ ] `CompileError.location` field removed
- [ ] `CompileError.severity` field removed
- [ ] `createRuntimeState()` function removed from RuntimeState.ts
- [ ] `createRuntimeState` removed from src/runtime/index.ts exports
- [ ] `TypeEnv` type alias removed from typecheck.ts
- [ ] `isTypeEnv()` function removed from typecheck.ts
- [ ] Deprecated typecheck overload removed

### Migration Verification

- [ ] diagnosticConversion.ts uses `error.code` (not `error.kind`)
- [ ] pass7-schedule.ts uses `getStateMappings()` (not `getStateSlots()`)
- [ ] Test files use `createSessionState()` + `createProgramState()` pattern
- [ ] All typecheck() calls use TypeCheckContext

### Public API Surface

- [ ] No deprecated exports in src/types/index.ts
- [ ] No deprecated exports in src/runtime/index.ts
- [ ] No deprecated exports in src/compiler/index.ts
- [ ] No deprecated exports in src/expr/index.ts

## Verification Commands

```bash
# Check for any remaining @deprecated
grep -r "@deprecated" src/ --include="*.ts"

# Verify TypeScript compilation
npm run typecheck

# Run all tests
npm run test

# Full build
npm run build
```

## Rollback Plan

If issues are discovered after merge:
1. Git revert the merge commit
2. File new beads for specific items that caused issues
3. Research root cause before re-attempting
