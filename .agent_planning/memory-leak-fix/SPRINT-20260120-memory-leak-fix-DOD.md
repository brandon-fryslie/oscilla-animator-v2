# Definition of Done: memory-leak-fix

**Sprint:** memory-leak-fix
**Generated:** 2026-01-20

## Acceptance Criteria

### P0: DiagnosticsStore Log Cap

- [ ] `_logs` array capped at 1000 entries
- [ ] Oldest entries removed when cap exceeded (FIFO via shift())
- [ ] `clearLogs()` still works correctly
- [ ] Public API unchanged (logs getter still works)
- [ ] TypeScript compiles without errors

### P1: RootStore Reaction Disposal

- [ ] Reaction disposer stored as class property
- [ ] `dispose()` method added to RootStore class
- [ ] Reaction properly disposed in `dispose()` method
- [ ] DiagnosticHub reference stored and disposed
- [ ] TypeScript compiles without errors

### P2: main.ts Reaction Disposal

- [ ] Reaction disposer stored in module scope
- [ ] Disposer called before creating new reaction (if any)
- [ ] No duplicate reactions can be created
- [ ] TypeScript compiles without errors

### P3: ReactFlowEditor setTimeout Cleanup

- [ ] setTimeout in startup useEffect (line 320) has cleanup
- [ ] setTimeout in node count change useEffect (line 328) has cleanup
- [ ] All timeout IDs tracked for cleanup
- [ ] TypeScript compiles without errors

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] App runs without console errors
- [ ] Manual test: Edit parameters for 2 minutes, verify no memory growth warning in Chrome DevTools
- [ ] Hot reload (edit + save source file) doesn't cause errors

## Not In Scope

- Performance optimizations beyond memory leaks
- New features
- UI changes
- Test coverage (existing tests should pass)
