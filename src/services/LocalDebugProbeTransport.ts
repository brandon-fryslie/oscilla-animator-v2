import type { CompiledProgramIR } from '../compiler/ir/program';
import { arenaDecodeToAoS, arenaRead } from '../runtime/ArenaValueStore';
import { getExprAddressTable } from '../runtime/ExprAddressTable';
import type { RuntimeState } from '../runtime/RuntimeState';
import {
  DEBUG_PACKET_FLAG_NAN_DETECTED_ANY,
  DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID,
  DEBUG_SAMPLE_FLAG_FRESH,
  DEBUG_SAMPLE_FLAG_NAN_DETECTED,
  type DebugProbeCommand,
  type DebugProbePacket,
  type DebugProbePacketSample,
  type DebugProbeSubscription,
  type DebugProbeTransport,
} from './DebugProbeProtocol';

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

    const table = getExprAddressTable(view.program);
    let packetFlags = 0;
    const samples: DebugProbePacketSample[] = [];

    // [LAW:dataflow-not-control-flow] Every poll executes one fixed sampling
    // pipeline; variability is represented in per-sample flags and packet flags.
    for (const sub of this.subscriptions) {
      const lookup = table.slotLookup.get(sub.slotId);
      if (!lookup || lookup.arena.laneCount !== 1 || lookup.arena.stride < 1) {
        if (sub.sampleKind === 'scalar') {
          packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
          continue;
        }
      }
      if (!lookup || lookup.arena.stride < 1) {
        packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
        continue;
      }
      if (sub.sampleKind === 'scalar') {
        const value = arenaRead(view.state.arena, lookup.arena, 0, 0);
        const finite = Number.isFinite(value);
        if (!finite) {
          packetFlags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
        }

        samples.push({
          targetId: sub.targetId,
          slotId: sub.slotId,
          payloadKind: 'scalar',
          stride: 1,
          laneCount: 1,
          sampleFlags: finite ? DEBUG_SAMPLE_FLAG_FRESH : DEBUG_SAMPLE_FLAG_NAN_DETECTED,
          values: [value],
        });
        continue;
      }

      const laneStart = sub.laneWindow?.start ?? 0;
      const laneCount = sub.laneWindow?.count ?? lookup.arena.laneCount;
      if (laneStart < 0 || laneCount < 1 || laneStart + laneCount > lookup.arena.laneCount) {
        packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
        continue;
      }
      const decoded = arenaDecodeToAoS(view.state.arena, lookup.arena);
      const startOffset = laneStart * lookup.arena.stride;
      const endOffset = startOffset + laneCount * lookup.arena.stride;
      const values = Array.from(decoded.subarray(startOffset, endOffset));
      const finite = values.every((value) => Number.isFinite(value));
      if (!finite) {
        packetFlags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
      }
      samples.push({
        targetId: sub.targetId,
        slotId: sub.slotId,
        payloadKind: 'lane_window',
        stride: lookup.arena.stride,
        laneCount,
        sampleFlags: finite ? DEBUG_SAMPLE_FLAG_FRESH : DEBUG_SAMPLE_FLAG_NAN_DETECTED,
        values,
      });
    }

    if (samples.length === 0) {
      return null;
    }

    this.sequence += 1;

    return {
      version: 1,
      sequence: this.sequence,
      capturedAtMs,
      runtimeFrameId: view.state.cache.frameId,
      sampleCount: samples.length,
      packetFlags,
      samples,
    };
  }

  getConfiguredRateHz(): number {
    return this.rateHz;
  }
}
