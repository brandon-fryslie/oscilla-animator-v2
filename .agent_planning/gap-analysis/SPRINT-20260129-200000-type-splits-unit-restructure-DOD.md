# Definition of Done: Sprint type-splits-unit-restructure

## Gate Criteria

### Per-Item Gates
- [ ] #16: `CanonicalType` cannot contain payload var (compile-time enforced); inference forms exist for frontend
- [ ] #18: UnitType has 8 structured kinds; `unitsEqual()` handles nested comparison; all consumers updated
- [ ] #19: No `'deg'` unit kind anywhere in `src/`

### Sprint-Level Gates
- [ ] TypeScript compiles: `npx tsc --noEmit` exits 0
- [ ] All gap-analysis-scoped tests pass
- [ ] Adapter rules work with structured units (adapter tests pass)
- [ ] No regressions in passing tests
- [ ] `grep -r "kind: 'deg'" src/` returns 0
- [ ] `grep -r "kind: 'var'" src/core/canonical-types.ts` returns 0 (outside inference section)
