# Definition of Done: ui-wiring-fix

Generated: 2026-02-04T08:10:00

## Functional Criteria

1. Port type colors in the graph editor reflect compiler-resolved types (from `FrontendResultStore`), not static registry types
2. Unconnected input ports with materialized default sources display the default source indicator (driven by frontend snapshot)
3. When no frontend snapshot exists (before first compile), UI falls back gracefully to registry data
4. Adding/removing connections updates default source indicators reactively
5. Ellipse default source indicators still work (regression check)

## Technical Criteria

6. `npm run typecheck` passes clean (currently fails with 2 constructor mismatch errors)
7. `InputPortLike` and `OutputPortLike` have `resolvedType?: InferenceCanonicalType` field
8. `PatchStoreAdapter.transformInputPorts()` populates `resolvedType` from `frontendStore.getResolvedPortTypeByIds()`
9. `nodeDataTransform.ts:createNodeFromBlockLike()` uses `resolvedType` when available, falls back to registry type
10. `GraphEditorCore.tsx` MobX reaction observes frontend snapshot changes (not just structural block/edge changes)
11. `sync.ts` deleted entirely
12. `nodes.ts` stripped to only live exports (or deleted if all exports are dead)
13. No import errors in any file

## Test Criteria

14. All existing tests pass (no regressions)
15. `PatchStoreAdapter.test.ts` passes with updated constructor
16. `FrontendResultStore` tests still pass (14 tests)
17. Typecheck passes clean

## Verification Method

- Automated: `npm run typecheck && npm run test`
- Criteria 1-5 are code-path verified (correct data flows through adapter → nodeDataTransform → port rendering)
