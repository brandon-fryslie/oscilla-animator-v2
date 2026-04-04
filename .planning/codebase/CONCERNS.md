# Codebase Concerns

**Analysis Date:** 2026-04-05

## Tech Debt

### V1 Backend & Runtime (Legacy Code — Scheduled for Deletion)

**Status:** Dead code replacement in progress via strangler fig pattern. DO NOT FIX — only fix C1 backend (`src/compiler/backend-v2/`) and C1 blocks (`src/blocks-v2/`).

**Files affected:**
- `src/compiler/backend/`: V1 compilation pipeline (DepGraph → SCC → Lower → Schedule)
- `src/compiler/backend/lower-blocks.ts` (1,626 lines): Block lowering for V1, heavy with special cases
- `src/compiler/backend/render-materialization-pipeline.ts` (802 lines): Render target allocation for V1 canvas/SVG
- `src/runtime/`: JS frame executor (signal kernels, field kernels, state migration)
- `src/runtime/ValueExprMaterializer.ts` (1,394 lines): Materializes IR into runtime types, dense coupling
- `src/blocks/registry.ts` (1,190 lines): V1 block registry via `defineBlock()` API — LEGACY

**Why it's debt:** The V1 pipeline produces `CompiledProgramIR` for a JS runtime that renders to stub Canvas2D/SVG. Being replaced by Rust/WASM/WebGPU C1 pipeline. Every enhancement, fix, or refactor here is wasted energy.

**Fix approach:** Continue strangler fig migration. Block work on V1 code. Migrate high-value blocks to C1 as needed for feature parity. Delete V1 once C1 reaches feature parity.

---

### Scattered TODO Comments in V1 Code

**Issue:** 50+ TODO comments scattered throughout V1 backend, cardinality solver, and render pipeline. Most indicate known-wrong code.

**Files:**
- `src/compiler/frontend/cardinality/solve.ts`: 10+ "This code is wrong" comments (lines 30, 507, 509, 612, 614, 648, 651, 662)
- `src/compiler/backend/render-materialization-pipeline.ts`: 25+ "This code is wrong" comments (lines 131, 134, 136, 191, 254–278, 293–295, 302–317, 339, 649, 733)
- `src/compiler/backend/lower-blocks.ts`: 2 "This code is wrong" (lines 795, 1336)
- `src/services/RuntimeService.ts`: 3 "TODO: Rebuild with new PipelineInstallPayload path" (lines 72, 472, 486)
- `src/services/FastPathController.ts`: 1 "TODO(phase-2): wasm.update_control" (line 59)
- `src/services/AnimationLoop.ts`: 1 "TODO: Frame-input publishing path being rebuilt" (line 476)

**Impact:** Code marked as wrong is still in production. These comments indicate:
1. Known correctness issues that have not been fixed
2. Incomplete transitions (V1 → C1 migration incomplete)
3. Deferred architectural decisions

**Fix approach:** For C1 paths, fix properly. For V1 code, accept as-is — it will be deleted. The cardinality solver TODOs need immediate attention if they block type system completeness.

---

## Known Bugs

### C1 Backend Zod Validation Failures

**Symptoms:**
- `PipelineInstallPayload` from C1 compiler fails Zod schema validation
- 3 tests failing as of last run: spinning-ring and dynamic-ring fixtures + boundary coverage test

**Files:**
- `src/compiler/backend-v2/__tests__/integration.test.ts` (lines 15–28, 110–127): Tests expect valid payloads
- `src/render/gpu-ir/__tests__/boundary-coverage.test.ts` (line 58): Texture specs test

**Trigger:** Compile spinning-ring or dynamic-ring fixture through C1 backend → serialization → Zod parse fails

**Specific issues:**
1. Missing required fields in render pass specs (sampleCount, viewport, scissorRect undefined in roster[2])
2. Texture dimension spec mismatch: expected `{ relativeTo: 'canvas', scale: 1 }` objects, but receiving plain numbers `800` / `600`

**Workaround:** Tests skip the Zod check if compilation fails; payloads are generated but not validated

