### 🎯 Prompt: M1 Strike 3 - Eradicate CPU-Side Payload Parsing

**Context:**
Read `design-docs/M1_Migration_Onboarding.md` first. We are executing M1 Strike 3. Strikes 1 and 2 are complete.

**Objective:**
Remove CPU-side payload scanning/parsing used to discover runtime execution parameters. Rust should execute compiler-provided numeric arguments for dispatch/count/offset data instead of deriving those values from ShapeBank or sink descriptor payload scans.

`// [LAW:dataflow-not-control-flow] Runtime stages execute in fixed order; variability comes from compiler-provided values.`
`// [LAW:single-enforcer] Compile/install boundary is the only place where these execution integers are derived.`

**Current seam snapshot (for orientation only):**
- Payload parsing in runtime: `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- Compute pass contract and dispatch setup: `src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs`, `src/render/rust/worker-protocol.ts`
- Compiler/install artifact producers: `src/compiler/backend/compiled-runtime-install-contract.ts`, `src/runtime/DrawPrepSinkTablePacker.ts`, compiler IR types in `src/compiler/ir/program.ts`

## Scope of Work

1. **Remove instance-count discovery loop from sink payload parsing**
- Eliminate the loop in `sync_sink_table_plane_and_parse_regions` (or equivalent) that iterates descriptor words to derive `total_instance_count`.
- Replace with compiler/install-provided integers carried in typed runtime ABI fields.

2. **Remove ShapeBank CPU parsing for control-point slot discovery**
- Delete `resolve_shape_bank_control_point_slots` (or equivalent behavior).
- Replace with compiler/install-provided numeric patch payload (for example explicit shape-handle patch records), so Rust does not scan ShapeBank headers to find CP slot metadata.

3. **Make compute pass dispatch dimensions explicit in ABI**
- Extend pass contract (`RustRendererGpuPass` / Rust-side pass spec / compiled artifact) to carry explicit dispatch workgroup dimensions (`x,y,z` or equivalent).
- Runtime dispatch path must use provided integers directly when calling `dispatch_workgroups(...)`.
- Remove fallback derivation based on legacy counters in active path.

4. **Keep validation boundary strict, hot path blind**
- At ingest/rebuild boundary, validate argument ranges once.
- During per-frame execution, use validated integers directly without payload discovery scans.

5. **Update contract tests and fixtures**
- Add/update tests proving that runtime behavior is correct when all dispatch/count/offset values are precomputed and provided by artifacts.

## Non-Goals

1. Do not redesign ShapeBank format unless strictly required to remove CPU parsing seam.
2. Do not refactor unrelated scheduler/telemetry systems.
3. Do not introduce secondary runtime derivation paths “for safety.”

## Deliverables

1. Runtime no longer computes dispatch/count/offset values by scanning sink/shape payload words in active path.
2. ABI/contracts updated to carry required numeric execution arguments.
3. Tests updated to assert contract behavior with compiler-provided values.

## Machine-Verifiable Done Criteria

1. No active-path loop over sink/shape payload words whose purpose is to discover dispatch counts/instance totals/control-point offsets.
2. `resolve_shape_bank_control_point_slots` (or equivalent payload-discovery function) is removed from active runtime path.
3. Compute dispatch uses ABI-provided workgroup dimensions, not inferred particle/domain caps.
4. Build and migration-readiness checks pass.
5. Canonical fixtures render correctly with zero CPU-side payload discovery.

## Validation Commands

1. `pnpm -s typecheck`
2. `pnpm -s build`
3. `pnpm -s test:migration-readiness`
4. Run targeted tests for updated install/dispatch contracts.

## Constraints

- Compiler/install artifacts are the only source of truth for execution integers.
- Keep changes seam-local and incremental.
- Avoid introducing feature flags unless they have owner + removal plan.
