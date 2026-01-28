# Sprint: dev-experience - Fix localStorage Caching for HMR

**Generated**: 2026-01-27-200000
**Confidence**: HIGH: 0, MEDIUM: 2, LOW: 0
**Status**: PARTIALLY READY (research needed)

## Sprint Goal

Fix localStorage caching that prevents HMR from properly updating demo patches during development.

## Scope

**Deliverables:**
1. Diagnose localStorage/HMR interaction issue
2. Implement cache invalidation strategy
3. Verify demo file changes reflect immediately

## Work Items

### P1: Diagnose localStorage/HMR Interaction [MEDIUM]

**Acceptance Criteria:**
- [ ] Root cause identified: which store/hook is caching
- [ ] Document where localStorage is read/written for patches
- [ ] Identify HMR hook points in Vite config

**Technical Notes:**
- Check `src/stores/PatchStore.ts` for localStorage usage
- Check `src/ui/App.tsx` or similar for state initialization
- Look for `localStorage.getItem`/`setItem` patterns

#### Unknowns to Resolve
- Is this localStorage or in-memory caching?
- Does Vite HMR have proper module replacement for demo files?
- Is there a race condition between HMR and store hydration?

#### Exit Criteria
- Root cause documented
- Fix approach identified

### P2: Implement Cache Invalidation [MEDIUM]

**Acceptance Criteria:**
- [ ] Demo file changes trigger proper HMR reload
- [ ] No need to manually clear localStorage during development
- [ ] Production behavior unchanged (persistence still works)

**Technical Notes:**
Possible approaches:
1. Add version/hash to localStorage key
2. Check file mtime vs stored mtime
3. Use Vite's `import.meta.hot` API for demo files
4. Add development mode flag that skips localStorage read

## Dependencies

- Sprint 1 (build-fix) must complete first

## Risks

| Risk | Mitigation |
|------|------------|
| Deep Vite HMR integration needed | Start with simpler approach (skip localStorage in dev) |
| May affect user experience | Guard changes behind `import.meta.env.DEV` |
| Could break state persistence | Test thoroughly in both dev and prod modes |
