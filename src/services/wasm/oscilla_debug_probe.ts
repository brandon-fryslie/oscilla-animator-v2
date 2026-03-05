import type {
  DebugProbeCommand,
  DebugProbePacket,
} from '../DebugProbeProtocol';
import {
  DEBUG_PROBE_SLOT_META_WORDS,
  type PackedDebugProbeRuntimeSnapshot,
} from '../DebugProbeRuntimeSnapshot';

type RustDebugCommandFn = (command: DebugProbeCommand) => void;
type RustDebugPollPackedRuntimePacketFn = (
  capturedAtMs: number,
  runtimeFrameId: number,
  slotMeta: Uint32Array,
  componentOffsets: Uint32Array,
  slotValues: Float32Array,
) => DebugProbePacket | null;

interface DebugProbeWasmModule {
  readonly init?: () => void;
  readonly debug_command?: RustDebugCommandFn;
  readonly debug_poll_packed_runtime_packet?: RustDebugPollPackedRuntimePacketFn;
  readonly debug_probe_slot_meta_words?: () => number;
  readonly default?: (
    moduleOrPath?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module | Promise<unknown>,
  ) => Promise<unknown>;
}

let initialized = false;
let initPromise: Promise<void> | null = null;
let debugCommandImpl: RustDebugCommandFn | null = null;
let debugPollPackedRuntimePacketImpl: RustDebugPollPackedRuntimePacketFn | null = null;

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
          await module.default({ module_or_path: wasmUrl });
        }
        if (typeof module.init !== 'function') {
          throw new Error('oscilla_debug_probe.js missing init export');
        }
        if (typeof module.debug_command !== 'function') {
          throw new Error('oscilla_debug_probe.js missing debug_command export');
        }
        if (typeof module.debug_poll_packed_runtime_packet !== 'function') {
          throw new Error('oscilla_debug_probe.js missing debug_poll_packed_runtime_packet export');
        }
        if (typeof module.debug_probe_slot_meta_words !== 'function') {
          throw new Error('oscilla_debug_probe.js missing debug_probe_slot_meta_words export');
        }
        const wasmSlotMetaWords = module.debug_probe_slot_meta_words();
        if (wasmSlotMetaWords !== DEBUG_PROBE_SLOT_META_WORDS) {
          throw new Error(
            `Packed debug probe ABI mismatch: wasm slot_meta_words=${wasmSlotMetaWords}, ts slot_meta_words=${DEBUG_PROBE_SLOT_META_WORDS}`,
          );
        }
        module.init();
        debugCommandImpl = module.debug_command;
        debugPollPackedRuntimePacketImpl = module.debug_poll_packed_runtime_packet;
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

export function debug_probe_poll_packed_runtime_packet(
  capturedAtMs: number,
  snapshot: PackedDebugProbeRuntimeSnapshot,
): DebugProbePacket | null {
  if (!initialized || !debugPollPackedRuntimePacketImpl) {
    throw new Error('Rust/WASM debug probe module not initialized');
  }
  return debugPollPackedRuntimePacketImpl(
    capturedAtMs,
    snapshot.runtimeFrameId,
    snapshot.slotMeta,
    snapshot.componentOffsets,
    snapshot.slotValues,
  );
}