**Fix approach:**
1. RenderPassSpec contract mismatch: check `src/render/rust/boundary-contract.ts` vs `src/compiler/backend-v2/roster-assembly.ts` — specs missing fields during allocation
2. Texture dimension handling: `TextureDimensionSpec` should accept both number (for computed) and objects (for relative); fix union type in schema or fixer in roster assembly

---

### Cardinality Solver TODO Comments (isCardinalityVarAxis Function)

**Issue:** Line 30-35 in `src/compiler/frontend/cardinality/solve.ts` — function marked "This code is wrong"

**Current code:**
```typescript
// TODO: This code is wrong.  Figure out the right way to fix this
function isCardinalityVarAxis(
  axis: Axis<CardinalityValue, CardinalityVarId>,
): axis is CardinalityVarAxis {
  return axis.kind === 'var';
}
```

**Problem:** The function is a type guard that checks `axis.kind === 'var'`. The TODO suggests the implementation or the predicate itself is incorrect. This is in the core solver logic that resolves cardinality (signal/field cardinality).

**Impact:** If this predicate is wrong, cardinality variable detection could silently fail, leading to incorrect signal/field inference downstream.

**Fix approach:**
1. Verify intent: should this check ONLY `kind === 'var'` or check other conditions?
2. Look at how `CardinalityVarAxis` is defined vs. what the predicate checks
3. Add assertion tests that verify cardinality variables are correctly identified before and after solving

---

## Test Coverage Gaps

### C1 Backend Block Coverage

**What's not tested:** Only 10 of ~200 blocks migrated to C1. Only these are fully tested:
- `Const`, `Add`, `Subtract`, `Multiply`, `Divide`, `Sin`, `Cos`, `InfiniteTimeRoot`, `InstanceIndex`, `RenderInstances2D`

**Files:**
- `src/blocks-v2/`: Only 10 registered blocks
- `src/compiler-tester/fixtures/`: Two test fixtures (spinning-ring, dynamic-ring) — both minimal

**Risk:** Blocks not yet in C1 fall back to V1 pipeline (untested in new backend). Feature gaps in C1 block library block full migration.

**Priority:** High — blocks full migration to C1

---

### GPU-IR Fixture Roundtrip (Boundary DSL Compilation)

**What's not tested:** Roundtrip: DSL expression → ExprIR → WGSL → validation

**Files:**
- `src/render/gpu-ir/__tests__/boundary-coverage.test.ts`: Texture spec test failing
- `src/render/rust/fixtures/`: 6 fixtures defined but coverage incomplete

**Risk:** ExprIR AST construction or Boundary DSL walkers could produce invalid WGSL that only fails at Rust translator time (not caught by TS tests)

**Priority:** Medium — visual validation via screenshot scripts is the gate, but unit tests would catch issues earlier

---

### Type System Invariant Tests

**What's not tested:** 17 type system guardrails from `.claude/rules/TYPE-SYSTEM-INVARANTS.md` have NO dedicated invariant tests. Code could violate these without failing:

1. Parallel type systems (SignalType vs CanonicalType coexisting)
2. Axis vars leaking into backend IR
3. Missing CanonicalType on value-producing nodes
4. Kind stored directly instead of derived from extent
5. Multiple enforcement gates for axis validation
6. Untyped constants or untyped slots

**Files:** `src/__tests__/forbidden-patterns.test.ts` (architectural constraint enforcement)

**Fix approach:** Add invariant test suite that checks:
- Every ValueExpr variant has CanonicalType
- No Axis.kind:'var' in backend IR
- No parallel type systems in IR
- deriveKind() is total and deterministic

---

## Fragile Areas

### Cardinality Solver (High Risk)

**Files:** `src/compiler/frontend/cardinality/solve.ts` (697 lines)

**Why fragile:**
- 10+ TODO comments indicating known-wrong code paths
- 5-phase algorithm with phase interdependencies (Union-Find → group facts → local resolution → PromoteToMany fixpoint → finalization)
- Fixpoint logic could loop infinitely or miss constraints
- Unresolved instance variables are silently defaulted (no error reporting in all paths)

