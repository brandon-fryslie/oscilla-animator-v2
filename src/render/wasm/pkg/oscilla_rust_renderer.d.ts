/* tslint:disable */
/* eslint-disable */

export function attach_shared_input(shared_input: SharedArrayBuffer): void;

export function attach_shared_shape_bank(shared_shape_bank: SharedArrayBuffer): void;

export function attach_shared_sink_table(shared_sink_table: SharedArrayBuffer): void;

export function init_engine(canvas: OffscreenCanvas, max_particles: number, max_shapes: number, debug_readback_hz: number, initial_width: number, initial_height: number): Promise<void>;

export function inject_poison_alloc(): void;

export function pause_engine(): void;

export function rebuild_gpu_pipelines(passes: any): Promise<void>;

export function resume_engine(): void;

export function set_debug_readback_hz(debug_readback_hz: number): void;

export function set_sink_pointer_map(sink_pointer_map_json: string): void;

export function take_frame_pacing_packet(): any;

export function take_readback_snapshot(): any;

export function upload_atlas_data(data: Uint32Array): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly attach_shared_input: (a: any) => [number, number];
    readonly attach_shared_shape_bank: (a: any) => [number, number];
    readonly attach_shared_sink_table: (a: any) => [number, number];
    readonly init_engine: (a: any, b: number, c: number, d: number, e: number, f: number) => any;
    readonly inject_poison_alloc: () => [number, number];
    readonly pause_engine: () => [number, number];
    readonly rebuild_gpu_pipelines: (a: any) => any;
    readonly resume_engine: () => [number, number];
    readonly set_debug_readback_hz: (a: number) => [number, number];
    readonly set_sink_pointer_map: (a: number, b: number) => [number, number];
    readonly take_frame_pacing_packet: () => [number, number, number];
    readonly take_readback_snapshot: () => [number, number, number];
    readonly upload_atlas_data: (a: any) => [number, number];
    readonly wasm_bindgen__closure__destroy__h34af7beb892ac90c: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__hac389948b8d10e82: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h3a942a1bf5f19357: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h08519952343379dd: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hcb563ba53ad42ec8: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h1d4d9e8783fdfb62: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h65696f0a51e234e0: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h65696f0a51e234e0_3: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
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
