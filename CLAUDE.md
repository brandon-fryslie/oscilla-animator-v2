# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Full architectural guide**: `.claude/CLAUDE.md` — comprehensive layer-by-layer breakdown, design patterns, invariants, and common task guides. Read that before making significant changes.
>
> **DSL reference**: `docs/DSLs.md` — the five DSLs (Boundary IR, Boundary DSL, Naga DSL, Block DSL, Patch DSL) with entry points and key files.

## Migration State (READ THIS FIRST)

The codebase is mid-migration. The live app shell still compiles through the legacy frontend/backend worker path, while the Three migration work now lives in `src/pillars/` and the rebuilt renderer seam is still incomplete.

| System | Status | Path |
|--------|--------|------|
| **Legacy backend** (`src/compiler/backend/`) | **LIVE but legacy-shaped** | Frontend result → compiled runtime install contract |
| **Compiler frontend** (`src/compiler/frontend/`) | **LIVE** | Graph/type pipeline feeding the compile worker |
| **Three migration compiler** (`src/pillars/`) | **ACTIVE migration surface** | Frontend-style normalize → lowering → `PipelineInstallPayload` assembly |
| **V1 blocks** (`src/blocks/`) | **LEGACY** — only for V1 backend lowering | |
| **Three migration blocks** (`src/pillars/blocks/`) | **ACTIVE migration surface** | Value-based block definitions consumed by the Pillars compiler |
| **V1 runtime** (`src/runtime/`) | **LEGACY** — JS frame executor | |
| **Legacy payload contract** (`src/legacy/`) | **LEGACY reference surface** | Old payload contract types and validation, not the future renderer architecture |
| **WebGPU facade** (`src/render/webgpu/`) | **STUB / rebuild seam** | Surviving app-facing renderer interface being rebuilt after scorched-earth cleanup |
| **Canvas2D / SVG renderers** | **DELETED** | |

**Rules for legacy code**: Never revive deleted manual harnesses, the removed Rust worker transport, or the deleted legacy Rust renderer crate. New migration work goes in `src/pillars/`, the compile-worker seam, and the surviving `src/render/webgpu/` facade. Touch `src/legacy/` only when maintaining the frozen legacy payload contract.

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

### Visual Validation (required for rendering changes)
```bash
# Demo-patch montage from the surviving app shell
./scripts/get-screenshot-of-demo-patch.sh breathing-ring.hcl
```

## Architecture

### JS/TS Plane (compiler, graph, UI)
- Entry: `src/index.ts`, `src/compiler/index.ts`
- Runs in main browser thread + compile worker

## Critical Rules

- **NEVER use `git stash`** — destructive, interacts badly with linters
- **Visual changes require screenshot validation** — see scripts above
- **No compiled artifacts in `Patch`** — types, slots, schedules belong in IR only
- **Axis vars (`kind: 'var'`) must not escape the frontend** into backend/runtime
- **One source of truth per concept** — no parallel type systems
- **No feature flags for migration** — tests are the switch, not runtime toggles
