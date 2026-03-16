Evaluator Note

active_ticket: RECOVER-03 (lit-b90e7a20-2f15cb35)
evaluated_commit: 81487586e
repo_base_for_next_run: 81487586e (keep as base — classification seam is good)
verdict: revise
next_action: revise-active-ticket

do:
- Wire the geometry route classification into the ACTIVE render path in `RustWasmWebGPURenderer.ts` or the Rust worker dispatch
- The active renderer copies ShapeBank data to SharedArrayBuffer for the Rust worker; the seam must be reachable from that path
- Add at least one integration point where the live render dispatch queries the geometry route for Type 1 Rigid and can branch between `shapeBankDirect` and `legacy`
- Keep the existing `ShapeBankGeometrySeam.ts` classifier; it is good support code
- The new branch point does not need to change behavior yet; both sides may still delegate to the old path, but it must be a REAL code path in the live renderer

avoid:
- Do not delete the old CPU mesh path; that is RECOVER-04
- Do not add a second standalone manager or classifier that is also disconnected from the active renderer
- Do not confuse `WebGPUShapeBankManager` with the active render path; the live path is `RustWasmWebGPURenderer` plus the Rust worker
- Do not broaden into draw-prep ownership or GPU indirect-arg derivation
- Do not stop at classifier-only helpers, TS-only route metadata, test-only changes, or any design that leaves the active renderer integration boundary untouched

gates_passed:
- `pnpm typecheck` clean
- `ShapeBankGeometrySeam.test.ts` 13/13 pass
- source/ticket alignment: commit references RECOVER-03 and uses Type 1 Rigid from RECOVER-02
- classification design: `GeometryRoute` is a correct discriminated union and reads only canonical header fields

gates_failed:
- live-path alignment: the proposed seam was only a TypeScript-side classifier and did not create a real render-time routing boundary in the active renderer integration
- active renderer integration: `WebGPUShapeBankManager` is never instantiated; `RustWasmWebGPURenderer` does not consume geometry routes; no dispatch path branches on the route
- stop condition violated: RECOVER-03 is not complete if the change only adds classification, metadata, helpers, or tests without altering the active renderer integration boundary
- verification quality: tests prove classifier behavior in isolation but do not prove the seam is reachable from the active render path

evidence:
- `new WebGPUShapeBankManager` has zero call sites in `src/`
- `resolveGeometryRoute` and `getGeometryRoutes` have no consumers outside the newly added classifier files
- `RustWasmWebGPURenderer.ts` imports only the `RenderShapeBankSource` type from `WebGPUShapeBankManager.ts`; it does not use a manager instance or route APIs
- The active render path copies raw ShapeBank data to SharedArrayBuffer for the Rust worker with no route classification in that path
- RECOVER-03 now explicitly requires a seam in the live renderer integration and says helper-only or classifier-only changes are insufficient
