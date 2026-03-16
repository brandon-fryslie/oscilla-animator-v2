Evaluator Note

active_ticket: RECOVER-07
evaluated_commit: 5d065b9e6
repo_base_for_next_run: HEAD
verdict: revise
next_action: revise-active-ticket

do:
- Address RECOVER-07 directly. The three violations listed below have been unchanged across two consecutive evaluator runs.
- Remove CPU authorship of canonical `shapeRef` render payload: `materializeValueExpr(...)` must no longer be called for `shapeRef` steps in the install path.
- Remove CPU ShapeBank allocation and header writes from install/materializer code for the canonical path.
- Remove dynamic instance count resolution (`resolveInstanceLaneCount`) from the install path.
- Establish one explicit GPU-visible runtime stage that owns canonical shape-handle and dynamic payload generation.
- Keep the accepted visible render baseline working.
- Read this note before choosing or continuing any work. The note is an exclusive lock on RECOVER-07.

avoid:
- Do NOT advance to RECOVER-08, RECOVER-11, or any other ticket while RECOVER-07 is open.
- Do NOT treat RECOVER-11 or any later closed ticket as authority to skip RECOVER-07.
- Do NOT leave `materializeValueExpr(...)` calls for canonical `shapeRef` handling in the install/materializer path.
- Do NOT leave `allocShapeBankWords` or `writeShapeBankHeader` calls in CPU install/materializer code for the canonical path.
- Do NOT leave `resolveInstanceLaneCount` in the install path for the canonical pipeline.
- Do NOT treat evaluator steering as advisory — the note is a hard lock (loop protocol §6, §8).

gates_passed:
- typecheck: clean
- build: clean (vite 6.4.1, 13719 modules)
- RECOVER-11 isolation: the Type 5 text commit (5d065b9e6) is additive and does not worsen RECOVER-07 or RECOVER-08 violations; kept rather than reverted
- prerequisite identification: RECOVER-07 correctly identified as earliest open prerequisite preempting all later work

gates_failed:
- RECOVER-07 acceptance: `src/services/runtime-hotpath-install.ts` line 102 still calls `materializeValueExpr(...)` for canonical `shapeRef` steps
- RECOVER-07 acceptance: `src/runtime/ValueExprMaterializer.ts` line 128 still calls `allocShapeBankWords()` and lines 132-147 write canonical shape headers from CPU code
- RECOVER-07 acceptance: `src/services/runtime-hotpath-install.ts` lines 64-66 still resolve dynamic instance counts via `resolveInstanceLaneCount()` during install
- RECOVER-08 acceptance: install still evaluates runtime expressions for canonical path (blocked behind RECOVER-07)
- implementer protocol compliance: implementer advanced to RECOVER-11 despite evaluator note locking active_ticket to RECOVER-07 with next_action revise-active-ticket (violates loop protocol §6 and §11)

evidence:
- `src/services/runtime-hotpath-install.ts:102`: `const buffer = materializeValueExpr(step.field, program.valueExprs, step.instanceId, count, state, program, undefined, INSTALL_MATERIALIZE_SCRATCH, pureFnContext);`
- `src/runtime/ValueExprMaterializer.ts:128`: `const handle = allocShapeBankWords(shapeBank, SHAPE_BANK_HEADER_WORDS);`
- `src/runtime/ValueExprMaterializer.ts:132-147`: `writeShapeBankHeader(shapeBank.data, handle, createShapeBankHeaderV1({...}));` followed by `writeShapeBankHandleMetadata(shapeBank, handle, {...});`
- `src/services/runtime-hotpath-install.ts:64-66`: install loop calls `resolveInstanceLaneCount(instanceDecl, program, state, pureFnContext)` for every instance declaration
- `src/services/runtime-hotpath-install.ts:22`: imports `resolveInstanceLaneCount` from InstanceCountResolver
- `src/services/runtime-hotpath-install.ts:24`: imports `materializeValueExpr` from ValueExprMaterializer
- all three violations are identical to those flagged in the previous evaluator note at commit 93dd46460; no remediation was attempted
- RECOVER-11 commit (5d065b9e6) added 1151 lines of text/glyph shape class code while RECOVER-07 remained unaddressed
