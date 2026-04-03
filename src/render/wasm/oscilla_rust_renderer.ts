import type { RustRendererBootstrapConfig } from '../rust/worker-protocol';

// ---------------------------------------------------------------------------
// WASM export contract
// ---------------------------------------------------------------------------

// [LAW:one-source-of-truth] All required WASM exports are declared once here.
// Validation at init time guarantees every field is present.
interface RendererWasmExports {
  init_engine(canvas: OffscreenCanvas, w: number, h: number): Promise<void> | void;
  pause_engine(): void;
  resume_engine(): void;
  install_pipeline(payloadJson: string): string;
  update_globals(data: Uint8Array): void;
  render_frame(): void;
  inject_poison_alloc(): void;
  take_frame_pacing_packet(): unknown;
}

const REQUIRED_EXPORTS: readonly (keyof RendererWasmExports)[] = [
  'init_engine', 'pause_engine', 'resume_engine', 'install_pipeline',
  'update_globals', 'render_frame', 'inject_poison_alloc', 'take_frame_pacing_packet',
];

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let wasm: RendererWasmExports | null = null;
let initPromise: Promise<void> | null = null;

function requireWasm(): RendererWasmExports {
  if (!wasm) throw new Error('Rust renderer WASM not initialized');
  return wasm;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

// [LAW:single-enforcer] WASM bootstrap happens at one bridge so all worker
// callers load and initialize the same binary contract.
export async function initRustRendererWasm(rendererWasmBytes: ArrayBuffer): Promise<void> {
  if (wasm) return;

  if (!initPromise) {
    initPromise = (async () => {
      // [LAW:one-source-of-truth] Use a literal dynamic import so bundlers own
      // wasm-glue asset pathing in both dev and production bundles.
      const rawModule = await import('./pkg/oscilla_rust_renderer.js');
      const m = rawModule as Record<string, unknown>;
      if (typeof m.default === 'function') {
        // [LAW:one-source-of-truth] The page owns renderer wasm byte loading;
        // worker bootstrap consumes only the transferred canonical bytes.
        await (m.default as (opts: unknown) => Promise<unknown>)({ module_or_path: rendererWasmBytes });
      }
      for (const key of REQUIRED_EXPORTS) {
        if (typeof m[key] !== 'function') {
          throw new Error(`Rust renderer WASM module missing ${key} export`);
        }
      }
      wasm = m as unknown as RendererWasmExports;
    })().catch((error) => {
      initPromise = null;
      throw new Error(
        `Failed to initialize Rust renderer WASM: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  await initPromise;
}

// ---------------------------------------------------------------------------
// Public API — thin wrappers over WASM exports
// ---------------------------------------------------------------------------

export async function initRustRendererEngine(
  canvas: OffscreenCanvas,
  _config: RustRendererBootstrapConfig,
  initialWidth: number,
  initialHeight: number,
): Promise<void> {
  await requireWasm().init_engine(canvas, initialWidth, initialHeight);
}

export function pauseRustRendererEngine(): void { requireWasm().pause_engine(); }
export function resumeRustRendererEngine(): void { requireWasm().resume_engine(); }
export function installRustRendererPipeline(payloadJson: string): string { return requireWasm().install_pipeline(payloadJson); }
export function updateRustRendererGlobals(data: Uint8Array): void { requireWasm().update_globals(data); }
export function renderRustRendererFrame(): void { requireWasm().render_frame(); }
export function injectRustRendererPoisonAlloc(): void { requireWasm().inject_poison_alloc(); }
export function takeRustRendererFramePacingPacket(): unknown { return requireWasm().take_frame_pacing_packet(); }
