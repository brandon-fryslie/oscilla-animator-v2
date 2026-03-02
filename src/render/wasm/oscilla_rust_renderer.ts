import type { RustRendererBootstrapConfig } from '../rust/worker-protocol';

interface RendererWasmModule {
  readonly default?: (
    moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module | Promise<unknown>,
  ) => Promise<unknown>;
  readonly init_engine?: (
    canvas: OffscreenCanvas,
    maxParticles: number,
    maxShapes: number,
    debugReadbackHz: number,
  ) => Promise<void> | void;
  readonly attach_shared_input?: (sharedInput: SharedArrayBuffer) => void;
  readonly resize_surface?: (width: number, height: number) => void;
  readonly pause_engine?: () => void;
  readonly resume_engine?: () => void;
  readonly inject_poison_alloc?: () => void;
  readonly take_runtime_event_code?: () => number;
  readonly take_runtime_status?: () => unknown;
  readonly take_frame_pacing_packet?: () => unknown;
  readonly rebuild_pipeline?: (
    simulationWgsl: string,
    assemblyWgsl: string,
    uberShaderWgsl: string,
    particleCount: number,
    shapeCount: number,
  ) => Promise<void> | void;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let initEngineImpl: RendererWasmModule['init_engine'] | null = null;
let attachSharedInputImpl: RendererWasmModule['attach_shared_input'] | null = null;
let resizeSurfaceImpl: RendererWasmModule['resize_surface'] | null = null;
let pauseEngineImpl: RendererWasmModule['pause_engine'] | null = null;
let resumeEngineImpl: RendererWasmModule['resume_engine'] | null = null;
let injectPoisonAllocImpl: RendererWasmModule['inject_poison_alloc'] | null = null;
let takeRuntimeEventCodeImpl: RendererWasmModule['take_runtime_event_code'] | null = null;
let takeRuntimeStatusImpl: RendererWasmModule['take_runtime_status'] | null = null;
let takeFramePacingPacketImpl: RendererWasmModule['take_frame_pacing_packet'] | null = null;
let rebuildPipelineImpl: RendererWasmModule['rebuild_pipeline'] | null = null;

export async function initRustRendererWasm(): Promise<void> {
  if (initialized) {
    return;
  }

  if (!initPromise) {
    // [LAW:single-enforcer] WASM bootstrap happens at one bridge so all worker
    // callers load and initialize the same binary contract.
    initPromise = (async () => {
      const modulePath = './pkg/oscilla_rust_renderer.js';
      const rawModule = await import(/* @vite-ignore */ modulePath);
      const wasmModule = rawModule as RendererWasmModule;
      if (typeof wasmModule.default === 'function') {
        // [LAW:one-source-of-truth] WASM asset resolution is centralized in one
        // URL derivation so worker and runtime never drift on binary pathing.
        const wasmUrl = new URL('./pkg/oscilla_rust_renderer_bg.wasm', import.meta.url);
        await wasmModule.default(wasmUrl);
      }
      if (typeof wasmModule.init_engine !== 'function') {
        throw new Error('Rust renderer wasm module missing init_engine export');
      }
      if (typeof wasmModule.attach_shared_input !== 'function') {
        throw new Error('Rust renderer wasm module missing attach_shared_input export');
      }
      if (typeof wasmModule.rebuild_pipeline !== 'function') {
        throw new Error('Rust renderer wasm module missing rebuild_pipeline export');
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
      if (typeof wasmModule.take_runtime_event_code !== 'function') {
        throw new Error('Rust renderer wasm module missing take_runtime_event_code export');
      }
      if (typeof wasmModule.take_runtime_status !== 'function') {
        throw new Error('Rust renderer wasm module missing take_runtime_status export');
      }
      if (typeof wasmModule.take_frame_pacing_packet !== 'function') {
        throw new Error('Rust renderer wasm module missing take_frame_pacing_packet export');
      }
      initEngineImpl = wasmModule.init_engine.bind(wasmModule);
      attachSharedInputImpl = wasmModule.attach_shared_input.bind(wasmModule);
      resizeSurfaceImpl = wasmModule.resize_surface.bind(wasmModule);
      pauseEngineImpl = wasmModule.pause_engine.bind(wasmModule);
      resumeEngineImpl = wasmModule.resume_engine.bind(wasmModule);
      injectPoisonAllocImpl = wasmModule.inject_poison_alloc.bind(wasmModule);
      takeRuntimeEventCodeImpl = wasmModule.take_runtime_event_code.bind(wasmModule);
      takeRuntimeStatusImpl = wasmModule.take_runtime_status.bind(wasmModule);
      takeFramePacingPacketImpl = wasmModule.take_frame_pacing_packet.bind(wasmModule);
      rebuildPipelineImpl = wasmModule.rebuild_pipeline.bind(wasmModule);
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

export function takeRustRendererRuntimeEventCode(): number {
  if (!initialized || !takeRuntimeEventCodeImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return takeRuntimeEventCodeImpl();
}

export function takeRustRendererRuntimeStatus(): unknown {
  if (!initialized || !takeRuntimeStatusImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return takeRuntimeStatusImpl();
}

export function takeRustRendererFramePacingPacket(): unknown {
  if (!initialized || !takeFramePacingPacketImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  return takeFramePacingPacketImpl();
}

export async function rebuildRustRendererPipeline(
  simulationWgsl: string,
  assemblyWgsl: string,
  uberShaderWgsl: string,
  particleCount: number,
  shapeCount: number,
): Promise<void> {
  if (!initialized || !rebuildPipelineImpl) {
    throw new Error('Rust renderer wasm is not initialized');
  }
  await rebuildPipelineImpl(simulationWgsl, assemblyWgsl, uberShaderWgsl, particleCount, shapeCount);
}
