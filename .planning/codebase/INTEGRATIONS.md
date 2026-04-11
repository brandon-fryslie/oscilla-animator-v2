# External Integrations

**Analysis Date:** 2026-04-05

## APIs & External Services

**None detected.** This codebase is a standalone browser-based animation editor with no external API dependencies.

## Data Storage

**Databases:**
- None detected. No persistent database backend.

**File Storage:**
- Local filesystem only (browser-side)
  - localStorage API: User custom composite blocks saved/loaded via `localStorage`
  - See: `src/blocks/composites/` with schema in `schema.ts`
  - Persistence layer: `src/services/PatchPersistence.ts`

**Caching:**
- Browser caches: WASM renderer binaries via standard HTTP caching
- No explicit cache invalidation mechanism (relies on HTTP ETag/Last-Modified)

## Authentication & Identity

**Auth Provider:**
- None. No user accounts or authentication layer.
- All graphs are local to the browser session.

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry, Rollbar, or equivalent integration.

**Logs:**
- Console logging only
  - Main thread: `console.error()`, `console.log()` for diagnostics
  - Worker (Rust): Bridged via `console` API from wasm-bindgen

**Debugging:**
- MobX DevTools integration available (stores use `makeAutoObservable()`)
- Vitest coverage and HTML reporter generation
- Custom debug UI: `src/ui/debug-viz/` for live value visualization during playback

## CI/CD & Deployment

**Hosting:**
- Not specified in this codebase
- Deployment target: Static site hosting (Vite builds to `dist/`)
- Requirements: Web server with CORS isolation headers support

**CI Pipeline:**
- Not detected in this codebase
- Expected: GitHub Actions or equivalent
  - Linting: `pnpm run lint`
  - Type checking: `pnpm run typecheck`
  - Tests: `pnpm run test`
  - E2E: `pnpm run test:rust-worker-gates` (requires built renderer)
  - Build: `pnpm run build`

**Package Distribution:**
- No npm package publishing detected
- WASM artifacts output to `src/render/wasm/pkg/` (vendored in monorepo)

## Environment Configuration

**Required env vars:**
- `BASE_URL` - Static asset base path (optional, defaults to `/`)
- `CHROME_BIN` - Chromium/Chrome executable path for screenshot scripts (optional)
- `VITEST_EXPOSE_GC` - Enable garbage collection exposure for memory profiling tests (optional)
- `RUSTFLAGS` - Rust compiler flags (optional, remapped for reproducible builds)
- `CARGO_HOME` - Rust package cache (optional, defaults to `$HOME/.cargo`)
- `CI` - CI environment indicator (optional, affects Playwright behavior)

**Secrets location:**
- No secrets storage detected
- No `.env` file usage (verified via `.gitignore` - `node_modules/` only listed)
- Cross-origin isolation headers configured in Vite config, not via env vars

## Webhooks & Callbacks

**Incoming:**
- None detected.

**Outgoing:**
- None detected.

## Worker Communication (Internal WASM Boundary)

**Worker Protocol** (`src/render/rust/worker-protocol.ts`):

**Inbound** (Main Thread → Rust Worker):
- `BOOTSTRAP` - Initialize renderer with configuration
- `INSTALL_PIPELINE` - Load compiled `PipelineInstallPayload` and prepare GPU resources
- `PAUSE` - Pause animation execution
- `RESUME` - Resume animation execution

**Outbound** (Rust Worker → Main Thread):
- `BOOTSTRAP_SUCCESS` - Renderer initialized successfully
- `INSTALL_PIPELINE_SUCCESS` - Pipeline compiled and GPU resources allocated
- `INSTALL_PIPELINE_FAILURE` - Pipeline compilation error
- `SCHEDULER_HEARTBEAT` - Periodic frame progress indicator (zero-copy via SharedArrayBuffer)
- `ENGINE_ERROR` - GPU or runtime error with context

**Communication Mechanism:**
- `Worker` API with `postMessage()` for structured messages (Boundary IR as JSON)
- `SharedArrayBuffer` for low-latency heartbeat monitoring (8 bytes, atomic reads on main thread)
- Zod validates all inbound/outbound messages at boundary

**Boundary Contract** (`src/render/rust/boundary-contract.ts`):
- Single source of truth for message shapes and TS↔WASM ABI
- Zod schemas: `RustRendererWorkerInboundMessage`, `RustRendererWorkerOutboundMessage`
- Serialized via `serde_json` on Rust side, `JSON.stringify`/`parse` on TS side
- `PipelineInstallPayload` contract includes:
  - `manifest` - GPU memory layout (buffers, globals, domains, textures)
  - `roster` - Ordered compute/render passes with ExprIR/StatementIR bodies
  - `functions` - Optional user-defined WGSL function registry

## WASM Module Loading

**Rust Renderer WASM** (`src/render/wasm/renderer-wasm-asset.ts`):
- Asset: `src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm`
- Loading mechanism: `fetchRustRendererWasmBytes()`
  - Vite-imported as `?url` (asset URL at build time)
  - Fetched via `fetch()` at runtime with validation
  - Validates WASM magic bytes (0x00 0x61 0x73 0x6d)
  - Error handling: URL resolution, fetch failure, invalid binary
- Transferred to worker via `postMessage()` (structured clone)
- Initialization: `wasm_bindgen()` call in worker context

**Debug Probe WASM** (`src/services/WasmDebugProbeTransport.ts`):
- Asset: Compiled from `src/services/wasm/rust/oscilla-debug-probe/`
- Loading: Similar mechanism to renderer
- Purpose: Runtime value snapshot extraction via ABI

## Browser APIs Used

**Critical for Runtime:**
- `SharedArrayBuffer` - Zero-copy worker communication (requires cross-origin isolation)
- `Worker` API - Dedicated worker for Rust renderer
- `OffscreenCanvas` - GPU rendering surface (passed to worker)
- `Performance` API - Heartbeat timing and latency measurement
- `localStorage` - Persist user composite blocks

**Optional:**
- `navigator.gpu` - WebGPU capability detection (conditional on feature availability)

## Security Boundaries

**Cross-Origin Isolation (Single Enforcer):**
- Enforced at HTTP server level via Vite config headers (`vite.config.ts`)
- Headers: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`
- Applied to dev server (`:5784`) and preview server
- Required for `SharedArrayBuffer` capability
- No fallback to `Atomics.wait()` or degraded mode

**WASM Validation:**
- WASM magic bytes verified at fetch boundary (not in worker)
- Content-Type checked for non-wasm responses
- Early failure preferred over silent degradation

---

*Integration audit: 2026-04-05*
