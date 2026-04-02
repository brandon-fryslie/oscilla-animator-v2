# NEW RENDER FIXTURE GATE 14-25 CHECKLIST

## Gate 14: `dispatch-exact-2d`
- [ ] Create fixture file: `src/render/rust/fixtures/dispatch-exact-2d.ts`
- [ ] Implement `DispatchMode::Exact` 2D checkerboard write path
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Add fixture assertion branch in `scripts/check-payload-tester-visible.mjs`
- [ ] Verify install succeeds in payload tester
- [ ] Verify checker hash matches expected golden value

## Gate 15: `dispatch-texture-footprint`
- [ ] Create fixture file: `src/render/rust/fixtures/dispatch-texture-footprint.ts`
- [ ] Implement `DispatchMode::Texture` with non-square target
- [ ] Add border-marker write in compute output
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify border pixels exactly match expected values

## Gate 16: `type-cast-matrix`
- [ ] Create fixture file: `src/render/rust/fixtures/type-cast-matrix.ts`
- [ ] Implement cast/compare matrix for `f32/u32/i32/bool`
- [ ] Emit deterministic per-lane bitmask/checksum
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify checksum equals golden value

## Gate 17: `control-flow-nested`
- [ ] Create fixture file: `src/render/rust/fixtures/control-flow-nested.ts`
- [ ] Implement nested `For + If + Break + Continue + Var/Assign`
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify deterministic band/stripe count and checksum

## Gate 18: `varying-type-matrix`
- [ ] Create fixture file: `src/render/rust/fixtures/varying-type-matrix.ts`
- [ ] Implement varyings for `f32`, `vec2`, `vec3`, `vec4`
- [ ] Use swizzle/index access in fragment recomposition
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify fixed pixel probes match expected channel values

## Gate 19: `multi-draw-single-pass`
- [ ] Create fixture file: `src/render/rust/fixtures/multi-draw-single-pass.ts`
- [ ] Implement 3 draw calls in a single render pass
- [ ] Ensure independent domain dependencies per draw call
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify layer ordering is deterministic across repeated captures

## Gate 20: `texture-pingpong-heat`
- [ ] Create fixture file: `src/render/rust/fixtures/texture-pingpong-heat.ts`
- [ ] Implement two-texture ping-pong compute update
- [ ] Render final sampled texture to canvas
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify total energy metric decays monotonically over N ticks

## Gate 21: `stream-driven-spectral-field`
- [ ] Create fixture file: `src/render/rust/fixtures/stream-driven-spectral-field.ts`
- [ ] Create/update stream driver script: `scripts/push-fixture-stream-frames.mjs`
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Add fixture assertion branch in `scripts/check-payload-tester-visible.mjs`
- [ ] Verify install succeeds in payload tester
- [ ] Verify deterministic stream input produces deterministic checksum sequence

## Gate 22: `atomic-histogram`
- [ ] Create fixture file: `src/render/rust/fixtures/atomic-histogram.ts`
- [ ] Implement particle binning into 256 atomic counters
- [ ] Render histogram bars from counter data
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify invariant: `sum(counters) == particle_count` each frame

## Gate 23: `resize-canvas-relative-chain`
- [ ] Create fixture file: `src/render/rust/fixtures/resize-canvas-relative-chain.ts`
- [ ] Implement chained passes using `relativeTo: 'canvas'` textures
- [ ] Add resize validation script: `scripts/check-payload-resize-sequence.mjs`
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install succeeds in payload tester
- [ ] Verify resize sequence runs without reinstall and without frame dropouts

## Gate 24: `hotswap-preserve-state-proof`
- [ ] Create fixture file: `src/render/rust/fixtures/hotswap-preserve-state-proof.ts`
- [ ] Enable `preserveStateOnRecompile: true`
- [ ] Add hotswap validation script: `scripts/check-hotswap-preserve-state.mjs`
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify install + reinstall both succeed
- [ ] Verify position/state hash persists while visual math changes

## Gate 25: `full-stack-orchestration`
- [ ] Create fixture file: `src/render/rust/fixtures/full-stack-orchestration.ts`
- [ ] Integrate domains + textures + samplers + streams + atomics + varyings + derivatives
- [ ] Cover resize + hotswap behavior in one orchestrated run
- [ ] Add orchestration validation script: `scripts/check-full-stack-orchestration.mjs`
- [ ] Register fixture in `src/render/rust/fixtures/index.ts`
- [ ] Verify 300-tick run passes with no diagnostics and all invariants green

## Cross-Cutting Completion
- [ ] `pnpm -s typecheck` passes
- [ ] All new fixtures install in payload tester without worker/runtime faults
- [ ] All fixture-specific deterministic assertions pass
- [ ] Update `design-docs/NEW-RENDER-FIXTURE-GATE-14-to-25.md` with final status notes
