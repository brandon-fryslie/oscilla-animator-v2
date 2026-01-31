# Sprint: legacy-deletion — Aggressive Legacy Code Deletion
Generated: 2026-01-31-160000 (Updated after review)
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION (after Sprint 1-4 prerequisites)

## Sprint Goal
Delete all legacy code, clean dependency graph, add dependency DAG enforcement. Verify at grep-level that no legacy evaluator symbols exist in runtime packages and no compiler packages re-export legacy.

## Scope
**Deliverables:**
1. Delete legacy evaluator files and all references
2. Delete legacy-only test files
3. Clean up runtime exports
4. Check compiler packages don't re-export legacy
5. Add dependency DAG snapshot test

## Work Items

### WI-1: Delete legacy code [HIGH]

**Files to delete** (after Sprint 1 removes RenderAssembler dependency):
- `src/runtime/SignalEvaluator.ts` — Legacy signal evaluator
- `src/runtime/EventEvaluator.ts` — Legacy event evaluator
- `src/runtime/Materializer.ts` — Legacy materializer

**Legacy-only tests to delete:**
- Any test file in `src/runtime/__tests__/` that exclusively tests legacy evaluators
- Test files that import `evaluateSignal`, `evaluateEvent` (legacy), or `materialize` (legacy)

**Exports to remove:**
- `src/runtime/index.ts` — Remove legacy evaluator exports

**Acceptance Criteria:**
- [ ] `find src/runtime -name "SignalEvaluator*" -o -name "EventEvaluator*" -o -name "Materializer.ts"` returns nothing
- [ ] `grep -r "evaluateSignal\|evaluateEvent" src/ --include="*.ts" | grep -v ValueExpr | grep -v __tests__` returns nothing
- [ ] `npm run build` passes
- [ ] `npm run test` passes (with reduced test count — legacy tests deleted)

### WI-2: Check compiler packages don't re-export legacy [HIGH]

**Purpose**: Ensure no compiler-only packages still re-export legacy runtime symbols indirectly.

**Implementation**:
```typescript
describe('no legacy re-exports from compiler', () => {
  it('compiler packages do not export legacy evaluators', () => {
    // Check src/compiler/index.ts exports
    const compilerExports = getExportsFrom('src/compiler/index.ts');
    expect(compilerExports).not.toContain('evaluateSignal');
    expect(compilerExports).not.toContain('evaluateEvent');
    expect(compilerExports).not.toContain('materialize');
  });
});
```

**Acceptance Criteria:**
- [ ] Compiler packages verified not to re-export legacy symbols
- [ ] Test added that would catch future re-export regressions

**Technical Notes:**
- This catches re-export chains (e.g., compiler → runtime index → legacy)

### WI-3: Add dependency DAG snapshot test [MEDIUM]

**Purpose**: Keep runtime dependency direction stable (runtime must not import from compiler).

**Implementation**:
```typescript
describe('dependency DAG enforcement', () => {
  it('runtime does not import from compiler', () => {
    const runtimeFiles = glob.sync('src/runtime/**/*.ts');
    for (const file of runtimeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const compilerImports = content.match(/from ['"].*\/compiler\//);
      expect(compilerImports).toBeNull();
    }
  });

  it('runtime does not import from ui', () => {
    const runtimeFiles = glob.sync('src/runtime/**/*.ts');
    for (const file of runtimeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const uiImports = content.match(/from ['"].*\/ui\//);
      expect(uiImports).toBeNull();
    }
  });
});
```

**Acceptance Criteria:**
- [ ] Dependency DAG test exists
- [ ] Test fails if runtime imports from compiler or ui
- [ ] Test documents the architectural constraint

**Technical Notes:**
- This is a snapshot test for architectural direction
- Simple grep-based check, not full module graph analysis
- Helps prevent accidental coupling

### WI-4: Clean dependency graph [HIGH]

**After deletion, verify clean dependency graph:**

1. No circular imports in `src/runtime/`
2. No dangling imports (references to deleted files)
3. No re-exports of deleted symbols
4. `src/runtime/index.ts` exports only ValueExpr-based APIs

**Scan for orphaned code:**
- Functions only called from deleted files
- Types only used by deleted files
- Constants only referenced by deleted files

**Acceptance Criteria:**
- [ ] `npm run build` — zero errors
- [ ] `npm run test` — all remaining tests pass
- [ ] `grep -rn "from.*SignalEvaluator\|from.*EventEvaluator\|from.*Materializer" src/` returns nothing
- [ ] Runtime index.ts exports reviewed and documented

## Dependencies
- Sprint 1 (kill-legacy-surfaces) must be COMPLETE
- Sprint 2 (kernel-registry) should be complete (ensures kernels work without legacy dispatch)
- Sprint 3 (block-lowering) should be complete (ensures blocks work without legacy IR)
- Sprint 4 (new-kernel-library) should be complete (ensures rendering works without legacy)

## Risks
- **Hidden callers**: Some module may import legacy code indirectly. Mitigation: Sprint 1's tripwire test catches this.
- **Test count drop**: Deleting legacy tests reduces coverage. Mitigation: Sprint 4's property tests and Sprint 2's registry tests replace the coverage.
- **Re-export chains**: Compiler might re-export legacy. Mitigation: WI-2 checks this explicitly.

## Success Criteria

This sprint is complete when:
1. All legacy evaluator files deleted
2. No legacy symbols in any export
3. Compiler doesn't re-export legacy
4. Dependency DAG enforced
5. All tests pass
6. Grep verification confirms no legacy remains
