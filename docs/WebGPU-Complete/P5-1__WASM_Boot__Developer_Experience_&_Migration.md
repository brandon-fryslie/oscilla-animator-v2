> Alignment Notice (2026-03-03)
> [LAW:one-source-of-truth] WASM compiler boot ownership lives at one startup boundary and is consumed by runtime creation.
> [LAW:single-enforcer] Compiler readiness is enforced by boot gating; downstream services do not re-check with ad-hoc fallback logic.
> [LAW:no-silent-fallbacks] WASM boot failure is explicit and fatal for the canonical runtime path.

This document defines the startup contract for WASM-backed compiler initialization.

# The Developer Experience: WASM Boot Contract

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/WebGPU-Complete/P2-3__Naga_WASM_Compiler_Validation_Layer.md`
- `docs/WebGPU-Complete/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`

## Objective

Initialize the Naga WASM boundary before runtime creation so compile/link pipelines can be requested without race conditions.

## Invariants

1. Editor/runtime creation is blocked until boot status is `ready`.
2. Boot state is runtime-scoped (no hidden process-global singleton requirement).
3. On failure, boot returns a typed error and runtime creation aborts.

## 1. Canonical Boot Sequence

1. Resolve WASM asset URL (hashed build output preferred).
2. Initialize wasm-bindgen wrapper (`init(...)`).
3. Execute boot smoke-check (`compile_ir` on a minimal module).
4. Publish boot result (`ready` or `error`).

## 2. Runtime-Scoped Boot Context

Use an explicit context object returned from startup:

```ts
type BootState = "initial" | "loading" | "ready" | "error";

type WasmBootContext = {
  state: BootState;
  initPromise: Promise<void>;
  compileIr: (module: unknown) => unknown;
  lastError: Error | null;
};
```

The runtime factory consumes `WasmBootContext` and proceeds only when `state === "ready"`.

## 3. UI Boot Gate

UI should gate editor/runtime mounting behind boot readiness:

1. `initial` -> treat as `loading`; show splash/progress shell and do not create runtime/editor services
2. `loading` -> splash/progress shell
3. `error` -> fatal boot diagnostics view
4. `ready` -> create runtime/editor services

This keeps failure handling deterministic and prevents partial startup states.

## 4. Packaging and Delivery Requirements

1. Build via `wasm-pack --target web` (or equivalent toolchain).
2. Serve `.wasm` with `application/wasm` content type.
3. Use hashed asset URLs for cache busting.
4. Preload WASM asset when possible to reduce cold-start latency.

## 5. Failure Policy

Canonical runtime does **not** fall back to a legacy compiler path.

Failure handling requirements:

1. surface boot error details (message + cause chain)
2. avoid partial runtime initialization
3. preserve diagnostics for bug reports (asset URL, browser, timestamp)

## 6. Verification Gates

1. Unit test: boot state machine transitions (`initial -> loading -> ready/error`).
2. Integration test: runtime creation rejects when boot context is not ready.
3. Integration test: successful boot allows compile request path.
4. E2E smoke: app enters fatal screen on forced WASM load failure.

This contract keeps startup behavior deterministic and eliminates hidden fallback paths that would fragment runtime behavior.
