# Definition of Done: frontend-ui-wiring

Generated: 2026-02-03T23:00:00 (revised 2026-02-04T00:00:00)

## Functional Criteria

- [ ] Unconnected input ports that have materialized default sources display the default source indicator
- [ ] Port type colors in the graph editor reflect the compiler frontend's resolved types
- [ ] When `compileFrontend()` produces errors, the UI still updates with partial frontend data
- [ ] When no frontend result exists (before first compile), UI gracefully falls back to registry data
- [ ] All existing UI behavior preserved — no visual regressions for connected ports, params, edge labels
- [ ] Port provenance is queryable by canonical address (e.g., `"v1:blocks.render_instances_2d.inputs.pos"`)

## Technical Criteria

- [ ] `FrontendSnapshot` type defined with status, revision, provenance, resolved types, errors
- [ ] `FrontendResultStore` is a MobX store with observable `snapshot`
- [ ] `RootStore.frontend` is the single access point for frontend compilation results
- [ ] `CompileOrchestrator.compileAndSwap()` calls `compileFrontend()` and passes result to `compile()` via `precomputedFrontend`
- [ ] `compile()` accepts `precomputedFrontend` and skips inline frontend when provided
- [ ] `compile()` still works standalone without `precomputedFrontend` (backward compatible)
- [ ] `reconcileNodes()` receives `FrontendResultStore` and passes data to `createNodeFromBlock()`
- [ ] `getEffectiveDefaultSource()` checks `FrontendResultStore` before falling back to registry
- [ ] Canonical address index built inside `FrontendResultStore.updateFromFrontendResult()`
- [ ] `patchRevision` coherence: snapshot carries revision, UI checks match

## Test Criteria

- [ ] All existing tests pass (no regressions)
- [ ] Unit test: `FrontendResultStore` correctly reports `hasDefaultSource()` by canonical address
- [ ] Unit test: `FrontendResultStore.getResolvedPortType()` returns resolved types
- [ ] Integration test: `compileAndSwap()` populates `FrontendResultStore`
- [ ] Integration test: unconnected port has `defaultSource` provenance in snapshot
- [ ] Integration test: connected port has `userEdge` provenance in snapshot
- [ ] Typecheck passes (`npm run typecheck`)

## Verification Strategy

- Run full test suite (`npm run test`)
- Run typecheck (`npm run typecheck`)
- Manual: Start dev server, verify default source indicators on unconnected ports
- Manual: Verify port colors reflect resolved types
- Manual: Add/remove connections, verify provenance updates correctly
