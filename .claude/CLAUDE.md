# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules (NEVER BREAK)

- **NEVER use `git stash`**. Do not stash, pop, or manipulate the stash in any way. This is a destructive operation that can lose work and interact badly with linters. If you need to test old code, use `git diff` or `git show` to read it — never modify the working tree state.
- **Visual patch validation MUST use screenshot scripts**. When you need to verify rendering, you MUST take a screenshot and inspect the result. Do NOT skip visual validation or claim something "looks fine" without evidence. See the Visual Validation section below.
- **Never fix bugs in legacy (V1) code**. The V1 backend, V1 blocks, and V1 runtime are dead code being replaced. New work targets `backend-v2/` and `blocks-v2/` only.

## Project Overview

Oscilla Animator v2 is a browser-based animation editor for creating procedural, node-graph-based animations with precise continuity guarantees and hot-swappable live editing.

**Key pillars:**
- **Spec-driven**: All implementation conforms to `design-docs/CANONICAL-oscilla-v2.5-20260109/`
- **Single code path**: No dual implementations or legacy compatibility shims
- **Invariant enforcement**: Critical properties are mechanically enforced, not documented
- **Live editing**: Graph changes hot-swap without losing state

## Migration State

The codebase is mid-migration via **strangler fig pattern**. The **renderer direction is the "Three fork"**: a three.js (`three@0.184`, TSL) `WebGPURenderer` (`ThreeForkRenderer`) behind the `createWebGPURenderer()` seam, fed by the **pillar compiler** (`src/pillars/`) which lowers an authored patch to a backend-neutral **`ScenePlan`** (`compileScenePlan`). The earlier **Rust/WASM/WebGPU + GPU-IR** renderer and the **`PipelineInstallPayload`** path are **frozen legacy** — operational as a replaceable backend, not extended (the code marks them `FROZEN LEGACY`, e.g. `src/pillars/assembly/payload.ts`). **V1** (backend + JS runtime) is still the **default boot**; the Three path is a `?scenePlan=<id>`-selected steel thread, not yet the default.

> **Source of truth for this migration** (these win over older GPU-IR text and ambiguous ticket prose):
> `design-docs/three-migration-backend-canon.md` · `design-docs/three-migration-renderer-seam-inventory.md` (keep/freeze/delete map) · `design-docs/three-fork-integration-proposal.md`. Tracker epic: `oscilla-pillars-cleanup-ulu`. [LAW:one-source-of-truth]

### Three lineages (one live, one default-but-legacy, one frozen)

```
  authored Patch
       │
       ├─► V1 backend (LEGACY, DEFAULT BOOT) ─► JS Runtime (ScheduleExecutor) ─► stub
       │
       ├─► Pillar compiler ─► ScenePlan ─► Three fork renderer (LIVE) ─► WebGPU Canvas
       │     src/pillars/ · compileScenePlan      ScenePlan → TSL scene graph
       │     (activated by ?scenePlan=<id>)
       │
       └─► [FROZEN] Pillar/C1 ─► PipelineInstallPayload ─► Rust/WASM Worker (Naga → WGSL → WebGPU)
```

### Status by area

| Area | Status |
|---|---|
| `src/render/webgpu/three/` — ThreeForkRenderer, ScenePlan realizer, TSL | **LIVE — current renderer** |
| `src/pillars/` + `src/pillars/scene/` (`compileScenePlan`) | **ACTIVE — authored patch → ScenePlan; the open backlog is `pillars-*`** |
| `compiler/backend/` + `src/blocks/` + `src/runtime/` (V1) | **LEGACY — still the default boot path** |
| `compiler/backend-v2/` + `src/blocks-v2/`; `src/pillars/compile.ts` + `src/pillars/assembly/` (`PipelineInstallPayload`) | **FROZEN LEGACY** |
| `src/render/wasm/rust/`, `src/render/rust/`, `src/render/gpu-ir/` (Rust renderer + GPU-IR / Boundary DSL) | **FROZEN LEGACY** |
| `src/render/Canvas2DRenderer.ts`, `src/render/SVGRenderer.ts`, `src/compiler/passes-v2/` | **DELETED** |

### Migration Discipline

- **Never fix V1 bugs** — V1 (backend/blocks/runtime) is legacy.
- **Do not extend the frozen stack** — the Rust/WASM/GPU-IR renderer and the `PipelineInstallPayload` path are frozen. New renderer/compiler work follows **pillar → `ScenePlan` → Three**.
- **No feature flags** — path selection is `?scenePlan=<id>` (steel thread) vs default V1 boot, plus tests; never runtime toggles.
- When ticket text or older docs conflict with the canon docs above, the canon docs win. [LAW:one-source-of-truth]

