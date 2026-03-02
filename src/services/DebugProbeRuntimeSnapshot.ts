import { arenaDecodeToAoS, arenaRead, type ArenaSlotDescriptor } from '../runtime/ArenaValueStore';
import { getExprAddressTable } from '../runtime/ExprAddressTable';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../types';
import {
  DEBUG_PACKET_FLAG_NAN_DETECTED_ANY,
  DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID,
  DEBUG_SAMPLE_FLAG_FRESH,
  DEBUG_SAMPLE_FLAG_NAN_DETECTED,
  type DebugProbePacketSample,
  type DebugProbeSubscription,
} from './DebugProbeProtocol';

export interface DebugProbeRuntimeSlotSnapshot {
  readonly slotId: ValueSlot;
  readonly descriptor: ArenaSlotDescriptor;
  readonly values: Float32Array;
}

export interface DebugProbeRuntimeSnapshot {
  readonly runtimeFrameId: number;
  readonly slots: readonly DebugProbeRuntimeSlotSnapshot[];
}

export interface DebugProbeRuntimeSnapshotExtraction {
  readonly packetFlags: number;
  readonly samples: readonly DebugProbePacketSample[];
}

function localizeDescriptor(descriptor: ArenaSlotDescriptor): ArenaSlotDescriptor {
  return {
    ...descriptor,
    offset: 0,
  };
}

export function createDebugProbeRuntimeSnapshot(
  program: CompiledProgramIR,
  state: RuntimeState,
  subscriptions: readonly DebugProbeSubscription[],
): DebugProbeRuntimeSnapshot | null {
  if (subscriptions.length === 0) {
    return null;
  }

  const table = getExprAddressTable(program);
  const slots = new Map<ValueSlot, DebugProbeRuntimeSlotSnapshot>();

  for (const subscription of subscriptions) {
    if (slots.has(subscription.slotId)) {
      continue;
    }
    const lookup = table.slotLookup.get(subscription.slotId);
    if (!lookup) {
      continue;
    }
    const descriptor = localizeDescriptor(lookup.arena);
    // [LAW:one-source-of-truth] The compiler-emitted arena descriptor remains
    // the canonical slot layout; this snapshot only rebases the offset to the
    // slot-local region for transport/runtime-boundary use.
    slots.set(subscription.slotId, {
      slotId: subscription.slotId,
      descriptor,
      values: state.arena.subarray(lookup.arena.offset, lookup.arena.offset + lookup.arena.length),
    });
  }

  return {
    runtimeFrameId: state.cache.frameId,
    slots: Array.from(slots.values()),
  };
}

export function extractDebugProbeSamplesFromRuntimeSnapshot(
  snapshot: DebugProbeRuntimeSnapshot,
  subscriptions: readonly DebugProbeSubscription[],
): DebugProbeRuntimeSnapshotExtraction {
  let packetFlags = 0;
  const samples: DebugProbePacketSample[] = [];
  const slotById = new Map(snapshot.slots.map((slot) => [slot.slotId, slot]));

  // [LAW:dataflow-not-control-flow] Every poll walks the subscription list in
  // one fixed order; validity/freshness travel in the data rather than by
  // changing the pipeline shape.
  for (const subscription of subscriptions) {
    const slot = slotById.get(subscription.slotId);
    if (!slot || slot.descriptor.stride < 1) {
      packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
      continue;
    }

    if (subscription.sampleKind === 'scalar') {
      if (slot.descriptor.laneCount !== 1) {
        packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
        continue;
      }
      const value = arenaRead(slot.values, slot.descriptor, 0, 0);
      const finite = Number.isFinite(value);
      if (!finite) {
        packetFlags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
      }
      samples.push({
        targetId: subscription.targetId,
        slotId: subscription.slotId,
        payloadKind: 'scalar',
        stride: 1,
        laneCount: 1,
        sampleFlags: finite ? DEBUG_SAMPLE_FLAG_FRESH : DEBUG_SAMPLE_FLAG_NAN_DETECTED,
        values: [value],
      });
      continue;
    }

    const laneStart = subscription.laneWindow?.start ?? 0;
    const laneCount = subscription.laneWindow?.count ?? slot.descriptor.laneCount;
    if (laneStart < 0 || laneCount < 1 || laneStart + laneCount > slot.descriptor.laneCount) {
      packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
      continue;
    }
    const decoded = arenaDecodeToAoS(slot.values, slot.descriptor);
    const startOffset = laneStart * slot.descriptor.stride;
    const endOffset = startOffset + laneCount * slot.descriptor.stride;
    const values = Array.from(decoded.subarray(startOffset, endOffset));
    const finite = values.every((value) => Number.isFinite(value));
    if (!finite) {
      packetFlags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
    }
    samples.push({
      targetId: subscription.targetId,
      slotId: subscription.slotId,
      payloadKind: 'lane_window',
      stride: slot.descriptor.stride,
      laneCount,
      sampleFlags: finite ? DEBUG_SAMPLE_FLAG_FRESH : DEBUG_SAMPLE_FLAG_NAN_DETECTED,
      values,
    });
  }

  return {
    packetFlags,
    samples,
  };
}

export interface SerializedDebugProbeRuntimeSlotSnapshot {
  readonly slotId: number;
  readonly descriptor: ArenaSlotDescriptor;
  readonly values: readonly number[];
}

export interface SerializedDebugProbeRuntimeSnapshot {
  readonly runtimeFrameId: number;
  readonly slots: readonly SerializedDebugProbeRuntimeSlotSnapshot[];
}

export function serializeDebugProbeRuntimeSnapshot(
  snapshot: DebugProbeRuntimeSnapshot,
): SerializedDebugProbeRuntimeSnapshot {
  return {
    runtimeFrameId: snapshot.runtimeFrameId,
    // [LAW:locality-or-seam] The Rust boundary consumes one explicit snapshot
    // contract so transport evolution stays localized to this seam.
    slots: snapshot.slots.map((slot) => ({
      slotId: slot.slotId as number,
      descriptor: slot.descriptor,
      values: Array.from(slot.values),
    })),
  };
}
