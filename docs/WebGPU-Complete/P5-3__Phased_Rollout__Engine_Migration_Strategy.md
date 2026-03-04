> Alignment Notice (2026-02-27)
> [LAW:one-source-of-truth] The canonical lowering boundary is `src/compiler/ir/naga-emitter/*` and `docs/compiler/ONE-TRUE-EMITTER.md`.
> [LAW:dataflow-not-control-flow] Control flow is represented as recursive Naga blocks with lexical scopes, not flat instruction lists.
> [LAW:no-string-math] Direct WGSL string generation in lowering code is forbidden; dynamic WGSL emission is an engine serializer boundary concern.
> Read this document with `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`.

This is the comprehensive technical specification for **The Developer Experience & Migration Strategy: Post-Cutover Fix-Forward Execution**.

# The Developer Experience: Post-Cutover Rollout

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P5-1__WASM_Boot__Developer_Experience_&_Migration.md`
- `docs/WebGPU-Complete/P5-2_Error_Propagation__Developer_Experience.md`
- `docs/WebGPU-Complete/P2-4__Scoped_Naga_IR_Control_Flow_and_Memory_Model.md`

**Objective:** Execute WebGPU migration completion work on top of a WebGPU-only engine.

**Core Policy:** No backward compatibility layers, no dual-runtime operation, no runtime fallback toggles.

// [LAW:one-source-of-truth] WebGPU runtime and compiler outputs are the only authoritative execution path.
// [LAW:single-enforcer] Runtime capability and execution invariants are enforced at one boundary, not duplicated across fallback paths.
// [LAW:dataflow-not-control-flow] Frame loop and compiler stages run in fixed order; variability is expressed in data, not mode switches.

## 1. Strategic Shift from Legacy Migration to Fix-Forward

The prior staged migration model (dual runtime + feature-flag ownership switching + rollback toggles) is intentionally deprecated.

### 1.1 What is removed

1. Parallel v2/v3 runtime execution.
2. CPU-render fallback modes (Canvas2D/SVG) for migration safety.
3. Runtime feature flags that switch engine ownership.
4. Graph-wide fallback for unported blocks.
5. Canary-style rollback guidance based on deployed customer impact.

### 1.2 What replaces it

1. Single WebGPU runtime contract.
2. Fix-forward bug handling: patch master, add invariant tests, continue forward.
3. Strict compile-time/runtime validation over runtime mode switching.
4. Aggressive deletion of dead migration seams.

// [LAW:no-mode-explosion] Migration flags are removed because they create non-canonical execution permutations.
// [LAW:verifiable-goals] Every rollout step below includes deterministic acceptance criteria.

## 2. Non-Negotiable Migration Invariants

1. **One engine path:** Runtime executes only WebGPU orchestration.
2. **No compatibility shims:** New work must not preserve legacy executor semantics unless required by current canonical spec.
3. **No hidden fallback:** Errors fail fast with explicit diagnostics.
4. **Fix-forward only:** Defects are corrected in place with test coverage; no feature-toggle retreat strategy.
5. **Canonical docs:** Architecture and rollout docs must match current code reality.

// [LAW:no-silent-fallbacks] Fail explicitly; do not silently route to older render/runtime paths.
// [LAW:one-way-deps] Compiler/runtime boundaries remain directional; renderer does not own compiler truth.

## 3. Phased Execution Plan (WebGPU-Only)

Phases remain useful for sequencing work, but they are no longer migration-between-engines phases. They are completion phases on one engine.

### Phase A: Canonicalization & Dead-Seam Removal

**Goal:** Eliminate remaining references to migration-era assumptions.

1. Remove legacy terminology and stale docs that imply dual runtime ownership.
2. Keep or add forbidden-pattern tests preventing reintroduction of Canvas2D/SVG runtime dependencies.
3. Ensure startup contract is explicit: WebGPU required, fail fast when unavailable.

**Acceptance:**
1. `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`
2. `pnpm run typecheck`

### Phase B: Compiler/Runtime Contract Completion

**Goal:** Complete v3 pipeline ownership by compiler-generated artifacts.

1. Finish compiler-generated draw-prep integration as the authoritative indirect-args writer.
2. Ensure runtime loop remains canonical and deterministic.
3. Keep state update policies centralized and test-enforced.

**Acceptance:**
1. `pnpm vitest run src/compiler/__tests__/steel-thread-dual-topology.test.ts`
2. `pnpm vitest run src/render/webgpu/__tests__/WebGPURenderer.test.ts`
3. `pnpm vitest run src/services/__tests__/AnimationLoop.test.ts src/runtime/__tests__/executeFrameStepped.test.ts`

### Phase C: Continuity & Observability Hardening

**Goal:** Preserve edit/hot-swap continuity and non-blocking debug visibility without altering canonical render ownership.

1. Implement continuity gauge-offset subsystem in canonical arena/state boundaries.
2. Implement spy compute async readback as observability seam (not render dependency).
3. Expand invariant tests to prevent hidden CPU hot-path regressions.

**Acceptance:**
1. `pnpm vitest run src/runtime/__tests__/continuity-integration.test.ts src/runtime/__tests__/phase-continuity-offset.test.ts`
2. `pnpm vitest run src/runtime/__tests__/StepDebugSession.test.ts src/ui/debug-viz/ValueRenderer.test.ts`
3. `pnpm vitest run src/__tests__/forbidden-patterns.test.ts`

### Phase D: Performance & Allocation Discipline

**Goal:** Stabilize hot-path behavior under high instance counts on the canonical WebGPU path.

1. Finalize canonical packed instance layout ownership.
2. Ensure no per-frame allocation except explicit growth events.
3. Validate upload and command generation consistency under stress.

**Acceptance:**
1. WebGPU renderer test suite passes.
2. Bench/perf scripts (where present) show stable frame-time variance at high counts.

### Phase E: Integration Demo & Documentation Lock

**Goal:** Ship an end-to-end steel-thread proof and align docs with shipped behavior.

1. Add/update a v3 demo patch that exercises compile -> compute -> draw-prep -> indirect render.
2. Ensure docs describe only current canonical behavior.
3. Close remaining migration-prep beads with linked acceptance evidence.

**Acceptance:**
1. `pnpm test -- integration`
2. Targeted v3 suites pass as defined in open beads child tasks.

## 4. Defect Handling Policy (Fix-Forward)

When a defect is discovered:

1. Reproduce with a deterministic test.
2. Patch the canonical WebGPU path.
3. Add/strengthen guardrails so regression is mechanically blocked.
4. Land forward on master.

Prohibited responses:

1. Reintroducing runtime fallback engines.
2. Adding temporary dual-execution reconciliation layers.
3. Shipping feature flags that split canonical engine ownership.

// [LAW:single-enforcer] Bug fixes must reinforce one owning boundary per invariant.
// [LAW:behavior-not-structure] Tests assert behavioral contracts, not preservation of migration-era structure.

## 5. Block Porting Policy

The old "fallback entire graph to legacy" rule is retired.

New rule:

1. All blocks must compile/execute on the canonical v3 path.
2. Missing functionality is a compile-time diagnostic and a prioritized fix-forward task.
3. No runtime graph-routing to deprecated engines.

// [LAW:one-source-of-truth] There is one executable graph target: WebGPU pipeline artifacts.

## 6. Configuration Policy

Configuration may tune behavior (limits, debug cadence, buffer sizing), but may not introduce alternate engine modes.

Allowed:

1. Debug observability cadence.
2. Capacity and buffer growth thresholds.
3. Test-only knobs guarded from production runtime paths.

Disallowed:

1. `USE_LEGACY_RENDERER`
2. `USE_GPU_SCALARS`-style migration ownership toggles
3. Any flag that changes which engine owns frame execution

// [LAW:no-mode-explosion] Configuration is constrained to parameter tuning, not architecture branching.

## 7. Updated Summary

1. Migration is no longer "legacy to WebGPU"; it is now **WebGPU completion and hardening**.
2. Execution is **single-path and fix-forward**.
3. Backward compatibility is intentionally out of scope for unreleased software.
4. Success is measured by deterministic tests, invariant gates, and elimination of legacy seams.

This strategy optimizes for delivery velocity, architectural integrity, and long-term maintainability on the engine that will actually ship.
