import type { RustRendererBootstrapConfig } from '../rust/worker-protocol';

interface RendererWasmModule {
  readonly default?: (
    moduleOrPath?: unknown,
  ) => Promise<unknown>;
  readonly init_engine?: (
    canvas: OffscreenCanvas,
    initialWidth: number,
    initialHeight: number,
  ) => Promise<void> | void;
  readonly pause_engine?: () => void;
  readonly resume_engine?: () => void;
  readonly install_pipeline?: (payloadJson: string) => string;
  readonly update_globals?: (data: Uint8Array) => void;
  readonly render_frame?: () => void;
  readonly inject_poison_alloc?: () => void;
  readonly take_frame_pacing_packet?: () => unknown;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let initEngineImpl: RendererWasmModule['init_engine'] | null = null;
let pauseEngineImpl: RendererWasmModule['pause_engine'] | null = null;
let resumeEngineImpl: RendererWasmModule['resume_engine'] | null = null;
let installPipelineImpl: RendererWasmModule['install_pipeline'] | null = null;
let updateGlobalsImpl: RendererWasmModule['update_globals'] | null = null;
let renderFrameImpl: RendererWasmModule['render_frame'] | null = null;
let injectPoisonAllocImpl: RendererWasmModule['inject_poison_alloc'] | null = null;
let takeFramePacingPacketImpl: RendererWasmModule['take_frame_pacing_packet'] | null = null;

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
      const wasmModule = rawModule as unknown as RendererWasmModule;
      if (typeof wasmModule.default === 'function') {
        // [LAW:one-source-of-truth] The page owns renderer wasm byte loading;
        // worker bootstrap consumes only the transferred canonical bytes.
        await wasmModule.default({ module_or_path: rendererWasmBytes });
      }
      if (typeof wasmModule.init_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing init_engine export');
      }
      if (typeof wasmModule.pause_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing pause_engine export');
      }
      if (typeof wasmModule.resume_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing resume_engine export');
      }
      if (typeof wasmModule.install_pipeline !== 'function') {
        throw new Error('Rust renderer wasm module missing install_pipeline export');
      }
      if (typeof wasmModule.update_globals !== 'function') {
        throw new Error('Rust renderer wasm module missing update_globals export');
      }
      if (typeof wasmModule.render_frame !== 'function') {
        throw new Error('Rust renderer wasm module missing render_frame export');
      }
      if (typeof wasmModule.inject_poison_alloc !== 'function') {
        throw new Error('Rust renderer wasm module missing inject_poison_alloc export');
      }
      if (typeof wasmModule.take_frame_pacing_packet !== 'function') {
        throw new Error('Rust renderer wasm module missing take_frame_pacing_packet export');
      }
      initEngineImpl = wasmModule.init_engine.bind(wasmModule);
      pauseEngineImpl = wasmModule.pause_engine.bind(wasmModule);
      resumeEngineImpl = wasmModule.resume_engine.bind(wasmModule);
      installPipelineImpl = wasmModule.install_pipeline.bind(wasmModule);
      updateGlobalsImpl = wasmModule.update_globals.bind(wasmModule);
      renderFrameImpl = wasmModule.render_frame.bind(wasmModule);
      injectPoisonAllocImpl = wasmModule.inject_poison_alloc.bind(wasmModule);
      takeFramePacingPacketImpl = wasmModule.take_frame_pacing_packet.bind(wasmModule);
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
  _config: RustRendererBootstrapConfig,
  initialWidth: number,
  initialHeight: number,
): Promise<void> {
  if (!initialized || !initEngineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  await initEngineImpl(canvas, initialWidth, initialHeight);
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

export function installRustRendererPipeline(payloadJson: string): string {
  if (!initialized || !installPipelineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return installPipelineImpl(payloadJson);
}

export function updateRustRendererGlobals(data: Uint8Array): void {
  if (!initialized || !updateGlobalsImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  updateGlobalsImpl(data);
}

export function renderRustRendererFrame(): void {
  if (!initialized || !renderFrameImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  renderFrameImpl();
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
