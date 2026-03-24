### 🎯 Prompt: M1 Strike 2 - Eradicate String-Based Sink Routing

**Context:**
Read `design-docs/M1_Migration_Onboarding.md` first. We are executing M1 Strike 2. Strike 1 (domain caps) is complete.

**Objective:**
Remove string-based sink routing from the runtime boundary and hot path. Rust must not parse sink-pointer strings or store sink routing as `HashMap<SinkPointerKey, String>`.

`// [LAW:one-source-of-truth] Sink routing layout is compiler-owned and transported as typed numeric data.`
`// [LAW:locality-or-seam] Remove the string seam without rewriting unrelated renderer subsystems.`

**Current seam snapshot (for orientation only):**
- String transport/messages: `src/render/rust/worker-protocol.ts`, `src/render/rust/engine.worker.ts`, `src/render/wasm/oscilla_rust_renderer.ts`, `src/render/wasm/rust/oscilla-rust-renderer/src/lib.rs`
- Runtime string map + parsing: `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- Compiler install contract/source data: `src/runtime/DrawPrepSinkTablePacker.ts`, `src/compiler/backend/compiled-runtime-install-contract.ts`

## Scope of Work

1. **Delete string routing boundary contracts**
- Remove `SET_SINK_POINTER_MAP` message contract and callsites from worker protocol and worker/renderer bridge.
- Remove WASM export bridge path that accepts stringified sink pointer JSON.

2. **Remove runtime string structures and parsers**
- Delete from Rust engine:
  - `SinkPointerSemantic`
  - `SinkPointerKey`
  - `sink_pointer_map: HashMap<SinkPointerKey, String>`
  - `set_sink_pointer_map(...)`
  - `parse_sink_pointer_key(...)`
  - `sink_pointer_resource_id(...)`
- Ensure no per-frame/hot-path string lookup remains for sink descriptor routing.

3. **Emit typed numeric sink routing from compiler/install boundary**
- Update compiler/install-plane output to carry sink descriptor routing as flat numeric payloads (triplets or equivalent typed arrays), not symbolic strings.
- Route through existing transport surfaces (`CompiledProgramIR`-adjacent install artifacts and/or shared sink-table plane).
- Do not add new ad hoc JSON contracts.

4. **Rust sink descriptor patching becomes blind numeric patching**
- Replace symbolic lookup logic with direct application of provided numeric routing payload.
- Rust may validate shape/range once at install boundary, then patch descriptor words without symbolic resolution.

5. **Compatibility boundary (if needed) must be one place only**
- If temporary compatibility is required, isolate it to one ingress boundary and mark it clearly for deletion in M1 follow-up.
- No compatibility branching in hot loops.

## Non-Goals

1. Do not redesign draw-prep descriptor format beyond what is required to remove strings.
2. Do not rewrite shader pipelines or render pass orchestration.
3. Do not introduce a second sink routing source of truth.

## Deliverables

1. Code changes removing string sink routing seam.
2. Updated tests for sink table packing/installation contract.
3. Brief migration note in PR description listing removed string contracts and new numeric transport fields.

## Machine-Verifiable Done Criteria

1. `rg "SET_SINK_POINTER_MAP|set_sink_pointer_map|SinkPointerKey|SinkPointerSemantic" src/render` returns no active runtime-path usage.
2. `rg "HashMap<.*String|parse_sink_pointer_key|sink_pointer_map" src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` returns no active sink-routing logic.
3. Build and tests pass for touched areas.
4. Runtime still boots and renders canonical fixtures with sink descriptors correctly patched.
5. Profiling/log review shows no string parsing/hashing in pipeline rebuild or sink-table sync phases.

## Validation Commands

1. `pnpm -s typecheck`
2. `pnpm -s build`
3. `pnpm -s test:migration-readiness`
4. Run targeted tests touched by sink-table contract changes (for example `DrawPrepSinkTablePacker` tests).

## Constraints

- Prefer small, seam-local refactors.
- Keep behavior deterministic and data-driven.
- Do not ask the user to perform validation that can be run by the agent.
