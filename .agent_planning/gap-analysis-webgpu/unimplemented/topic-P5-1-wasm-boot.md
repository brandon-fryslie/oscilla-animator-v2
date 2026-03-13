# P5-1: WASM Boot / Developer Experience & Migration - UNIMPLEMENTED Items

## Item 1: Hashed Asset URLs / Cache Busting
**Spec says**: Use hashed asset URLs for cache busting. Serve `.wasm` with `application/wasm` content type. Preload WASM asset when possible.
**Implementation**: WASM assets are loaded via wasm-bindgen default path resolution (`src/compiler/wasm/pkg/oscilla_naga_shim.js`, `src/render/wasm/pkg/oscilla_rust_renderer.js`). Vite build likely handles content hashing, but there is no explicit preload `<link>` tag or manual cache-busting configuration in the codebase.
**Gap**: No explicit WASM preload. Content hashing may be handled by Vite implicitly but is not explicitly configured or verified for WASM assets.
**Classification**: UNIMPLEMENTED

## Item 2: Verification Gates (Test Suite)
**Spec says**: (1) Unit test for boot state machine transitions. (2) Integration test: runtime creation rejects when not ready. (3) Integration test: successful boot allows compile path. (4) E2E smoke: app enters fatal screen on forced WASM load failure.
**Implementation**: `src/services/__tests__/BootService.test.ts` exists (found via grep). However, no E2E test forcing WASM load failure to verify the fatal boot screen.
**Gap**: Unit tests exist but E2E smoke test for forced WASM failure is not verified. Need to check if existing tests cover all four verification gates.
**Classification**: UNIMPLEMENTED (E2E gate test)
