# P2-3: Naga WASM Compiler Validation Layer - TO-REVIEW Items

## Item 1: Error Mapping with Source Map
**Spec says**: Parse error strings from Naga to extract expression/statement handles, then look up in sourceMap to find the user's BlockID.
**Implementation**: `src/compiler/naga-compile.ts:37-46` has `parseSourceHandle()` which regex-matches `Expression [42]` or `Statement [7]` from error location strings. Then at `src/compiler/naga-compile.ts:142-162`, `toCompileErrors()` maps parsed handles to `sourceMap[Expr_42]` or `sourceMap[Stmt_7]` to find the `blockId`.
**Gap**: Implemented correctly. The source map is built during lowering in `ScheduleNagaLowering.ts:242-255` with entries keyed as `Expr_${id}` and `Stmt_${id}`.
**Classification**: TO-REVIEW — confirmed working. However, note that the error locations from the Rust shim at `lib.rs:204-210` use a simpler format (`"Module"`, `"WGSL parse"`, `"Naga validator"`) for the top-level errors, and Naga-specific handle references are only surfaced when the shim can extract them. For shim-level errors (deserialization, emission), the location is not Naga-style so `parseSourceHandle` returns null and no blockId is resolved.

## Item 2: WASM Module Size and Preloading
**Spec says**: "The compiled WASM binary will be approximately 600KB - 1.2MB (gzipped). Load it via <link rel='preload'> or start the fetch in a WebWorker immediately upon page load."
**Implementation**: WASM initialization is lazy — `NagaService.boot()` is called on demand at `src/compiler/naga-bridge.ts:34-49`. The boot is triggered at first compile, not at page load. `BootService` at `src/services/BootService.ts` handles app startup but does not preload the WASM.
**Gap**: No preloading strategy. WASM is loaded on first compile. For fast initial loads this may cause a visible delay on first graph edit.
**Classification**: TO-REVIEW

## Item 3: Binary Format Optimization Path
**Spec says**: "Optimization (Future): If this becomes a bottleneck, we switch from serde-wasm-bindgen marshalling to a binary format (e.g., bincode) and pass a typed Uint8Array to WASM."
**Implementation**: Uses `serde-wasm-bindgen` as specified. No binary format optimization exists.
**Gap**: This was explicitly called out as a future optimization. Not blocking.
**Classification**: TO-REVIEW — acceptable for now per spec's own guidance.
