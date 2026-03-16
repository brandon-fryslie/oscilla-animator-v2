import type { NagaModuleIR } from '../ir/naga-emitter';
import type { WasmInitModuleOrPath } from '../../wasm/init-types';
import { fetchNagaShimWasmBytes } from './naga-shim-asset';

export interface ShimFormattedError {
  readonly message: string;
  readonly location: string;
  readonly path: string;
}

export interface ShimCompilationResult {
  readonly wgsl: string;
  readonly is_valid: boolean;
  readonly errors: readonly ShimFormattedError[];
}

export type ShimBootStage = 'fetching' | 'compiling' | 'binding';

export interface ShimInitOptions {
  // [LAW:single-enforcer] Init runs once, but all concurrent callers receive
  // stage updates through this callback fan-out during the shared boot promise.
  readonly onStage?: (stage: ShimBootStage) => void;
}

type RustCompileFn = (
  module: NagaModuleIR,
  maxActiveLanes?: number,
) => ShimCompilationResult;

interface ShimModule {
  readonly compile_ir?: RustCompileFn;
  readonly init?: () => void;
  readonly default?: (
    moduleOrPath?: WasmInitModuleOrPath,
  ) => Promise<unknown>;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let compileImpl: RustCompileFn | null = null;
const initStageListeners = new Set<(stage: ShimBootStage) => void>();
let primedShimBytes: ArrayBuffer | null = null;

export function primeNagaShimWasmBytes(bytes: ArrayBuffer): void {
  primedShimBytes = bytes;
}

function compileInitError(message: string, path: string): ShimCompilationResult {
  return {
    wgsl: '',
    is_valid: false,
    errors: [
      {
        message,
        location: 'Module',
        path,
      },
    ],
  };
}

export default async function init(options?: ShimInitOptions): Promise<void> {
  if (initialized) return;
  const onStage = options?.onStage;
  if (onStage) {
    initStageListeners.add(onStage);
  }
  if (!initPromise) {
    // [LAW:single-enforcer] WASM boot ownership lives at one bridge boundary.
    initPromise = Promise.resolve()
      .then(async () => {
        for (const listener of initStageListeners) {
          listener('fetching');
        }
        return await import('./pkg/oscilla_naga_shim.js');
      })
      .then(async (rawModule) => {
        for (const listener of initStageListeners) {
          listener('compiling');
        }
        const module = rawModule as unknown as ShimModule;
        if (typeof module.default === 'function') {
          const shimBytes = primedShimBytes ?? await fetchNagaShimWasmBytes();
          // [LAW:one-source-of-truth] Both main-thread and compile-worker boot
          // consume the same page-owned validated shim bytes.
          await module.default({ module_or_path: shimBytes });
        }
        for (const listener of initStageListeners) {
          listener('binding');
        }
        const initWasm = module.init;
        const compileWasm = module.compile_ir;
        if (typeof initWasm !== 'function') {
          throw new Error('oscilla_naga_shim.js missing init export');
        }
        if (typeof compileWasm !== 'function') {
          throw new Error('oscilla_naga_shim.js missing compile_ir export');
        }
        await initWasm();
        compileImpl = compileWasm as RustCompileFn;
        initialized = true;
      })
      .catch((error) => {
        initPromise = null;
        throw new Error(
          `Failed to initialize Rust/WASM Naga shim: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
  try {
    await initPromise;
  } finally {
    if (onStage) {
      initStageListeners.delete(onStage);
    }
  }
}

export function compile_ir(module: NagaModuleIR, maxActiveLanes?: number): ShimCompilationResult {
  if (!initialized || !compileImpl) {
    return compileInitError('Shim not initialized', 'init');
  }
  return compileImpl(module, maxActiveLanes);
}
