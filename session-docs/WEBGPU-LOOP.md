Evaluator Note

active_ticket: RECOVER-04
evaluated_commit: 6ae4f9eca
repo_base_for_next_run: HEAD
verdict: revise
next_action: revise-active-ticket

do:
- RECOVER-04 owns restoring the visible Type 1 baseline. The canvas is still dark.
- The WGSL uniformity fix and shapeWordOffset fix from this commit are correct — keep them.
- The pipeline creation error is gone. The remaining problem is that no geometry renders visibly despite the pipeline being valid.
- Investigate the data flow from compiler simulation → arena → instance assembly → draw prep → render. The most likely failure points are:
  1. **vertexCount mismatch**: `buildCanonicalTopologyHeaders` stores `topology.totalControlPoints` as `ShapeBankHeaderWord.VertexCount`. For non-indexed triangle fan draws, the draw prep compute reads this as the draw vertex count. But the vertex shader fan-triangulates internally: `vertexIndex / 3` selects triangle, `vertexIndex % 3` selects corner. So `totalControlPoints` vertices only produces `floor(N/3)` triangles instead of `(N-2)` triangles. For a closed polygon with N CPs, the correct non-indexed vertex count is `(N-2) * 3`. Fix: write `(totalControlPoints - 2) * 3` to `ShapeBankHeaderWord.VertexCount` for closed paths, and `totalControlPoints` for open paths.
  2. **Simulation WGSL → arena → vertex shader data flow**: Verify the compiler-emitted simulation WGSL actually writes CP positions at the arena addresses the topology header points to (words 11, 14, 15 = cpArenaBaseOffset, cpArenaLaneStride, cpArenaComponentStride). If the simulation WGSL writes to different arena slots than what the topology header references, the vertex shader reads zeros.
  3. **Instance count**: Verify `staticInstanceCount` in descriptors is non-zero. If it's 0, draw prep writes 0 instances and nothing renders. Check what `instance.count` resolves to for breathing-ring.
- Add temporary console.log in `buildRuntimeHotpathInstallPlanes` to dump: shapeRefSteps count, shapeBankWordCount, sinkTableWordCount, header.totalRecordCount, and descriptor static instance counts. This will narrow down whether the issue is in data production or GPU consumption.
- After confirming data, use the debug readback (RECOVER-10) to inspect indirect args and instance data on the GPU side.

avoid:
- Do NOT revert the WGSL uniformity fix or the shapeWordOffset fix — both are correct.
- Do NOT advance to any post-RECOVER-04 work while the canvas is dark.
- Do NOT reintroduce CPU mesh realization.
- Do NOT accept structural-only proofs without a visible render screenshot.
- Do NOT delete RECOVER-11 Type5 text shader code — fix it, don't remove it.

gates_passed:
- typecheck: clean (0 errors)
- build: clean (vite, 14.85s)
- all tests: 1956 passed (171 files)
- pipeline creation: no more WEBGPU_VALIDATION error — uniformity fix confirmed working
- shapeWordOffset: findShapeRefExpr resolves through broadcast wrappers

gates_failed:
- visible baseline: canvas is completely dark across all 9 burst frames — no geometry renders
- baseline ownership: the loop cannot advance while visuals are broken

evidence:
- screenshot `/tmp/oscilla-test-screenshots/breathing-ring_burst_3x3_100ms_20260315-233104.png`: 9 frames all show dark canvas with no error message (pipeline creates successfully but nothing renders)
- prior screenshot showed "Initial compilation failed: [WEBGPU_VALIDATION]..." — that error is now gone, confirming the uniformity fix worked
- diff review: dpdx/dpdy moved to uniform control flow in `default_shaders.rs:499-503` (correct fix)
- diff review: `findShapeRefExpr` in `runtime-hotpath-install.ts:54-72` resolves through expression wrappers (correct fix)
- vertexCount concern: `buildCanonicalTopologyHeaders` line 128 stores `topology.totalControlPoints` as VertexCount, but vertex shader fan-triangulation consumes `(N-2)*3` vertices for closed polygons — potential mismatch
- draw mode is `nonIndexed` (confirmed at `compile.ts:960`), so `draw_indirect` is used, reading from topology bank SHAPE_WORD_VERTEX_COUNT
- no Rust source regressions since RECOVER-11 commit (verified via git log)
