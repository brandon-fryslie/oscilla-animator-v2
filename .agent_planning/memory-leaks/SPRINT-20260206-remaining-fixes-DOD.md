# Definition of Done: remaining-fixes
Generated: 2026-02-06

## Completion Criteria

### SVG GeometryDefCache invalidation
- [ ] SVGRenderer listens for program changes and calls `invalidateGeometryCache()`
- [ ] No stale geometry defs accumulate across hot-swaps
- [ ] Existing SVG rendering tests pass (`npm run test -- SVG`)
- [ ] No regressions in other tests (`npm run test`)

### Canvas2D dash pattern buffer reuse
- [ ] `dashPx` array allocated once, reused across frames
- [ ] Canvas2D rendering tests pass
- [ ] No regressions in other tests

### Global
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all tests)
- [ ] No new `any` casts introduced
