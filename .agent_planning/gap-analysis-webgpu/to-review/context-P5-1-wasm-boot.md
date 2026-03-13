# Context: P5-1 - WASM Boot / Developer Experience & Migration

## Target State
Deterministic WASM boot contract:
1. Runtime-scoped `WasmBootContext` object with `state`, `initPromise`, `compileIr`, `lastError`
2. State machine: `initial -> loading -> ready | error`
3. UI gate blocking editor/runtime until ready
4. Smoke test: `compile_ir` on minimal module
5. Hashed asset URLs, `application/wasm` content type, preload
6. Rich error context: message + cause chain + asset URL + browser + timestamp
7. Four verification gates (unit, integration x2, E2E)

## Current State
1. `BootService` class (`src/services/BootService.ts:27`) manages boot state machine. Not a plain context object -- `compileIr` is accessed via `NagaService` separately.
2. Extended state machine: `initial -> fetching -> compiling -> ready | error` (more granular than spec).
3. `BootGateScreen.tsx` renders gate UI with state-specific labels and error display.
4. Smoke test exists (`BootService.ts:94-106`) -- calls `compile_ir({} as never, 1)` and validates structured result.
5. WASM loaded via wasm-bindgen defaults. No explicit preload or cache-bust configuration.
6. Error context is minimal: only `error.message`. No cause chain, browser info, or timestamp.
7. `BootService.test.ts` exists. E2E forced-failure test not verified.

## Files Involved
- `src/services/BootService.ts` (boot state machine)
- `src/ui/components/app/BootGateScreen.tsx` (gate UI)
- `src/wasm/init-types.ts` (WASM init type definitions)
- `src/compiler/wasm/oscilla_naga_shim.ts` (Naga WASM wrapper)
- `src/render/wasm/oscilla_rust_renderer.ts` (renderer WASM wrapper)
- `src/services/wasm/oscilla_debug_probe.ts` (debug probe WASM wrapper)
- `src/main.ts` (app entry point, boot orchestration)
- `src/services/__tests__/BootService.test.ts` (boot tests)

## Suggested Approach
1. **Error context**: Enrich `BootSnapshot` error field with `{ message, cause, assetUrl, userAgent, timestamp }`. Low effort.
2. **WASM preload**: Add `<link rel="preload" as="fetch" href="...">` for WASM assets. Low effort but needs Vite plugin or manual injection.
3. **E2E test**: Playwright test that intercepts WASM fetch with 404 and verifies boot gate error screen appears.

## Risks
- Enriched error context may expose internal paths to users (scrub before display).
- WASM preload effectiveness varies by browser.
- E2E test needs Playwright infrastructure that may not exist yet.
