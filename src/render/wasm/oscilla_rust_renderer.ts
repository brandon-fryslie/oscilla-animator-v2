import type { RustRendererBootstrapConfig, RustRendererGpuPass } from '../rust/worker-protocol';
import type { WasmInitModuleOrPath } from '../../wasm/init-types';

interface RendererWasmModule {
  readonly default?: (
    moduleOrPath?: WasmInitModuleOrPath,
  ) => Promise<unknown>;
  readonly init_engine?: (
    canvas: OffscreenCanvas,
    maxParticles: number,
    maxShapes: number,
    debugReadbackHz: number,
    initialWidth: number,
    initialHeight: number,
  ) => Promise<void> | void;
  readonly attach_shared_input?: (sharedInput: SharedArrayBuffer) => void;
  readonly attach_shared_shape_bank?: (sharedShapeBank: SharedArrayBuffer) => void;
  readonly attach_shared_sink_table?: (sharedSinkTable: SharedArrayBuffer) => void;
  readonly pause_engine?: () => void;
  readonly resume_engine?: () => void;
  readonly set_debug_readback_hz?: (debugReadbackHz: number) => void;
  readonly set_sink_pointer_map?: (sinkPointerMapJson: string) => void;
  readonly inject_poison_alloc?: () => void;
  readonly take_frame_pacing_packet?: () => unknown;
  readonly take_readback_snapshot?: () => unknown;
  readonly rebuild_gpu_pipelines?: (
    passes: readonly RustRendererGpuPass[],
  ) => Promise<void> | void;
  // [RECOVER-11] Atlas upload for Type5 MSDF text rendering.
  readonly upload_atlas_data?: (data: Uint32Array) => void;
  // Fast-path control update (direct GPU uniform buffer write).
  readonly update_control?: (offsetBytes: number, value: number) => void;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let initEngineImpl: RendererWasmModule['init_engine'] | null = null;
let attachSharedInputImpl: RendererWasmModule['attach_shared_input'] | null = null;
let attachSharedShapeBankImpl: RendererWasmModule['attach_shared_shape_bank'] | null = null;
let attachSharedSinkTableImpl: RendererWasmModule['attach_shared_sink_table'] | null = null;
let pauseEngineImpl: RendererWasmModule['pause_engine'] | null = null;
let resumeEngineImpl: RendererWasmModule['resume_engine'] | null = null;
let setDebugReadbackHzImpl: RendererWasmModule['set_debug_readback_hz'] | null = null;
let setSinkPointerMapImpl: RendererWasmModule['set_sink_pointer_map'] | null = null;
let injectPoisonAllocImpl: RendererWasmModule['inject_poison_alloc'] | null = null;
let takeFramePacingPacketImpl: RendererWasmModule['take_frame_pacing_packet'] | null = null;
let takeReadbackSnapshotImpl: RendererWasmModule['take_readback_snapshot'] | null = null;
let rebuildGpuPipelinesImpl: RendererWasmModule['rebuild_gpu_pipelines'] | null = null;
// [RECOVER-11] Atlas upload binding.
let uploadAtlasDataImpl: RendererWasmModule['upload_atlas_data'] | null = null;
let updateControlImpl: RendererWasmModule['update_control'] | null = null;

export async function initRustRendererWasm(rendererWasmBytes: ArrayBuffer): Promise<void> {
  if (initialized) {
    return;
  }

  if (!initPromise) {
    // [LAW:single-enforcer] WASM bootstrap happens at one bridge so all worker
    // callers load and initialize the same binary contract.
    initPromise = (async () => {
      // [LAW:one-source-of-truth] Use a literal dynamic import so bundlers own
      // wasm-glue asset pathing in both dev and production bundles.
      const rawModule = await import('./pkg/oscilla_rust_renderer.js');
      const wasmModule = rawModule as RendererWasmModule;
      if (typeof wasmModule.default === 'function') {
        // [LAW:one-source-of-truth] The page owns renderer wasm byte loading;
        // worker bootstrap consumes only the transferred canonical bytes.
        await wasmModule.default({ module_or_path: rendererWasmBytes });
      }
      if (typeof wasmModule.init_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing init_engine export');
      }
      if (typeof wasmModule.attach_shared_input !== 'function') {
        throw new Error('Rust renderer wasm module missing attach_shared_input export');
      }
      if (typeof wasmModule.attach_shared_shape_bank !== 'function') {
        throw new Error('Rust renderer wasm module missing attach_shared_shape_bank export');
      }
      if (typeof wasmModule.attach_shared_sink_table !== 'function') {
        throw new Error('Rust renderer wasm module missing attach_shared_sink_table export');
      }
      if (typeof wasmModule.rebuild_gpu_pipelines !== 'function') {
        throw new Error('Rust renderer wasm module missing rebuild_gpu_pipelines export');
      }
      if (typeof wasmModule.pause_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing pause_engine export');
      }
      if (typeof wasmModule.resume_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing resume_engine export');
      }
      if (typeof wasmModule.set_debug_readback_hz !== 'function') {
        throw new Error('Rust renderer wasm module missing set_debug_readback_hz export');
      }
      if (typeof wasmModule.set_sink_pointer_map !== 'function') {
        throw new Error('Rust renderer wasm module missing set_sink_pointer_map export');
      }
      if (typeof wasmModule.inject_poison_alloc !== 'function') {
        throw new Error('Rust renderer wasm module missing inject_poison_alloc export');
      }
      if (typeof wasmModule.take_frame_pacing_packet !== 'function') {
        throw new Error('Rust renderer wasm module missing take_frame_pacing_packet export');
      }
      if (typeof wasmModule.take_readback_snapshot !== 'function') {
        throw new Error('Rust renderer wasm module missing take_readback_snapshot export');
      }
      initEngineImpl = wasmModule.init_engine.bind(wasmModule);
      attachSharedInputImpl = wasmModule.attach_shared_input.bind(wasmModule);
      attachSharedShapeBankImpl = wasmModule.attach_shared_shape_bank.bind(wasmModule);
      attachSharedSinkTableImpl = wasmModule.attach_shared_sink_table.bind(wasmModule);
      pauseEngineImpl = wasmModule.pause_engine.bind(wasmModule);
      resumeEngineImpl = wasmModule.resume_engine.bind(wasmModule);
      setDebugReadbackHzImpl = wasmModule.set_debug_readback_hz.bind(wasmModule);
      setSinkPointerMapImpl = wasmModule.set_sink_pointer_map.bind(wasmModule);
      injectPoisonAllocImpl = wasmModule.inject_poison_alloc.bind(wasmModule);
      takeFramePacingPacketImpl = wasmModule.take_frame_pacing_packet.bind(wasmModule);
      takeReadbackSnapshotImpl = wasmModule.take_readback_snapshot.bind(wasmModule);
      rebuildGpuPipelinesImpl = wasmModule.rebuild_gpu_pipelines.bind(wasmModule);
      // [RECOVER-11] Atlas upload is optional (only present in builds with Type5).
      uploadAtlasDataImpl = wasmModule.upload_atlas_data
        ? wasmModule.upload_atlas_data.bind(wasmModule)
        : null;
      // Fast-path control update is optional (only present in builds with fast-path support).
      updateControlImpl = wasmModule.update_control
        ? wasmModule.update_control.bind(wasmModule)
        : null;
      initialized = true;
    })().catch((error) => {
      initPromise = null;
      throw new Error(
        `Failed to initialize Rust renderer wasm: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  await initPromise;
}

export async function initRustRendererEngine(
  canvas: OffscreenCanvas,
  config: RustRendererBootstrapConfig,
  initialWidth: number,
  initialHeight: number,
): Promise<void> {
  if (!initialized || !initEngineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  await initEngineImpl(
    canvas,
    config.maxParticles,
    config.maxShapes,
    config.debugReadbackHz,
    initialWidth,
    initialHeight,
  );
}

export function attachRustRendererSharedInput(sharedInput: SharedArrayBuffer): void {
  if (!initialized || !attachSharedInputImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  attachSharedInputImpl(sharedInput);
}

export function attachRustRendererSharedShapeBank(sharedShapeBank: SharedArrayBuffer): void {
  if (!initialized || !attachSharedShapeBankImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  attachSharedShapeBankImpl(sharedShapeBank);
}

export function attachRustRendererSharedSinkTable(sharedSinkTable: SharedArrayBuffer): void {
  if (!initialized || !attachSharedSinkTableImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  attachSharedSinkTableImpl(sharedSinkTable);
}

export function pauseRustRendererEngine(): void {
  if (!initialized || !pauseEngineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  pauseEngineImpl();
}

export function resumeRustRendererEngine(): void {
  if (!initialized || !resumeEngineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  resumeEngineImpl();
}

export function setRustRendererDebugReadbackHz(debugReadbackHz: number): void {
  if (!initialized || !setDebugReadbackHzImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  setDebugReadbackHzImpl(debugReadbackHz);
}

export function setRustRendererSinkPointerMap(sinkPointerMapJson: string): void {
  if (!initialized || !setSinkPointerMapImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  setSinkPointerMapImpl(sinkPointerMapJson);
}

export function injectRustRendererPoisonAlloc(): void {
  if (!initialized || !injectPoisonAllocImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  injectPoisonAllocImpl();
}

export function takeRustRendererFramePacingPacket(): unknown {
  if (!initialized || !takeFramePacingPacketImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return takeFramePacingPacketImpl();
}

// [RECOVER-10] [LAW:single-enforcer] One readback polling boundary.
export function takeRustRendererReadbackSnapshot(): unknown {
  if (!initialized || !takeReadbackSnapshotImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return takeReadbackSnapshotImpl();
}

export async function rebuildRustRendererGpuPipelines(
  passes: readonly RustRendererGpuPass[],
): Promise<void> {
  if (!initialized || !rebuildGpuPipelinesImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  await rebuildGpuPipelinesImpl(passes);
}

// [RECOVER-11] Upload MSDF atlas data for Type5 text rendering.
export function uploadRustRendererAtlasData(data: Uint32Array): void {
  if (!initialized || !uploadAtlasDataImpl) {
    throw new Error('Rust renderer wasm is not initialized or missing upload_atlas_data export');
  }
  uploadAtlasDataImpl(data);
}

// Fast-path control update: write a single f32 value directly to the GPU uniform buffer.
export function updateRustRendererControl(offsetBytes: number, value: number): void {
  if (!initialized || !updateControlImpl) {
    throw new Error('Rust renderer wasm is not initialized or missing update_control export');
  }
  updateControlImpl(offsetBytes, value);
}
