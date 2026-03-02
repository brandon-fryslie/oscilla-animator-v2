import type { CompiledProgramIR } from '../compiler/ir/program';
import type { RuntimeState } from '../runtime/RuntimeState';
import {
  type DebugProbeCommand,
  type DebugProbePacket,
  type DebugProbeSubscription,
  type DebugProbeTransport,
} from './DebugProbeProtocol';
import {
  createDebugProbeRuntimeSnapshot,
  extractDebugProbeSamplesFromRuntimeSnapshot,
} from './DebugProbeRuntimeSnapshot';

export interface LocalDebugProbeRuntimeView {
  readonly program: CompiledProgramIR | null;
  readonly state: RuntimeState | null;
}

/**
 * JS fallback implementation of the debug probe transport seam.
 *
 * [LAW:one-source-of-truth] Slot addressing comes exclusively from the
 * compiler-emitted ExprAddressTable.
 */
export class LocalDebugProbeTransport implements DebugProbeTransport {
  private sequence = 0;
  private rateHz = 5;
  private subscriptions: readonly DebugProbeSubscription[] = [];

  constructor(
    private readonly runtimeView: () => LocalDebugProbeRuntimeView,
  ) {}

  debugCommand(command: DebugProbeCommand): void {
    switch (command.kind) {
      case 'set_subscriptions': {
        this.subscriptions = command.subscriptions;
        return;
      }
      case 'clear_subscriptions': {
        this.subscriptions = [];
        return;
      }
      case 'set_rate_hz': {
        const nextRateHz = Math.floor(command.rateHz);
        if (Number.isFinite(nextRateHz) && nextRateHz > 0) {
          this.rateHz = nextRateHz;
        }
        return;
      }
      default: {
        const _never: never = command;
        return _never;
      }
    }
  }

  debugPollPacket(capturedAtMs: number): DebugProbePacket | null {
    const view = this.runtimeView();
    if (!view.program || !view.state || this.subscriptions.length === 0) {
      return null;
    }

    const snapshot = createDebugProbeRuntimeSnapshot(view.program, view.state, this.subscriptions);
    if (!snapshot) {
      return null;
    }
    const { packetFlags, samples } = extractDebugProbeSamplesFromRuntimeSnapshot(snapshot, this.subscriptions);

    if (samples.length === 0) {
      return null;
    }

    this.sequence += 1;

    return {
      version: 1,
      sequence: this.sequence,
      capturedAtMs,
      runtimeFrameId: snapshot.runtimeFrameId,
      sampleCount: samples.length,
      packetFlags,
      samples,
    };
  }

  getConfiguredRateHz(): number {
    return this.rateHz;
  }
}
