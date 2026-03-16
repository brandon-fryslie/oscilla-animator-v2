Evaluator Note

active_ticket: RECOVER-03 (lit-b90e7a20-2f15cb35)
evaluated_commit: f3e58bcc0
repo_base_for_next_run: f3e58bcc0
verdict: accept-good-base
next_action: advance-to-next-ready-ticket

do:
- Begin RECOVER-04: cut Type 1 Rigid over to direct ShapeBank topology consumption
- Implement `handleDirectGeometryRoute` in `RustWasmWebGPURenderer.ts` with real vertex pulling from the topology storage buffer
- Add a filtering mechanism so Type 1 Rigid shapes dispatched through the direct path are NOT also processed through the old SharedArrayBuffer → worker CPU mesh path (the current dispatch is additive — both paths run for direct shapes)
- Produce visible rendering evidence: one shape class must render on canvas through the new path
- Delete or dead-end worker CPU mesh realization for Type 1 Rigid

avoid:
- Do not restructure the seam or classifier — `dispatchGeometryRoutes` and the callback pattern are correct
- Do not broaden to all shape classes; Type 1 Rigid only
- Do not rewrite draw-prep ownership (RECOVER-05/06)
- Do not remove install-time CPU execution (RECOVER-07/08)
- Do not keep both paths producing visible output for the same shape (no dual rendering)

gates_passed:
- source/ticket alignment: commit references RECOVER-03, uses Type 1 Rigid from RECOVER-02
- design/verdict alignment: follows previous evaluator guidance to wire dispatch into active render path
- live-path alignment: `classifyAndDispatchGeometryRoutes()` runs in `render()` every frame at line 846, between ShapeBank sync and sink table sync
- verification quality: 17/17 tests pass, covering classification, dispatch, mixed banks, empty sources
- static verification: `pnpm typecheck` clean, `pnpm build` clean
- ownership/spec alignment: classification reads only canonical ShapeBank header fields, no dual authority
- no unrelated churn: changes confined to ShapeBankGeometrySeam.ts, RustWasmWebGPURenderer.ts, and test file

gates_failed:
- (none)

evidence:
- `render()` at line 836-855 calls `classifyAndDispatchGeometryRoutes(input.shapeBank)` every frame
- `handleDirectGeometryRoute` is a private method on `WebGPURenderer` called per-shape for Type 1 Rigid
- `dispatchGeometryRoutes` in ShapeBankGeometrySeam.ts couples classification and dispatch in one function
- `getLatestGeometryRoutes()` and `getDirectRouteDispatchCount()` provide runtime observability
- dispatch is additive (both direct handler AND old path run for Type 1 Rigid) — RECOVER-04 must add filtering
- no consumers of observability methods yet (expected — they're for RECOVER-04 and debug)
- per-frame Map allocation in classify is acceptable for current shape counts; optimize in RECOVER-04 if needed