## Development Commands

```bash
npm run dev          # Start dev server (port 5784)
npm run build        # Type check with tsc, then Vite build
npm run typecheck    # Type check only
npm run test         # Run Vitest (all tests in single run)
npm run test:watch   # Run Vitest in watch mode
npm run test:coverage # Generate coverage report
npm run bench        # Run Vitest benchmarks
npm run lint         # ESLint
```

### Running Specific Tests

```bash
npx vitest run src/compiler/__tests__/compile.test.ts       # Single file
npx vitest run --include "**/cardinality*.test.ts"          # Pattern match
npx vitest run --coverage src/compiler/                     # With coverage
```

### Rust/WASM

```bash
npm run build:rust-renderer       # Build WebGPU Rust renderer
npm run build:debug-probe         # Build WASM debug probe
npm run test:native-webgpu-gates  # Native headless WebGPU tests
npm run test:rust-worker-gates    # E2E (requires built renderer + Playwright)
```

### Visual Validation

Three screenshot scripts for three different systems:

```bash
# V1 pipeline demos — burst montage (9 frames)
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl
./scripts/get-screenshot-of-demo-patch.sh simple.hcl --no-burst

# GPU-IR fixtures (Boundary DSL) — requires --no-headless (WebGPU needs real GPU)
./scripts/get-screenshot-of-payload-tester.sh strange-attractor --no-headless

# C1 compiler tester
./scripts/get-screenshot-of-compiler-tester.sh
```

Screenshots save to `/tmp/oscilla-test-screenshots/` with timestamps. Burst montage captures 3 bursts of 3 shots. Use `--help` for options.

Requires: Chrome/Chromium, Node.js, ImageMagick, dev server running. Set `CHROME_BIN` to override.

## Architecture Overview

### Core Layers (Bottom-up)

1. **Types & Constants** (`src/types/`, `src/core/`)
   - `src/core/canonical-types/`: The canonical type system — `CanonicalType = { payload, unit, extent }`
   - `src/core/ids.ts`: Branded ID types (`InstanceId`, `CardinalityVarId`, etc.)
   - `src/core/domain-registry.ts`: Domain registration (Circle, Grid, etc.)
   - `src/types/`: Role enums (`BlockRole`, `EdgeRole`), `ValueSlot`

2. **Graph Representation** (`src/graph/`)
   - `Patch.ts`: User-facing graph model (Blocks and Edges) — **single source of truth for user intent**
   - `normalize.ts`: Canonicalize user graphs
   - `adapters.ts`: Domain transformation system
   - **Critical constraint**: Patch MUST NOT contain compiled artifacts

3. **Block Registries**
   - `src/blocks/registry.ts`: V1 blocks via `defineBlock()` — **LEGACY, do not extend**
   - `src/blocks-v2/index.ts`: C1 blocks via `registerC1Block()` — **NEW, all new blocks go here**

4. **Compiler** (`src/compiler/`)
   - **Frontend** (`compiler/frontend/`): **SHARED** — produces `TypedPatch` + `NormalizedPatch` for both backends
   - **V1 Backend** (`compiler/backend/`): **LEGACY** — produces `CompiledProgramIR`
   - **C1 Backend** (`compiler/backend-v2/`): **NEW** — produces `PipelineInstallPayload`
   - **IR** (`compiler/ir/`): Shared IR types, `IRBuilder`, `NormalizedPatch`, `TypedPatch`

5. **V1 Runtime** (`src/runtime/`) — **LEGACY**
   - JS frame executor, state migration, field kernels
   - Will be replaced by GPU execution in Rust renderer

6. **Boundary Layer** (`src/render/rust/`, `src/render/gpu-ir/`)
   - `boundary-contract.ts`: Zod schemas defining TS↔Rust protocol (single source of truth)
   - `worker-protocol.ts`: Message types (BOOTSTRAP, INSTALL_PIPELINE, etc.)
   - `engine.worker.ts`: Worker bridge + message handling
   - `gpu-ir/`: Boundary DSL compiler (arrow fns → ExprIR/StatementIR AST)

7. **Rust Renderer** (`src/render/wasm/rust/oscilla-rust-renderer/`)
   - Receives `PipelineInstallPayload` → Naga translator → WGSL → WebGPU pipelines
   - MMU allocates GPU buffers from manifest
   - Zero-allocation hot path with `StrictAllocator`

8. **Services** (`src/services/`)
   - `CompileOrchestrator.ts`: V1 compile path (frontend + V1 backend + state migration)
   - `AnimationLoop.ts`: V1 animation loop
   - `LiveRecompile.ts`: Hot-swap orchestration

