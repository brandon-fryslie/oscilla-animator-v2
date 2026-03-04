/* tslint:disable */
/* eslint-disable */

export function attach_shared_input(shared_input: SharedArrayBuffer): void;

export function init_engine(canvas: OffscreenCanvas, max_particles: number, max_shapes: number, debug_readback_hz: number): Promise<void>;

export function inject_poison_alloc(): void;

export function pause_engine(): void;

export function rebuild_pipeline(simulation_wgsl: string, assembly_wgsl: string, uber_shader_wgsl: string, particle_count: number, shape_count: number): void;

export function rebuild_simulation_pipeline(simulation_wgsl: string): void;

export function resize_surface(width: number, height: number): void;

export function resume_engine(): void;

export function sync_render_payload(topology_words: Uint32Array, instance_floats: Float32Array, indirect_args_words: Uint32Array, vertex_floats: Float32Array, index_words: Uint32Array, draw_record_count: number): void;

export function take_frame_pacing_packet(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly attach_shared_input: (a: any) => [number, number];
    readonly init_engine: (a: any, b: number, c: number, d: number) => any;
    readonly inject_poison_alloc: () => [number, number];
    readonly pause_engine: () => [number, number];
    readonly rebuild_pipeline: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly rebuild_simulation_pipeline: (a: number, b: number) => [number, number];
    readonly resize_surface: (a: number, b: number) => [number, number];
    readonly resume_engine: () => [number, number];
    readonly sync_render_payload: (a: any, b: any, c: any, d: any, e: any, f: number) => [number, number];
    readonly take_frame_pacing_packet: () => [number, number, number];
    readonly wasm_bindgen__closure__destroy__h22c5c9496e43279b: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__haf1314f791359451: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h34af7beb892ac90c: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h8725eb454c15ba22: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hcb563ba53ad42ec8: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h1d4d9e8783fdfb62: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h210728d8ddfda338: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
