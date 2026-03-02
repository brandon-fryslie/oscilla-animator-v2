import { arenaRead } from '../runtime/ArenaValueStore';
import { getExprAddressTable } from '../runtime/ExprAddressTable';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type {
  DebugProbeCommand,
  DebugProbeSubscription,
  DebugProbeTransport,
} from './DebugProbeProtocol';
import {
  debug_probe_command,
  debug_probe_poll_packet,
  initDebugProbeWasm,
  type DebugProbeInputSample,
} from './wasm/oscilla_debug_probe';

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

    const table = getExprAddressTable(view.program);
    const frameId = view.state.cache.frameId;
    const samples: DebugProbeInputSample[] = this.subscriptions.map((subscription) => {
      const lookup = table.slotLookup.get(subscription.slotId);
      if (!lookup || lookup.arena.laneCount !== 1 || lookup.arena.stride < 1) {
        return {
          targetId: subscription.targetId,
          slotId: subscription.slotId as number,
          value: 0,
          valid: false,
          finite: false,
        };
      }
      const value = arenaRead(view.state!.arena, lookup.arena, 0, 0);
      return {
        targetId: subscription.targetId,
        slotId: subscription.slotId as number,
        value,
        valid: true,
        finite: Number.isFinite(value),
      };
    });

    return debug_probe_poll_packet(capturedAtMs, frameId, samples);
  }
}

export async function createWasmDebugProbeTransport(
  runtimeView: () => WasmDebugProbeRuntimeView,
): Promise<WasmDebugProbeTransport> {
  await initDebugProbeWasm();
  return new WasmDebugProbeTransport(runtimeView);
}
