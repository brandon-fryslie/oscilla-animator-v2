/**
 * Raw wasm-bindgen `init` input forms.
 *
 * - `RequestInfo`/`URL`: fetch the wasm from a URL/path.
 * - `Response`: pass a pre-fetched response object.
 * - `BufferSource`: pass preloaded wasm bytes.
 * - `WebAssembly.Module`: pass a precompiled module.
 */
export type WasmInitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

/**
 * wasm-bindgen supports either:
 * - direct raw input (`WasmInitInput` or `Promise<WasmInitInput>`)
 * - object form `{ module_or_path: ... }`
 */
export type WasmInitModuleOrPath =
  | { module_or_path: WasmInitInput | Promise<WasmInitInput> }
  | WasmInitInput
  | Promise<WasmInitInput>;
