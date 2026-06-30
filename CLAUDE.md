# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full architectural guide**: `.claude/CLAUDE.md` — comprehensive layer-by-layer breakdown, design patterns, invariants, and common task guides. Read that before making significant changes.
>
> **DSL reference**: `docs/DSLs.md` — the five DSLs (Boundary IR, Boundary DSL, Naga DSL, Block DSL, Patch DSL). Note: Boundary IR/DSL and Naga DSL describe the **frozen** GPU-IR renderer (see Migration State); Block DSL and Patch DSL remain current.

## Migration State (READ THIS FIRST)

The codebase is mid-migration via strangler fig. The **renderer direction is the "Three fork"**: a three.js (`three@0.184`, TSL) `WebGPURenderer` (`ThreeForkRenderer`) lives behind the `createWebGPURenderer()` seam in `src/render/webgpu/`, fed by the **pillar compiler** (`src/pillars/`), which lowers an authored patch into a backend-neutral **`ScenePlan`** (`compileScenePlan`). The earlier **Rust/WASM/WebGPU + GPU-IR** renderer and the **`PipelineInstallPayload`** path are now **frozen legacy** — operational as a replaceable backend, not extended (the code itself marks them `FROZEN LEGACY`, e.g. `src/pillars/assembly/payload.ts`; the Rust install call in `RuntimeService` is commented out).

> **Source of truth for this migration** (these win over older GPU-IR docs and ambiguous ticket prose):
> `design-docs/three-migration-backend-canon.md` · `design-docs/three-migration-renderer-seam-inventory.md` (keep/freeze/delete map) · `design-docs/three-fork-integration-proposal.md`. Tracker: epic `oscilla-pillars-cleanup-ulu`.

| System | Status | Notes |
|--------|--------|-------|
| **Three fork renderer** (`src/render/webgpu/three/`) | **LIVE — the default boot** | three.js `WebGPURenderer`; pure `ScenePlan` → TSL scene-graph realizer; constructed at the `createWebGPURenderer` seam, driven from `RuntimeService`; no-param boot opens the native editor |
| **Pillar compiler → ScenePlan** (`src/pillars/`, `src/pillars/scene/`) | **ACTIVE** | authored patch → `ScenePlan` (`compileScenePlan`); the active backlog lives in the `pillars-*` epics |
| **V1 backend / blocks / runtime** (`compiler/backend/`, `src/blocks/`, `src/runtime/`) | **DEPRECATED — opt-in only (`?v1=true`)** | JS frame executor; no longer the default boot — reachable only via the explicit `?v1=true` escape hatch |
| **C1 backend / blocks-v2 + pillar `PipelineInstallPayload`** (`compiler/backend-v2/`, `src/blocks-v2/`, `src/pillars/compile.ts`, `src/pillars/assembly/`) | **FROZEN LEGACY** | targeted the Rust renderer; superseded by the ScenePlan path |
| **Rust renderer + GPU-IR / Boundary DSL** (`src/render/wasm/rust/`, `src/render/rust/`, `src/render/gpu-ir/`) | **FROZEN LEGACY** | operational, not extended — do not add to it |
| **Canvas2D / SVG renderers** | **DELETED** | |

**Default boot is the Three native editor.** No URL param opens the Three-backed editor with the persisted (or starter) patch, animating immediately. `?v1=true` is the explicit opt-in that boots the deprecated V1 runtime; `?scenePlan=<id>` still selects a fixed demo steel thread (e.g. Grid of Squares, Textured Tiles). Boot-path policy is resolved in one place — `resolveBootSelection()` in `src/testing/test-params.ts`.

**Rules for legacy code**: Never fix bugs in V1 (backend/blocks/runtime). Treat the Rust/WASM/GPU-IR stack and the `PipelineInstallPayload` path (incl. C1 `backend-v2` and `src/pillars/compile.ts` / `src/pillars/assembly/`) as **frozen** — do not extend them. New renderer/compiler work follows **pillar → `ScenePlan` → Three** (see the canon docs above).

## Development Commands

### JavaScript/TypeScript
```bash
npm run dev          # Dev server (port 5784)
npm run build        # tsc + Vite build
npm run typecheck    # Type check only
npm run test         # Run all Vitest tests
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint

# Single test file
npx vitest run src/compiler/__tests__/compile.test.ts

# Tests matching pattern
npx vitest run --include "**/cardinality*.test.ts"
```

### Rust/WASM Components
```bash
npm run build:rust-renderer    # Build WebGPU Rust renderer (oscilla-rust-renderer)
npm run build:debug-probe      # Build WASM debug probe (oscilla-debug-probe)
npm run test:native-webgpu-gates   # Native headless WebGPU tests
npm run test:rust-worker-gates     # Full E2E (requires built renderer + Playwright)
```

### Visual Validation (required for rendering changes)
```bash
# V1 pipeline — burst montage (9 frames)
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl

# GPU-IR fixtures — requires --no-headless (WebGPU needs real GPU)
./scripts/get-screenshot-of-payload-tester.sh strange-attractor --no-headless

# C1 compiler tester
./scripts/get-screenshot-of-compiler-tester.sh
```

## Multi-Language Architecture

### JS/TS Plane (compiler, graph, UI)
- Entry: `src/index.ts`, `src/compiler/index.ts`
- Runs in main browser thread + compile worker

### Rust/WASM Plane (rendering)
| Crate | Path | Role |
|-------|------|------|
| `oscilla-rust-renderer` | `src/render/wasm/rust/oscilla-rust-renderer/` | WebGPU render worker + Naga translator |
| `oscilla-debug-probe` | `src/services/wasm/rust/oscilla-debug-probe/` | Runtime debug snapshot ABI |

The renderer runs in a `DedicatedWorker`. Key constraints: zero-allocation hot path (`StrictAllocator::lock()/unlock()`), pre-allocated VRAM (`GpuMemoryArena`), indirect draw (GPU determines instance count).

## Critical Rules

- **NEVER use `git stash`** — destructive, interacts badly with linters
- **Visual changes require screenshot validation** — see scripts above
- **No compiled artifacts in `Patch`** — types, slots, schedules belong in IR only
- **Axis vars (`kind: 'var'`) must not escape the frontend** into backend/runtime
- **One source of truth per concept** — no parallel type systems
- **No feature flags for migration** — tests are the switch, not runtime toggles