**Safe modification:**
- DO NOT change constraint accumulation or phase ordering without adding dedicated tests
- Each phase should have unit tests that verify inputs/outputs in isolation
- Add assertion tests for invariants: "no cardinality var escapes without resolution", "no conflicts after finalization"

**Test coverage:** 15+ tests but some paths untested (zero cardinality as universal donor, mixed instance bindings)

---

### V1 Block Lowering Pipeline (High Risk — But Don't Touch)

**Files:** `src/compiler/backend/lower-blocks.ts` (1,626 lines) + `render-materialization-pipeline.ts` (802 lines)

**Why fragile:**
- Dense coupling between block registry, IR lowering, and materialization
- Field kernel paths (lane tracking, strided writes) are error-prone
- Render materialization allocates slots through shadow allocator logic (now moved to `continuity-pipeline.ts` but V1 still uses old path)
- Multiple TODOs indicate corner cases not fully handled

**Safe modification:** DON'T. This is V1 code scheduled for deletion. If a bug in V1 affects users, accept it or migrate the block to C1.

---

### SharedArrayBuffer + Atomics for Renderer Heartbeat (Medium Risk)

**Files:**
- `src/compiler-tester/CompilerTesterApp.tsx` (line 149): `new SharedArrayBuffer(HEARTBEAT_BUFFER_BYTES)`
- `src/payload-tester/PayloadTesterApp.tsx` (line 124): Same pattern
- `src/services/cross-origin-isolation.ts`: Enables SharedArrayBuffer via headers

**Why fragile:**
- SharedArrayBuffer requires Cross-Origin-Isolation headers (COOP/COEP)
- Atomics-based heartbeat is zero-overhead but opaque — hard to debug if out-of-sync
- Browser support varies (Safari, older Chrome require flags/configuration)
- If isolation headers are misconfigured, SharedArrayBuffer creation silently fails → worker uses polling instead

**Safe modification:**
- Verify COOP/COEP headers on every environment (dev, test, prod)
- Add fallback to polling if SharedArrayBuffer unavailable
- Document requirements in dev setup guide

---

### Type System During Migration (High Risk)

**Area:** Type inference and axis validation during V1 → C1 migration

**Risk:** Two parallel implementations exist:
1. Frontend type solver (shared): `src/compiler/frontend/payload-unit/solve.ts`, `cardinality/solve.ts`
2. V1 backend: applies type information but doesn't enforce all constraints
3. C1 backend: expects fully-typed IR from frontend

**Files:**
- `src/compiler/frontend/payload-unit/solve.ts` (777 lines): Solver is canonical
- `src/compiler/frontend/cardinality/solve.ts` (697 lines): Cardinality is canonical
- `src/core/canonical-types/`: Single source of truth but used by both backends

**Issue:** If frontend changes type behavior, V1 may still work (legacy bypass) while C1 breaks. The two paths mask each other's bugs.

**Fix approach:**
- NO feature flags: tests control which backend runs, not runtime toggles
- C1 validation is stricter than V1; run both on all patches and report if they diverge
- Eventually: V1 tests removed, C1 is the only path

---

## Scaling Limits

### Debug Issue Buffer Capping

**Current capacity:** 128 issues max (`src/services/DebugService.ts` line 106)

**Limit trigger:** Long-running animations with many errors fill buffer, oldest issues drop silently

**Files:** `src/services/DebugService.ts` (lines 1041–1055)

**Workaround:** Issues splice oldest when buffer full; sampling lost

**Fix approach:** Either increase cap (memory cost) or implement ring buffer with explicit drop notification

---

### Memory Arena for GPU Buffers

**Current:** Pre-allocated arena in `RenderBufferArena` for GPU textures/buffers

**Limit:** Fixed by domain capacities (e.g., 64 instances for dots domain)

**Issue:** Exceeding capacity causes allocation failures; no graceful degradation

**Fix approach:** Future work — dynamic arena expansion or streaming domains

---

## Security Considerations

### No `.env` File Requirements (Good)

**Status:** Project uses compile-time configuration and localStorage. No sensitive secrets in `.env`.

