Evaluator Note

active_ticket: RECOVER-04
evaluated_commit: 68417cf6b
repo_base_for_next_run: HEAD
verdict: accept-complete
next_action: advance-to-next-ready-ticket

do:
- RECOVER-04 is complete. The visible Type 1 baseline is restored.
- RECOVER-M1 milestone is also closed (both children RECOVER-03 and RECOVER-04 accepted).
- RECOVER-05 through RECOVER-10 were previously closed.
- The next open leaf ticket is RECOVER-11 (Type 2 parametric foundation), but it requires the post-RECOVER-10 validation gate to be explicitly completed first per the ROADMAP.
- Before starting RECOVER-11, the implementer must perform and record the post-RECOVER-10 validation gate:
  1. Visible Type 1 output remains stable across swaps and frame updates
  2. Recovered ownership boundaries from RECOVER-07 through RECOVER-10 still hold in the active path
  3. Readback/observability is sufficient to debug the next class
  4. No hidden CPU precompute or compatibility route has re-entered the canonical path
- The accepted visible baseline is now: breathing-ring.hcl renders colored animated polygons in a ring pattern through the canonical GPU-owned ShapeBank/topology path.

avoid:
- Do NOT start RECOVER-11 without completing the post-RECOVER-10 validation gate first.
- Do NOT regress the restored visible baseline.
- Do NOT reintroduce CPU mesh realization for any slice.
- Do NOT skip the validation gate by assuming RECOVER-05–10 closures imply validation.

gates_passed:
- typecheck: clean (0 errors)
- build: clean (vite, 12.15s)
- all tests: 1956 passed (171 files)
- visible baseline: breathing-ring renders colored animated polygons across 9 burst frames
- fan-triangulation vertex count: (N-2)*3 for closed paths — geometrically correct
- bitcast topology offset: bitcast<u32> preserves bit patterns for denormal-safe recovery
- acceptance criteria 1: shape class renders visibly without CPU mesh realization — YES
- acceptance criteria 2: active path does not depend on CPU-generated vertex/index buffers — YES
- acceptance criteria 3: old worker CPU realization path removed/dead — YES
- acceptance criteria 4: visible baseline restored with runtime evidence — YES
- prerequisite integrity: RECOVER-01, 02, 03 remain validly closed

gates_failed:
- (none)

evidence:
- screenshot `/tmp/oscilla-test-screenshots/breathing-ring_burst_3x3_100ms_20260315-235739.png`: 9 frames showing colored animated polygons in ring pattern — visible rendering restored
- prior evaluation screenshot showed completely dark canvas — confirming this commit fixed the rendering
- diff review: `runtime-hotpath-install.ts:128-138` — fan-triangulation vertex count corrected from `totalControlPoints` to `(cpCount-2)*3` for closed paths
- diff review: `default_shaders.rs:431-433` — topology offset recovery changed from `u32(max(...))` to `bitcast<u32>(...)` to preserve bit patterns
- WASM binary updated (393372 → 393540 bytes) confirming Rust rebuild included the bitcast fix
- RECOVER-04 ticket closed in tracker
- RECOVER-M1 milestone closed in tracker
