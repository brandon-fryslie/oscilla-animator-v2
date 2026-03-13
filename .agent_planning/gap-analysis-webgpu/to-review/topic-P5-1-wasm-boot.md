# P5-1: WASM Boot / Developer Experience & Migration - TO-REVIEW Items

## Item 1: Runtime-Scoped Boot Context vs Singleton Service
**Spec says**: Use an explicit context object `WasmBootContext` that is runtime-scoped (no hidden process-global singleton). Contains `state`, `initPromise`, `compileIr`, `lastError`.
**Implementation**: `BootService` is a class (`src/services/BootService.ts:27`) but instances are created by the app. The boot state is encapsulated in `BootSnapshot` (`state` + `error`). It does not expose `compileIr` or `initPromise` as public fields -- those are internal to the `start()` method.
**Gap**: The boot context is class-scoped rather than a plain data object. `compileIr` is not exposed on the context -- it's accessed through `NagaService` separately. The spec envisions a single object carrying both state AND the compile function, while the implementation separates them.
**Classification**: TO-REVIEW

## Item 2: Failure Policy - No Legacy Fallback
**Spec says**: Canonical runtime does NOT fall back to a legacy compiler path. Surface boot error details (message + cause chain). Preserve diagnostics for bug reports (asset URL, browser, timestamp).
**Implementation**: `BootService.ts:85-91` catches errors and sets `error: formatErrorMessage(error)` which extracts just the `message` property. No cause chain, asset URL, browser info, or timestamp is preserved.
**Gap**: Error context is minimal -- only the error message. Missing: cause chain, asset URL, browser UA, boot timestamp. These would help with remote debugging.
**Classification**: TO-REVIEW