**Observation:** No `.env` file in repo, no stored credentials. Configuration via localStorage or compile-time constants.

**Recommendations:**
- Keep it this way; avoid adding API keys, tokens, or secrets to source
- If external APIs are integrated, use browser-native auth (OAuth) or delegate to backend

---

## Dependencies at Risk

### Legacy WASM Crate Naming (Post-Migration Cleanup)

**Risk:** Rust crate `oscilla-naga-shim` renamed to `oscilla-naga-translator` in migration but old references might linger

**Impact:** Build failures if references don't update in sync

**Files:** `src/render/wasm/rust/` Cargo.toml, Cargo.lock

**Migration plan:** Verify all TS references to WASM use new crate name during next refactor

---

### SharedArrayBuffer Cross-Origin Isolation (Browser Compatibility)

**Risk:** SharedArrayBuffer requires COOP/COEP headers, which may not work in all deployment environments

**Impact:** Safari < 15.2, older Chrome versions, or shared hosting environments may not support it

**Files:** `src/services/cross-origin-isolation.ts`

**Mitigation:** Fallback to polling-based heartbeat if SharedArrayBuffer unavailable

---

## Missing Critical Features

### C1 Compiler Block Coverage

**Problem:** Only 10 of ~200 blocks migrated to C1. Blocks remain V1-only.

**Blocks:** All except: Const, Add, Subtract, Multiply, Divide, Sin, Cos, Time, InstanceIndex, RenderInstances2D

**Impact:** Can't fully compile many user graphs through C1; fallback to V1 (which renders to stub)

**Blocks:** Migration in progress; each new block requires:
1. Lowering logic (`lower()` function in C1 block def)
2. Manifest requirements (`manifestRequirements()` for GPU resources)
3. Integration tests in compiler-tester fixtures
4. Visual validation via screenshot script

---

### WebGPU Facade Rebuild (Stub)

**Problem:** `src/render/webgpu/` was "scorched earth" deleted during Rust renderer migration. Being rebuilt as stub.

**Impact:** Old WebGPU facade code is gone; new facade isn't complete

**Files:** `src/render/webgpu/` (incomplete)

**Fix approach:** Rebuild incrementally from Rust translator output, one pass type at a time

---

### Frame Input Publishing Path (Incomplete)

**Problem:** `src/services/AnimationLoop.ts` line 476: "Frame-input publishing path is being rebuilt"

**Impact:** Real-time input (mouse, keyboard, MIDI) to animation graph not fully wired

**Workaround:** Time-only animations work; input-driven animations don't

**Fix approach:** Wire `publishFrameInputBoundaryPayload` from `boundary-contract.ts` through animation loop

---

## Performance Bottlenecks

### Large File Complexity

