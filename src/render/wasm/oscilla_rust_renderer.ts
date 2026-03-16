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
  ) => Promise<void> | void;
  readonly attach_shared_input?: (sharedInput: SharedArrayBuffer) => void;
  readonly attach_shared_shape_bank?: (sharedShapeBank: SharedArrayBuffer) => void;
  readonly attach_shared_sink_table?: (sharedSinkTable: SharedArrayBuffer) => void;
  readonly resize_surface?: (width: number, height: number) => void;
  readonly pause_engine?: () => void;
  readonly resume_engine?: () => void;
  readonly inject_poison_alloc?: () => void;
  readonly take_frame_pacing_packet?: () => unknown;
  readonly take_readback_snapshot?: () => unknown;
  readonly rebuild_gpu_pipelines?: (
    passes: readonly RustRendererGpuPass[],
  ) => Promise<void> | void;
  // [RECOVER-11] Atlas upload for Type5 MSDF text rendering.
  readonly upload_atlas_data?: (data: Uint32Array) => void;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let initEngineImpl: RendererWasmModule['init_engine'] | null = null;
let attachSharedInputImpl: RendererWasmModule['attach_shared_input'] | null = null;
let attachSharedShapeBankImpl: RendererWasmModule['attach_shared_shape_bank'] | null = null;
let attachSharedSinkTableImpl: RendererWasmModule['attach_shared_sink_table'] | null = null;
let resizeSurfaceImpl: RendererWasmModule['resize_surface'] | null = null;
let pauseEngineImpl: RendererWasmModule['pause_engine'] | null = null;
let resumeEngineImpl: RendererWasmModule['resume_engine'] | null = null;
let injectPoisonAllocImpl: RendererWasmModule['inject_poison_alloc'] | null = null;
let takeFramePacingPacketImpl: RendererWasmModule['take_frame_pacing_packet'] | null = null;
let takeReadbackSnapshotImpl: RendererWasmModule['take_readback_snapshot'] | null = null;
let rebuildGpuPipelinesImpl: RendererWasmModule['rebuild_gpu_pipelines'] | null = null;
// [RECOVER-11] Atlas upload binding.
let uploadAtlasDataImpl: RendererWasmModule['upload_atlas_data'] | null = null;

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
      if (typeof wasmModule.resize_surface !== 'function') {
        throw new Error('Rust renderer wasm module missing resize_surface export');
      }
      if (typeof wasmModule.pause_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing pause_engine export');
      }
      if (typeof wasmModule.resume_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing resume_engine export');
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
      resizeSurfaceImpl = wasmModule.resize_surface.bind(wasmModule);
      pauseEngineImpl = wasmModule.pause_engine.bind(wasmModule);
      resumeEngineImpl = wasmModule.resume_engine.bind(wasmModule);
      injectPoisonAllocImpl = wasmModule.inject_poison_alloc.bind(wasmModule);
      takeFramePacingPacketImpl = wasmModule.take_frame_pacing_packet.bind(wasmModule);
      takeReadbackSnapshotImpl = wasmModule.take_readback_snapshot.bind(wasmModule);
      rebuildGpuPipelinesImpl = wasmModule.rebuild_gpu_pipelines.bind(wasmModule);
      // [RECOVER-11] Atlas upload is optional (only present in builds with Type5).
      uploadAtlasDataImpl = wasmModule.upload_atlas_data
        ? wasmModule.upload_atlas_data.bind(wasmModule)
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
): Promise<void> {
  if (!initialized || !initEngineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  await initEngineImpl(
    canvas,
    config.maxParticles,
    config.maxShapes,
    config.debugReadbackHz,
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

export function resizeRustRendererSurface(width: number, height: number): void {
  if (!initialized || !resizeSurfaceImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  resizeSurfaceImpl(width, height);
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
