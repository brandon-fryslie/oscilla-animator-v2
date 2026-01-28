# Definition of Done: build-fix Sprint

**Sprint**: Fix TypeScript Build Errors
**Generated**: 2026-01-27-195500

## Completion Checklist

### Build System
- [ ] `npm run typecheck` exits with code 0 (no errors)
- [ ] `npm run build` completes successfully
- [ ] `npm run test` shows no new failures (baseline: 1907 pass, 8 skip)

### Code Changes
- [ ] DiagnosticHub.ts lines 440, 450 use array syntax for filter
- [ ] DiagnosticsStore.ts line 288 uses array syntax for filter
- [ ] HealthMonitor.ts uses createDiagnostic from types.ts (or inlined)
- [ ] No `// @ts-ignore` or `any` casts introduced

### Verification
- [ ] path-field-demo.ts loads in dev server without console errors
- [ ] Rendering shows expected visualization (star vertices)
- [ ] If demo has issues, root cause documented in ticket

### Documentation
- [ ] Invalid tickets closed with explanation
- [ ] Any new issues discovered → new tickets created

## Out of Scope

- Stroke rendering implementation
- localStorage/HMR caching fixes
- Multi-component signal swizzle
- Path-as-first-class-value redesign
