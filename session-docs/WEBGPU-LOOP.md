Evaluator Note

active_ticket: RECOVER-07
evaluated_commit: 93dd46460
repo_base_for_next_run: HEAD (after corrective steering)
verdict: revise
next_action: revise-active-ticket

do:
- Return to RECOVER-07 first. Remove CPU authorship of canonical `shapeRef` render payload from the active path.
- Eliminate CPU ShapeBank allocation/header writes for the canonical path in install/materializer code.
- Keep the accepted visible render baseline working while moving ownership to one GPU-visible runtime stage.
- Leave RECOVER-08 open behind RECOVER-07; only revisit install-time execution cleanup after RECOVER-07 is actually true.

avoid:
- Do not continue to RECOVER-11 or any later ticket while RECOVER-07 is open.
- Do not treat closed later tickets as authority to keep advancing.
- Do not leave `materializeValueExpr(...)` for canonical `shapeRef` handling in the CPU install/materializer path.
- Do not allocate live ShapeBank entries or write canonical shape headers from CPU install/materializer code for the canonical path.

gates_passed:
- corrective tracker action: RECOVER-07 and RECOVER-08 have been reopened with hardened stop conditions tied to the observed deviation
- loop hardening: prompt and loop docs now require reopened prerequisite tickets to preempt later work immediately
- clean closeout requirement still intact

gates_failed:
- RECOVER-07 acceptance: current repo state still calls `materializeValueExpr(...)` for canonical `shapeRef` handling in `src/services/runtime-hotpath-install.ts`
- RECOVER-07 acceptance: current repo state still allocates ShapeBank words and writes canonical shape headers on the CPU in `src/runtime/ValueExprMaterializer.ts`
- RECOVER-08 acceptance: install still resolves dynamic instance counts during canonical install in `src/services/runtime-hotpath-install.ts`
- prerequisite integrity: later advancement to RECOVER-09 and RECOVER-10 occurred while RECOVER-07 and RECOVER-08 were not actually complete

evidence:
- `src/services/runtime-hotpath-install.ts`: `materializeCanonicalShapeAssets()` clears instance count cache, resolves instance counts, and calls `materializeValueExpr(...)` for `shapeRef` steps before publishing install planes
- `src/runtime/ValueExprMaterializer.ts`: `evaluateShapeRefHandle()` still allocates ShapeBank words and writes canonical shape headers on the CPU
- `src/runtime/InstanceCountResolver.ts`: install path still evaluates dynamic count expressions for canonical path instance counts
- reopened tickets: `lit-b90e7a20-39ab8434` and `lit-b90e7a20-f0ed548a`
