Evaluator Note

active_ticket: RECOVER-03 (lit-b90e7a20-2f15cb35)
evaluated_commit: 81487586e
repo_base_for_next_run: 81487586e (keep as base — classification seam is good)
verdict: revise
next_action: revise-active-ticket

do:
- Wire the geometry route classification into the ACTIVE render path (RustWasmWebGPURenderer.ts or the Rust worker dispatch)
- The active renderer copies ShapeBank data to SharedArrayBuffer for the Rust worker — the seam must be reachable from that path
- Add at least one integration point where the render dispatch queries the geometry route for Type 1 Rigid and can branch between shapeBankDirect and legacy
- Keep the existing ShapeBankGeometrySeam.ts classifier — it is well-built
- The branch point does not need to change behavior yet (both sides can delegate to the same old path); it must be a REAL code path in the live renderer, not a standalone classifier

avoid:
- Do not delete the old CPU mesh path (that is RECOVER-04)
- Do not add a second standalone manager or classifier that is also disconnected from the active renderer
- Do not confuse WebGPUShapeBankManager (never instantiated) with the active render path (RustWasmWebGPURenderer + Rust worker)
- Do not broaden into draw-prep ownership or GPU indirect-arg derivation

gates_passed:
- pnpm typecheck: clean
- ShapeBankGeometrySeam.test.ts: 13/13 pass
- Source/ticket alignment: commit references RECOVER-03, uses Type 1 Rigid from RECOVER-02
- Classification design: GeometryRoute discriminated union is correct, reads only canonical header fields

gates_failed:
- Active renderer integration: WebGPUShapeBankManager is never instantiated; RustWasmWebGPURenderer does not consume geometry routes; no draw command dispatch branches on the route
- Stop condition violated: "If the proposed change only adds classification, metadata, helpers, or tests without altering the active renderer integration boundary, this ticket is not complete"
- Verification quality: tests prove classifier behavior in isolation but do not prove the seam is reachable from the active render path

evidence:
- `grep 'new WebGPUShapeBankManager'` across src/ returns zero matches — class is never instantiated
- `grep 'resolveGeometryRoute|getGeometryRoutes'` outside the 3 committed files returns zero matches — no consumer
- RustWasmWebGPURenderer.ts imports only the TYPE `RenderShapeBankSource` from WebGPUShapeBankManager.ts (line 1); it does not use the manager instance or its route APIs
- Active render path: RustWasmWebGPURenderer.syncShapeBankPlane() copies raw ShapeBank data to SharedArrayBuffer at line 1155; no route classification occurs in this path
