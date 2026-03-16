Evaluator Note

active_ticket: RECOVER-04
evaluated_commit: 0f6c5a2ab
repo_base_for_next_run: HEAD
verdict: revise
next_action: revise-active-ticket

do:
- RECOVER-04 owns restoring the visible Type 1 baseline. The canvas is still broken.
- Root cause identified: RECOVER-11 (commit 5d065b9e6) added `dpdx()`/`dpdy()` derivative calls inside a `if (input.shape_class == SHAPE_CLASS_TYPE5_TEXT)` branch in the uber shader fragment stage. `shape_class` is `@interpolate(flat)`, so Chrome/Tint's static uniformity analysis rejects the shader — derivative operations are not allowed in non-uniform control flow per WGSL spec. This kills the entire render pipeline at creation time.
- The fix is in `src/render/wasm/rust/oscilla-rust-renderer/src/default_shaders.rs` lines 546-548: move the `dpdx`/`dpdy` calls BEFORE the shape_class branch (compute them unconditionally), then use the precomputed values inside the branch. This satisfies WGSL uniformity requirements.
- After fixing the shader, rebuild the WASM: `npm run build:rust-renderer`.
- Verify with `./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl` — the Type 1 path must render visibly.
- Keep all RECOVER-07/08/09/10 ownership boundaries intact.

avoid:
- Do NOT remove the Type5 text shader code entirely — it should be fixed, not deleted. RECOVER-11 will need it later.
- Do NOT advance to RECOVER-11 or any post-core work while the baseline is broken.
- Do NOT reintroduce CPU mesh realization.
- Do NOT accept structural-only proofs without a visible render screenshot.

gates_passed:
- RECOVER-08 acceptance criteria verified and ticket closed: install path takes only CompiledProgramIR, no materializeValueExpr/resolveInstanceLaneCount/RuntimeState dependency
- typecheck: clean (0 errors)
- build: clean (vite, 15.85s)
- all tests: 1956 passed (171 files)
- ticket/tracker alignment: RECOVER-04 reopened as the earliest leaf that owns visible baseline

gates_failed:
- visible baseline: WebGPU validation error "Invalid RenderPipeline Render.UberPipeline" — the render pipeline fails to compile due to WGSL uniformity violation in the RECOVER-11 uber shader additions
- baseline ownership: the loop cannot advance while visuals are broken

evidence:
- screenshot `/tmp/oscilla-test-screenshots/breathing-ring_burst_3x3_100ms_20260315-230425.png`: 9 frames all show "Initial compilation failed: [WEBGPU_VALIDATION] [Invalid RenderPipeline "Render.UberPipeline"]"
- root cause: `default_shaders.rs:546-548` — `dpdx(input.uv.x)` and `dpdy(input.uv.y)` called inside `if (input.shape_class == SHAPE_CLASS_TYPE5_TEXT)` branch; `shape_class` is `@interpolate(flat)` which Chrome/Tint treats as non-uniform, making derivatives illegal under WGSL uniformity rules
- RECOVER-11 commit `5d065b9e6` introduced the Type5 text/MSDF shader code; the WASM binary in `src/render/wasm/pkg/` was built with these changes; no subsequent commits reverted the Rust source
- RECOVER-08 (lit-b90e7a20-f0ed548a) closed: all acceptance criteria met in current repo state by RECOVER-07's install path rewrite
- no Rust source changes after RECOVER-11 commit (verified via `git log 5d065b9e6..HEAD -- src/render/wasm/rust/`)
