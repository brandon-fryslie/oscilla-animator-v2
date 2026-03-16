Evaluator Note

active_ticket: RECOVER-08
evaluated_commit: d089721e0
repo_base_for_next_run: HEAD
verdict: accept-complete
next_action: advance-to-next-ready-ticket

do:
- RECOVER-08 is the next ready leaf ticket: remove install-time CPU runtime execution.
- Read the RECOVER-08 ticket body and `docs/WebGPU-Top-Priority-Next-Work-No-Exceptions/03-Install-Time-CPU-Runtime-Execution.md` before starting.
- The install path (`runtime-hotpath-install.ts`) has already been cleaned of CPU materialization by RECOVER-07. RECOVER-08 asks whether the install path still evaluates any runtime expressions or dynamic counts for the canonical pipeline — inspect and verify.
- Keep the accepted visible render baseline working.
- Read this note before choosing or continuing any work.

avoid:
- Do NOT advance to RECOVER-11 or any later ticket while RECOVER-08 is open.
- Do NOT reintroduce `materializeValueExpr`, `allocShapeBankWords`, `writeShapeBankHeader`, or `resolveInstanceLaneCount` into the canonical install path.
- Do NOT treat RECOVER-08 as a naming cleanup — the ticket requires removing actual runtime evaluation from install.

gates_passed:
- typecheck: clean (0 errors)
- build: clean (vite 6.4.1, built in 18.34s)
- runtime tests: 474/474 passed (35 files)
- DrawPrepSinkTablePacker tests: 5/5 passed (updated for compile-time shape word offset API)
- shape-bank-canonical-header tests: 5/5 passed
- shape-handle-control-point-slot tests: 3/3 passed
- RECOVER-07 violation 1 (materializeValueExpr in install): FIXED — `runtime-hotpath-install.ts` no longer imports or calls `materializeValueExpr`
- RECOVER-07 violation 2 (allocShapeBankWords/writeShapeBankHeader in install): FIXED — headers written directly into `Uint32Array` output buffer; no ShapeBankState mutation
- RECOVER-07 violation 3 (resolveInstanceLaneCount in install): FIXED — `buildRuntimeHotpathInstallPlanes` takes only `CompiledProgramIR`, no `RuntimeState` dependency
- ownership boundary: `buildCanonicalTopologyHeaders` is the single GPU-visible runtime stage for canonical shape-handle production (LAW:single-enforcer cited)
- DrawPrepSinkTablePacker: updated to accept `ReadonlyMap<ValueSlot, number>` instead of arena `Float32Array` — no arena round-trip
- RuntimeService.installRendererCanonicalAssets: no longer passes `RuntimeState` to install planes builder
- no unrelated churn: doc changes are editorial corrections matching earlier RECOVER-11 reframe decision

gates_failed:
- (none)

evidence:
- `src/services/runtime-hotpath-install.ts`: complete rewrite — imports only `CompiledProgramIR`, `getProgramTopology`, `resolveArenaAddress`, `packDrawPrepSinkTableV1`, `ShapeBankHeaderWord` enums, and shape types. No imports from `ValueExprMaterializer`, `InstanceCountResolver`, `MaterializeScratch`, or `RuntimeState`.
- `buildRuntimeHotpathInstallPlanes(program: CompiledProgramIR)`: signature takes only compiled program, no runtime state.
- `buildCanonicalTopologyHeaders(program)`: derives topology from `getProgramTopology` + `runtimeAddressTable` — both compile-time artifacts. Writes headers directly into `Uint32Array` at deterministic offsets.
- `packDrawPrepSinkTableV1(program, topology.shapeWordOffsetBySlot)`: receives compile-time shape word offsets directly, no arena read.
- `evaluateShapeRefHandle` in `ValueExprMaterializer.ts` still exists but is NOT reachable from the canonical install/render path — only callable through `materializeValueExpr` which is used only by `ValueExprEventEvaluator` (secondary path) and tests.
- `RuntimeService.installRendererCanonicalAssets`: calls `buildRuntimeHotpathInstallPlanes(program)` without `state` parameter; `staticBoundary: 0` (all headers from compile-time install stage).
