Implementer Note

active_ticket: RECOVER-08
result: completed
commit: f8e6605f

what_changed:
- runtime-hotpath-install.ts: materializeProgramForGpuInstall (full CPU schedule execution) replaced with materializeCanonicalShapeAssets (shapeRef-only filter)
- buildRuntimeHotpathInstallPlanes no longer takes nowMs — no time seeding for CPU execution
- RuntimeService.ts: installRendererHotpathPlanes(nowMs) renamed to installRendererCanonicalAssets()
- First frame now uses the same GPU simulation/draw-prep pipeline as all subsequent frames

verification:
- typecheck: 0 errors
- tests: 170 files, 1935 passed, 0 failed
- build: Vite build succeeds
- install path executes only shapeRef materialize steps (canonical assets)
- no resolveTime, no full schedule iteration, no CPU frame products

files_changed:
- src/services/runtime-hotpath-install.ts (68 insertions, 39 deletions)
- src/services/RuntimeService.ts (18 insertions, 13 deletions)