9. **Stores** (`src/stores/`) — MobX state management
   - `RootStore.ts` owns all stores
   - Key stores: `PatchStore`, `FrontendResultStore`, `PlaybackStore`, `SettingsStore`

10. **UI & Editor** (`src/ui/`)
    - `reactFlowEditor/`: ReactFlow-based graph visualization
    - `dockview/`: Dockview panel layout
    - `debug-viz/`: Live value visualization

11. **Compiler Tester** (`src/compiler-tester/`)
    - Standalone React app at `/compiler-tester.html`
    - Tests C1 pipeline in isolation: graph fixture → C1 compile → Rust renderer
    - Fixtures: `spinning-ring.ts` (minimal), `dynamic-ring.ts` (full math)

### Five DSLs

See `docs/DSLs.md` for complete reference.

| DSL | Location | Purpose |
|-----|----------|---------|
| **Boundary IR** | `src/render/rust/boundary-contract.ts` | JSON IR crossing TS→WASM boundary (Zod + serde) |
| **Boundary DSL** | `src/render/gpu-ir/` | Arrow-fn DSL compiling to Boundary IR (`$global`, `$domains`, `$thread`) |
| **Naga DSL** | Rust: `dsl.rs` | Builder API for constructing `naga::Module` AST |
| **Block DSL** | `src/blocks/` (V1), `src/blocks-v2/` (C1) | Block definition APIs |
| **Patch DSL** | `src/patch-dsl/` | HCL-like text format for graph serialization |

### C1 Backend Pipeline (5 Phases)

1. **Topo Sort** (`topo-sort.ts`) — Kahn's algorithm on graph edges
2. **Manifest Harvest** (`harvester.ts`) — Blocks declare GPU resources (globals, domains, textures)
3. **Sink Discovery** (`sink-discovery.ts`) — Find render sinks (blocks with `isSink: true`)
4. **Lowering & Fusion** (`lowering.ts`) — Backward walk from sinks, recursive lowering to `ExprIR`, multi-fanout caching via `PassScopeManager`
5. **Roster Assembly** (`roster-assembly.ts`) — Sort passes by precedence, auto-infer dependencies → `PipelineInstallPayload`

### Boundary Protocol (TS ↔ Rust)

**Inbound** (TS → Worker): `BOOTSTRAP`, `INSTALL_PIPELINE`, `PAUSE`, `RESUME`
**Outbound** (Worker → TS): `BOOTSTRAP_SUCCESS`, `INSTALL_PIPELINE_SUCCESS/FAILURE`, `SCHEDULER_HEARTBEAT`, `ENGINE_ERROR`

The `PipelineInstallPayload` is the key data structure: `{ manifest, roster, functions? }`. Manifest declares GPU memory layout. Roster lists compute/render passes with ExprIR/StatementIR AST bodies. The Rust translator converts AST → naga::Module → WGSL → WebGPU pipelines.

### Module Dependency Arrows

```
UI/React ←── Stores (MobX) ←── Services ←── Compiler (Frontend) ──► Both Backends
                                                      │
                                                      ▼
                                                    Graph ←── Patch
                                                      │
                                              ┌───────┴────────┐
                                              ▼                ▼
                                         Blocks (V1)     Blocks-v2 (C1)
                                              │                │
                                              ▼                ▼
                                         Types & Core    Boundary Contract
```

**One-way rule**: No upward calls. UI → Stores → Services → Compiler, never reverse.

## Spec Reference & Invariants

