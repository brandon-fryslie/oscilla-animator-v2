# Technology Stack

**Analysis Date:** 2026-04-05

## Languages

**Primary:**
- TypeScript 5.7.2 - Core compiler, frontend, and services
- JavaScript (ES2022) - Build tooling and scripts
- JSX/TSX - React components throughout `src/ui/`

**Secondary:**
- Rust 2021 edition - WebGPU renderer and debug probe (WASM compilation targets)
- WGSL - GPU shader language (generated via Naga translator)

## Runtime

**Environment:**
- Node.js (modern LTS required) - No `.nvmrc` file; determine from `package.json` `packageManager` field
- Browser: Chromium/Chrome 120+ (WebGPU support required)
- **Critical requirement**: Cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) for `SharedArrayBuffer` access

**Package Manager:**
- pnpm 10.28.2 (declared in `package.json` via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` (not tracked in repository per `.gitignore`)

## Frameworks & Core Libraries

**UI & State Management:**
- React 19.2.3 - Component framework
- MobX 6.15.0 + mobx-react-lite 4.1.1 - State management; stores are the ONLY modules importing `mobx`
- @mantine/core 8.3.13 + @mantine/hooks 8.3.13 - UI component library
- @mui/material 7.3.7 + @mui/x-data-grid 8.24.0 - Material Design components and data grid
- dockview 4.13.1 - Panel layout system
- ReactFlow 11.11.4 - Node graph visualization and editing

**Animation & Graphics:**
- motion 12.29.2 - Animation utilities
- bezier-js 6.1.4 - Bezier curve math
- simplex-noise 4.0.3 - Simplex noise generation for procedural content

**Compiler & Parsing:**
- acorn 8.16.0 - JavaScript parser (used in Boundary DSL walker for arrow function parsing)
- ts-morph 27.0.2 - TypeScript AST manipulation (in dev complexity analysis)
- mermaid 11.4.1 - Diagram rendering for debugging

**Build & Type System:**
- Zod 4.3.6 - Schema validation and runtime type checking (critical for Boundary IR contract validation at TS↔WASM boundary)
- wgsl_reflect 1.2.3 - WGSL metadata extraction (used in stdlib metadata parsing)

**Geometry & Layout:**
- earcut 3.0.2 - Polygon triangulation
- elkjs 0.11.0 - Layered graph layout

**Styling:**
- @emotion/react 11.14.0 + @emotion/styled 11.14.1 - CSS-in-JS styling

**URL/State Management:**
- nuqs 2.8.8 - Sync URL state with local state

## Build & Development Tools

**Build System:**
- Vite 6.0.0 - Module bundler and dev server
  - Dev server: port 5784 (configured in `vite.config.ts`)
  - Cross-origin isolation headers enforced at server boundary
  - Multiple entry points: `main` (index.html), `payload-tester`, `compiler-tester`
  - Worker format: ES modules (enforced via `worker.format: 'es'`)
  - COI service worker automatically emitted to dist on build

**Type Checking:**
- TypeScript 5.7.2 compiler in strict mode
- tsconfig.json: ES2022 target, ESNext module, bundler resolution, `@/*` path alias

**Code Quality:**
- ESLint 9.39.2 + @typescript-eslint 8.54.0 - Linting with custom oscilla rules
- Custom ESLint rules (in `eslint-rules/`):
  - `no-defaults-in-lower` - Enforce V1 block lowering constraints
  - `no-default-source-in-lower` - Prevent implicit default sources in lowering
  - `no-block-type-check-in-lower` - Forbid runtime type checking in block lowering
  - `no-nullish-coalescing-defaults` - No `??` fallbacks in data paths
  - `no-hot-path-alloc` - No heap allocations in performance-critical paths
  - `no-nullable-runtime-contracts` - Enforce non-nullable runtime contract boundaries
- No `.prettierrc` found; formatting not enforced (manual code style expected)

**Testing:**
- Vitest 2.1.8 - Unit test runner
  - Environment: jsdom for React components
  - Pool: forks with optional `--expose-gc` for memory profiling
  - Coverage: v8 provider, 80% threshold for statements/branches/functions/lines
  - Setup files: `src/__tests__/setup-blocks.ts`, `src/ui/components/__tests__/setup.ts`
  - Benchmarks: Vitest bench (files matching `**/__benchmarks__/*.bench.ts`)
- Playwright 1.58.0 - E2E browser testing
  - Config: `playwright.config.ts`
  - Dedicated dev server: port 5794 (distinct from main dev server at 5784)
  - Target: Chromium with `--enable-unsafe-webgpu` flag
  - Parallelization: enabled in local, single-worker in CI
- @testing-library/* - React component testing utilities

## Rust/WASM Components

**Crates:**
- `oscilla-rust-renderer` (`src/render/wasm/rust/oscilla-rust-renderer/`)
  - Dependencies: `wgpu 29.0.1` (WebGPU binding), `naga 29.0.1` (shader translation), `wasm-bindgen 0.2`
  - Exports: cdylib (WASM binary) + rlib (Rust library)
  - Features: wgsl-in, wgsl-out (Naga), webgpu/wgsl/naga-ir (wgpu)
  - Additional: `serde`/`serde_json`, `bytemuck`, `js-sys`, `web-sys`

- `oscilla-debug-probe` (`src/services/wasm/rust/oscilla-debug-probe/`)
  - Exports: cdylib (WASM binary)
  - Dependencies: `wasm-bindgen 0.2`, `serde`/`serde-wasm-bindgen 0.6`
  - Purpose: Runtime debug snapshot ABI for value observation

**Build Tooling:**
- wasm-bindgen CLI - WASM-JavaScript bindings (version 0.2.114 expected)
- rustup + Rust toolchain - Rust build system
- Cargo (Rust package manager) - Declared in `Cargo.toml` files
- wasm32-unknown-unknown target - WASM compilation target

**Build Scripts:**
- `scripts/build-rust-renderer.sh` - Compiles oscilla-rust-renderer to WASM, outputs to `src/render/wasm/pkg/`
- `scripts/build-debug-probe.sh` - Compiles debug probe to WASM
- Rust compiler flags remapped for reproducible builds (path remapping for workspace/cargo/git paths)

## Configuration & Environment

**TypeScript Configuration** (`tsconfig.json`):
- Target: ES2022
- Module: ESNext
- Resolution: bundler
- Strict mode: true
- Declaration output enabled
- Path alias: `@/*` → `src/*`
- JSX: react-jsx
- Excluded: `src/compiler/passes-v2` (false-start pass, not compiled)

**Vite Configuration** (`vite.config.ts`):
- Root: `public/`
- Base URL: Configurable via `BASE_URL` env var
- Build output: `../dist/` (relative to public/)
- Chunk size warning limit: 6000 KB
- Git worktree support for multi-repo development
- Centralized SharedArrayBuffer boundary enforcement at HTTP server level

**Vitest Configuration** (`vitest.config.ts`):
- Global test API: true
- Environment: jsdom
- Coverage thresholds: 80% (statements, branches, functions, lines)
- Excluded from tests: `node_modules/**`, `dist/**`, `.claude/worktrees/**`, `tests/e2e/**`, `*.spec.ts`

**Playwright Configuration** (`playwright.config.ts`):
- Test directory: `tests/e2e/`
- Browser: Chromium with WebGPU enabled
- Dev server: Vite on port 5794 (strict port binding)
- Trace recording: on-first-retry
- Retries: 2 in CI, 0 locally

## Platform Requirements

**Development:**
- Node.js + pnpm 10.28.2
- Rust toolchain (for `cargo`, `rustup`)
- wasm-bindgen CLI
- Chromium/Chrome with WebGPU support
- ImageMagick (for screenshot scripts)
- Git (for worktree support)

**Production:**
- Deployment target: Browser (static site deployment compatible)
- Web server must support:
  - Cross-origin isolation headers
  - Service worker serving (COI service worker)
  - WebGPU-capable browser (Chrome 120+)
  - SharedArrayBuffer capability (requires secure context)

## Key Dependency Rationale

**Critical Infrastructure:**
- `wgpu 29.0.1` - WebGPU bindings; single source for GPU API
- `naga 29.0.1` - GPU IR translator; converts AST → WGSL → WebGPU
- `zod 4.3.6` - Boundary IR schema; validates TS↔WASM serialization contract
- `wasm-bindgen 0.2` - WASM-JavaScript interop; enables worker messages and memory sharing

**State & Reactivity:**
- `mobx 6.15.0` - Declarative state management; enforced at store layer only
- `nuqs 2.8.8` - URL state synchronization for editor navigation

**Graph Visualization:**
- `reactflow 11.11.4` - Node-edge graph UI
- `dockview 4.13.1` - Multi-panel layout (editor, inspector, debug)

---

*Stack analysis: 2026-04-05*
