import type {
  DebugProbeCommand,
  DebugProbePacket,
} from '../DebugProbeProtocol';

export interface DebugProbeInputSample {
  readonly targetId: number;
  readonly slotId: number;
  readonly value: number;
  readonly valid: boolean;
  readonly finite: boolean;
}

type RustDebugCommandFn = (command: DebugProbeCommand) => void;
type RustDebugPollPacketFn = (
  capturedAtMs: number,
  runtimeFrameId: number,
  samples: readonly DebugProbeInputSample[],
) => DebugProbePacket | null;

interface DebugProbeWasmModule {
  readonly init?: () => void;
  readonly debug_command?: RustDebugCommandFn;
  readonly debug_poll_packet?: RustDebugPollPacketFn;
  readonly default?: (
    moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module | Promise<unknown>,
  ) => Promise<unknown>;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let debugCommandImpl: RustDebugCommandFn | null = null;
let debugPollPacketImpl: RustDebugPollPacketFn | null = null;

export async function initDebugProbeWasm(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    // [LAW:single-enforcer] WASM runtime debug bridge initialization ownership
    // is centralized at this module boundary.
    initPromise = import('./pkg/oscilla_debug_probe.js')
      .then(async (raw) => {
        const module = raw as unknown as DebugProbeWasmModule;
        if (typeof module.default === 'function') {
          const wasmUrl = new URL('./pkg/oscilla_debug_probe_bg.wasm', import.meta.url);
          await module.default(wasmUrl);
        }
        if (typeof module.init !== 'function') {
          throw new Error('oscilla_debug_probe.js missing init export');
        }
        if (typeof module.debug_command !== 'function') {
          throw new Error('oscilla_debug_probe.js missing debug_command export');
        }
        if (typeof module.debug_poll_packet !== 'function') {
          throw new Error('oscilla_debug_probe.js missing debug_poll_packet export');
        }
        module.init();
        debugCommandImpl = module.debug_command;
        debugPollPacketImpl = module.debug_poll_packet;
        initialized = true;
      })
      .catch((error) => {
        initPromise = null;
        throw new Error(
          `Failed to initialize Rust/WASM debug probe module: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
  await initPromise;
}

export function debug_probe_command(command: DebugProbeCommand): void {
  if (!initialized || !debugCommandImpl) {
    throw new Error('Rust/WASM debug probe module not initialized');
  }
  debugCommandImpl(command);
}

export function debug_probe_poll_packet(
  capturedAtMs: number,
  runtimeFrameId: number,
  samples: readonly DebugProbeInputSample[],
): DebugProbePacket | null {
  if (!initialized || !debugPollPacketImpl) {
    throw new Error('Rust/WASM debug probe module not initialized');
  }
  return debugPollPacketImpl(capturedAtMs, runtimeFrameId, samples);
}
