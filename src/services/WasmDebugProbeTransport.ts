import type { RuntimeState } from '../runtime/RuntimeState';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type {
  DebugProbeCommand,
  DebugProbeSubscription,
  DebugProbeTransport,
} from './DebugProbeProtocol';
import {
  debug_probe_command,
  debug_probe_poll_runtime_packet,
  initDebugProbeWasm,
} from './wasm/oscilla_debug_probe';
import {
  createDebugProbeRuntimeSnapshot,
  serializeDebugProbeRuntimeSnapshot,
} from './DebugProbeRuntimeSnapshot';

export interface WasmDebugProbeRuntimeView {
  readonly program: CompiledProgramIR | null;
  readonly state: RuntimeState | null;
}

export class WasmDebugProbeTransport implements DebugProbeTransport {
  private subscriptions: readonly DebugProbeSubscription[] = [];

  constructor(
    private readonly runtimeView: () => WasmDebugProbeRuntimeView,
  ) {}

  debugCommand(command: DebugProbeCommand): void {
    switch (command.kind) {
      case 'set_subscriptions':
        this.subscriptions = command.subscriptions;
        break;
      case 'clear_subscriptions':
        this.subscriptions = [];
        break;
      case 'set_rate_hz':
        break;
      default: {
        const _never: never = command;
        return _never;
      }
    }
    debug_probe_command(command);
  }

  debugPollPacket(capturedAtMs: number) {
    const view = this.runtimeView();
    if (!view.program || !view.state || this.subscriptions.length === 0) {
      return null;
    }
    const snapshot = createDebugProbeRuntimeSnapshot(view.program, view.state, this.subscriptions);
    if (!snapshot) {
      return null;
    }
    return debug_probe_poll_runtime_packet(capturedAtMs, serializeDebugProbeRuntimeSnapshot(snapshot));
  }
}

export async function createWasmDebugProbeTransport(
  runtimeView: () => WasmDebugProbeRuntimeView,
): Promise<WasmDebugProbeTransport> {
  await initDebugProbeWasm();
  return new WasmDebugProbeTransport(runtimeView);
}
