# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full architectural guide**: `.claude/CLAUDE.md` — comprehensive layer-by-layer breakdown, design patterns, invariants, and common task guides. Read that before making significant changes.
>
> **DSL reference**: `docs/DSLs.md` — the five DSLs (Boundary IR, Boundary DSL, Naga DSL, Block DSL, Patch DSL) with entry points and key files.

## Migration State (READ THIS FIRST)

The codebase is mid-migration via strangler fig pattern. Two compilation pipelines coexist:

| System | Status | Path |
|--------|--------|------|
| **V1 backend** (`compiler/backend/`) | **LEGACY — being replaced** | Frontend → Backend → JS Runtime → (stub renderer) |
| **C1 backend** (`compiler/backend-v2/`) | **NEW — ~5% block coverage** | Frontend → C1 Backend → PipelineInstallPayload → Rust/WASM → WebGPU |
| **Compiler frontend** (`compiler/frontend/`) | **SHARED** — used by both pipelines | |
| **V1 blocks** (`src/blocks/`) | **LEGACY** — only for V1 backend lowering | |
| **C1 blocks** (`src/blocks-v2/`) | **NEW** — 10 blocks migrated so far | |
| **V1 runtime** (`src/runtime/`) | **LEGACY** — JS frame executor | |
| **Rust renderer** (`src/render/wasm/rust/`) | **NEW — feature complete** | WebGPU render worker |
| **WebGPU facade** (`src/render/webgpu/`) | **STUB** — deleted during scorched earth, being rebuilt | |
| **Canvas2D / SVG renderers** | **DELETED** | |

**Rules for legacy code**: Never fix bugs in V1 backend, V1 blocks, or V1 runtime. They are dead code being replaced. New work goes in `backend-v2/` and `blocks-v2/`.

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