**Files exceeding 1,500 lines:**
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` (2,436 lines): V1 schedule → WGSL translation
- `src/ui/components/BlockInspector.tsx` (1,678 lines): UI component for block editing
- `src/stores/PatchStore.ts` (1,649 lines): MobX patch state management
- `src/compiler/backend/lower-blocks.ts` (1,626 lines): V1 block lowering
- `src/runtime/ValueExprMaterializer.ts` (1,394 lines): V1 IR → runtime values
- `src/compiler/compile.ts` (1,268 lines): Orchestration logic

**Impact:**
- Hard to understand and modify
- Testing requires understanding entire module behavior
- Refactoring risky due to size

**Fix approach:**
1. V1 files: leave as-is (being replaced)
2. UI files: split by feature (editing panel, preview panel, etc.)
3. Stores: split by domain (patch store, playback store, etc.) if possible
4. Compiler orchestration: break into smaller passes with clear contracts

---

### Type Solver Iteration Count

**Issue:** Payload/unit solver and cardinality solver both use fixpoint iteration. No max iteration count enforced.

**Files:**
- `src/compiler/frontend/payload-unit/solve.ts`: Finalization loop unbounded
- `src/compiler/frontend/cardinality/solve.ts`: PromoteToMany fixpoint unbounded

**Risk:** Malformed constraints could cause infinite loops (though unlikely in practice)

**Fix approach:** Add iteration budgets with diagnostic on overflow

---

## Architectural Violations (Type System)

### Potential Axis.kind:'var' Leakage into Backend IR

**Issue:** TYPE-SYSTEM-INVARIANTS rule 4: "Vars are inference-only" — `Axis.kind:'var'` must NOT escape frontend into backend/runtime

**Risk:** If frontend passes IR with unresolved axis vars to C1 backend, backend could serialize them to Rust without resolving

**Current mitigation:** Frontend type solver should fully instantiate axes, but no test verifies this

**Fix approach:** Add assertion in C1 backend entry point:
```typescript
// In src/compiler/backend-v2/index.ts
const validateNoAxisVars = (expr: ValueExpr) => {
  // Walk all axes, assert none have kind:'var'
};
```

---

### Parallel Type Representations

**Issue:** TYPE-SYSTEM-INVARIANTS rule 1: "Single Authority" — CanonicalType is canonical, but code scatters type checks

**Risk Areas:**
1. `payloadStride()` derived from payload only (correct)
2. `deriveKind()` derived from extent (correct)
3. But old code may use `expr.kind` field (deprecated) or `type.signalKind` (doesn't exist)

**Current state:** No parallel systems detected, but no tests enforce single authority

**Fix approach:** Add invariant test suite per coverage gaps section

---

## Test Stability Issues

### MobX Computed Outside Reactive Context (Non-Fatal Warnings)

**Symptom:** Test logs show: `[mobx] Computed value '...' is being read outside a reactive context`

**Files:** Multiple test files run MobX stores outside of `runInAction()` contexts

**Impact:** Non-fatal; recomputes entire graph instead of using cached value. Tests pass but with warnings.

**Fix approach:** Wrap store reads in `runInAction()` or use `makeAutoObservable` with options to suppress warnings

---

### Runtime Service Tests Incomplete (Rust Renderer Dependency)

**Issue:** `src/services/RuntimeService.ts` depends on Rust renderer (WASM worker) to function fully

**Files:** `src/services/__tests__/RuntimeService.test.ts`

**Risk:** Test coverage only for JS path; Rust integration tested via E2E (expensive, requires headless WebGPU)

**Fix approach:** Mock Rust worker for unit tests; keep E2E tests for real renderer validation

---

## Violations of Architectural Laws

### Potential Control Flow Encoding (dataflow-not-control-flow Law)

**Pattern found:** Scattered null checks without `else` clauses:
- `src/compiler/backend/lower-blocks.ts`: "skipping writers from failed upstream blocks"
- `src/compiler/backend/resolveWriters.ts`: "skip this edge (shouldn't happen)"

**Risk:** Control flow hides missing work instead of failing loudly

**Fix approach:**
- V1: Accept (being deleted)
- C1: Ensure backend ALWAYS processes edges; failures are diagnostics, not skipped ops

---

## Diagnostic System Issues

### Debug Probe Budget Clamping (Silent Degradation)

**Issue:** `src/services/DebugProbeRuntimeSnapshot.ts`: Samples dropped when probe budget exceeded

**Files:** Line 196–269, constants: `DEBUG_PROBE_SLOT_META_WORDS = 10`

**Impact:** Users can't debug why values stop appearing in probe — silently clamped

**Fix approach:** Add explicit diagnostic when clamping occurs; UI should notify user

---

## Summary by Priority

**Critical (Block Feature Completion):**
1. C1 Zod validation failures (3 test failures)
2. C1 block migration (10/200 blocks → need 50+)
3. Cardinality solver TODO comments (correctness uncertain)

**High (Fragility/Maintenance):**
1. Type system invariant tests missing (17 rules, no dedicated tests)
2. Test coverage gaps for GPU-IR roundtrip
3. Axis var leakage guard missing

**Medium (Code Health):**
1. 50+ TODO comments in V1 code (acceptable — being deleted)
2. SharedArrayBuffer compatibility fallback
3. Frame input publishing incomplete

**Low (Nice to Have):**
1. Large file refactoring (after V1 deletion)
2. MobX warning suppression
3. Iteration count budgets for solvers

---

*Concerns audit: 2026-04-05*
