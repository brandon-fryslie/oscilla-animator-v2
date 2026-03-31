/* tslint:disable */
/* eslint-disable */

export function init_engine(canvas: OffscreenCanvas, initial_width: number, initial_height: number): Promise<void>;

export function inject_poison_alloc(): void;

/**
 * Phase 1: Pipeline Install — receives the full PipelineInstallPayload JSON.
 * Returns an InstallReceipt JSON string.
 */
export function install_pipeline(payload_json: string): string;

export function pause_engine(): void;

/**
 * Phase 2: Execute the compiled roster (compute → draw_prep → render → submit).
 *
 * STUB: Clears canvas to dark gray so we can visually confirm the engine is alive.
 */
export function render_frame(): void;

export function resume_engine(): void;

export function take_frame_pacing_packet(): any;

/**
 * Phase 2 Avenue 1: Update globals (Float32Array written to uniform buffer).
 */
export function update_globals(data: Uint8Array): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly init_engine: (a: any, b: number, c: number) => any;
    readonly inject_poison_alloc: () => [number, number];
    readonly install_pipeline: (a: number, b: number) => [number, number, number, number];
    readonly pause_engine: () => [number, number];
    readonly render_frame: () => [number, number];
    readonly resume_engine: () => [number, number];
    readonly take_frame_pacing_packet: () => [number, number, number];
    readonly update_globals: (a: number, b: number) => [number, number];
    readonly wasm_bindgen__closure__destroy__h24eb1beb91406585: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hd99e32614ecba0da: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hc887791a8027d6e0: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3349dc4958f0f5ed: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h9ec520a2660f1f16: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h65b27961b9eb595f: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h04f3aea5abe10bac: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h04f3aea5abe10bac_1: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