**Essential spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` (~25k tokens)

**Domain-specific docs** (when working in that area):
- Diagnostics: `07-diagnostics-system.md`, `08-observation-system.md`
- UI: `09-debug-ui-spec.md`, `14-modulation-table-ui.md`, `15-graph-editor-ui.md`
- Continuity: `11-continuity-system.md`
- Events: `12-event-hub.md`, `13-event-diagnostics-integration.md`

### Core Invariants (NON-NEGOTIABLE)

- Every block input has a canonical default source
- Continuity state is preserved across graph hot-swaps
- Type inference is deterministic and complete
- Field expressions form a DAG
- `CanonicalType = { payload, unit, extent }` is the single type authority
- `deriveKind()` derives signal/field/event from axes — never store kind directly
- Axis vars (`kind: 'var'`) must not escape frontend into backend/runtime
- One enforcement gate for axis validation (`axis-validate.ts`)

See `.claude/rules/spec/invariants.md` for the full list and `.claude/rules/TYPE-SYSTEM-INVARANTS.md` for the 17-rule type system guardrails.

## Code Organization

### Tests
- Unit tests live alongside code as `__tests__/` directories
- **Vitest** with jsdom for React components
- `src/__tests__/forbidden-patterns.test.ts` enforces architectural constraints via grep
- Test the *interface*, not the implementation

### Module Structure
- Public exports from `src/*/index.ts`
- **Path alias**: `@/*` → `src/*` (use `@/blocks` not `../../blocks`)
- **TypeScript**: ES2022 target, strict mode, no `any` without rationale

## Common Tasks

> **Frozen-path warning**: the "Adding a New C1 Block / C1 Sink Block / GPU-IR Fixture" guides below describe the **frozen** Rust/WASM/GPU-IR stack (see Migration State). Do not extend it for new work — current block/renderer work lives in the pillar → `ScenePlan` → Three direction (`src/pillars/`). These remain only as reference for the legacy path.

### Adding a New C1 Block (FROZEN — legacy reference only)
1. Create `src/blocks-v2/my-block.ts`
2. Call `registerC1Block('MyBlock', { lower: (ctx) => ... })` — returns `{ kind: 'proxy', outputs: { ... } }` for math blocks
3. Import in `src/blocks-v2/all.ts`
4. Add to a compiler-tester fixture to validate visually
5. Run: `npx vitest run src/compiler/backend-v2/__tests__/`

### Adding a New C1 Sink Block (FROZEN — legacy reference only)
1. Create `src/blocks-v2/my-sink.ts`
2. Register with `isSink: true`, implement `manifestRequirements()` for GPU resources, `lower()` returns `{ kind: 'sink', injectedPasses: [...] }`
3. Passes can be `ComputePassSpec`, `SystemPassSpec`, or `RenderPassSpec`

### Adding a GPU-IR Fixture (Boundary DSL) (FROZEN — legacy reference only)
1. Create `src/render/rust/fixtures/my-fixture.ts`
2. Use `gpu({ manifest, roster })` with `compute()` / `render()` helpers
3. Export from `src/render/rust/fixtures/index.ts`
4. Validate: `./scripts/get-screenshot-of-payload-tester.sh my-fixture --no-headless`

### Adding a Compiler Pass
Frontend passes go in `src/compiler/frontend/`, C1 backend passes in `src/compiler/backend-v2/`.
1. Create pass file — takes previous pass output, returns new data (no mutation)
2. Wire into pipeline in the appropriate `index.ts`
3. Add tests in `__tests__/`

### Debugging
- Cardinality bugs: Enable "Trace Cardinality Solver" in Settings → Debug
- Runtime values: Use `src/ui/debug-viz/` (hover ports to see values)
- Compiled IR inspection: `CompilationInspectorService.ts`
- Rust renderer: Check `SCHEDULER_HEARTBEAT` and `ENGINE_ERROR` messages in worker protocol

## Key Files Quick Reference

| Purpose | File |
|---------|------|
| C1 backend entry | `src/compiler/backend-v2/index.ts` |
| C1 block registry | `src/blocks-v2/index.ts` |
| Boundary contract (Zod) | `src/render/rust/boundary-contract.ts` |
| GPU-IR builders | `src/render/gpu-ir/ir-builders.ts` |
| GPU-IR DSL compiler | `src/render/gpu-ir/compile.ts` |
| IR node rules (operator tables) | `src/render/gpu-ir/ir-node-rules.ts` |
| Worker protocol | `src/render/rust/worker-protocol.ts` |
| Rust translator | `oscilla-rust-renderer/src/translator.rs` |
| Naga DSL | `oscilla-rust-renderer/src/dsl.rs` |
| Compiler tester | `src/compiler-tester/CompilerTesterApp.tsx` |
| GPU-IR fixtures | `src/render/rust/fixtures/` |
| C1 test fixtures | `src/compiler-tester/fixtures/` |
| Frontend entry | `src/compiler/frontend/index.ts` |
| V1 backend (legacy) | `src/compiler/backend/index.ts` |
| V1 orchestrator (legacy) | `src/services/CompileOrchestrator.ts` |

## Notes

- MobX stores are the ONLY modules that import `mobx`. UI components use `mobx-react-lite`.
- The spec is the source of truth. Consult `ESSENTIAL-SPEC.md` when in doubt.
- `src/__tests__/forbidden-patterns.test.ts` enforces architectural constraints — if it fails, restructure the code, not the test.
- The Rust renderer uses `SharedArrayBuffer` + `Atomics` for zero-overhead heartbeat monitoring between main thread and worker.
- `PipelineInstallPayload` is JSON-serializable (no closures). Zod validates on TS side, serde deserializes on Rust side.
