# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full architectural guide**: `.claude/CLAUDE.md` — comprehensive layer-by-layer breakdown, design patterns, invariants, and common task guides. Read that before making significant changes.

## Development Commands

### JavaScript/TypeScript
```bash
npm run dev          # Dev server (port 5784)
npm run build        # tsc + Vite build
npm run typecheck    # Type check only
npm run test         # Run all Vitest tests
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint on hot-path files

# Single test file
npx vitest run src/compiler/__tests__/compile.test.ts

# Tests matching pattern
npx vitest run --include "**/cardinality*.test.ts"
```

### Rust/WASM Components
```bash
npm run build:rust-renderer    # Build WebGPU Rust renderer (oscilla-rust-renderer)
npm run build:debug-probe      # Build WASM debug probe (oscilla-debug-probe)

# Native headless WebGPU tests (requires Vulkan/lavapipe on CI)
npm run test:native-webgpu-gates

# Full E2E Rust worker gate tests (requires built renderer + Playwright)
npm run test:rust-worker-gates

# WebGPU browser matrix test
npm run test:webgpu-matrix
```

### Visual Validation (required for rendering changes)
```bash
# Burst montage (9 frames, required for render/compiler/runtime changes)
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl

# Single frame
./scripts/get-screenshot-of-demo-patch.sh simple.hcl --no-burst
```

### GPU-IR Fixture Validation (required for GPU-IR DSL fixture changes)
```bash
# Canvas-only screenshot of a fixture by name (requires dev server + --no-headless for WebGPU)
./scripts/get-screenshot-of-payload-tester.sh strange-attractor --no-headless
./scripts/get-screenshot-of-payload-tester.sh aurora-field --no-headless --output /tmp/aurora.png
```
- **Always validate visually** before committing fixture changes — GPU bugs are invisible in unit tests
- Must use `--no-headless` because WebGPU requires a real GPU
- Iterate: change → screenshot → evaluate → adjust → screenshot again

## Multi-Language Architecture

This project has two execution planes:

### JS/TS Plane (primary)
- Compiler, graph model, block registry, stores, UI — all TypeScript
- Runs in main browser thread + compile worker
- Entry: `src/index.ts`, `src/compiler/index.ts`, `src/runtime/index.ts`

### Rust/WASM Plane (rendering + native validation)
Located under `src/*/wasm/rust/`:

| Crate | Path | Role |
|-------|------|------|
| `oscilla-rust-renderer` | `src/render/wasm/rust/oscilla-rust-renderer/` | WebGPU render worker + Naga DSL + AST translator |
| `oscilla-debug-probe` | `src/services/wasm/rust/oscilla-debug-probe/` | Runtime debug snapshot ABI |

Native headless tests: `native-tests/webgpu-headless/`

### Rust Renderer Architecture (`docs/current/renderer/RUST-RENDERER.md`)
The renderer runs in a `DedicatedWorker` with a strict zero-allocation hot path. Key constraints:
- `StrictAllocator::lock()/unlock()` brackets every `tick()` — no heap allocs during GPU dispatch
- `GpuMemoryArena` pre-allocates all VRAM at startup (`INIT`/`REBUILD_PIPELINE` events)
- Three-pass compute: Simulation → Render Assembly → Ping-pong flip
- Indirect draw (`draw_indexed_indirect`) — GPU determines instance count, not CPU
- Pipeline recreation happens outside the hot path, triggered by JS `REBUILD_PIPELINE` message

## Critical Rules

- **NEVER use `git stash`** — destructive, interacts badly with linters
- **Visual changes require screenshot validation** via `get-screenshot-of-demo-patch.sh`
- **No compiled artifacts in `Patch`** — types, slots, schedules belong in IR/runtime only
- **Axis vars (`kind: 'var'`) must not escape the frontend** into backend/runtime
- **One source of truth per concept** — no parallel type systems, no duplicate representations
