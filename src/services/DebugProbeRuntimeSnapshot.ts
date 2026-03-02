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

function getSelectedComponentIndices(stride: number, componentMask: number): number[] {
  if (stride < 1 || stride > 32) {
    return [];
  }
  const normalizedMask = componentMask >>> 0;
  const selected: number[] = [];
  for (let component = 0; component < stride; component += 1) {
    if ((normalizedMask & (1 << component)) !== 0) {
      selected.push(component);
    }
  }
  return selected;
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
      const selectedComponents = getSelectedComponentIndices(slot.descriptor.stride, subscription.componentMask);
      if (selectedComponents.length !== 1) {
        packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
        continue;
      }
      const value = arenaRead(slot.values, slot.descriptor, 0, selectedComponents[0]!);
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
    const selectedComponents = getSelectedComponentIndices(slot.descriptor.stride, subscription.componentMask);
    if (selectedComponents.length < 1) {
      packetFlags |= DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID;
      continue;
    }
    const decoded = arenaDecodeToAoS(slot.values, slot.descriptor);
    const values: number[] = [];
    for (let lane = laneStart; lane < laneStart + laneCount; lane += 1) {
      const laneBase = lane * slot.descriptor.stride;
      for (const component of selectedComponents) {
        values.push(decoded[laneBase + component]!);
      }
    }
    const finite = values.every((value) => Number.isFinite(value));
    if (!finite) {
      packetFlags |= DEBUG_PACKET_FLAG_NAN_DETECTED_ANY;
    }
    samples.push({
      targetId: subscription.targetId,
      slotId: subscription.slotId,
      payloadKind: 'lane_window',
      stride: selectedComponents.length,
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
  readonly values: Float32Array;
}

export interface SerializedDebugProbeRuntimeSnapshot {
  readonly runtimeFrameId: number;
  readonly slots: readonly SerializedDebugProbeRuntimeSlotSnapshot[];
}

export interface PackedDebugProbeRuntimeSnapshot {
  readonly runtimeFrameId: number;
  /**
   * Fixed-width slot metadata records.
   * [slotId, stride, laneCount, length, packingTag, laneStride, componentStride, componentOffsetsStart, componentOffsetsLen, valuesStart]
   */
  readonly slotMeta: Uint32Array;
  readonly componentOffsets: Uint32Array;
  readonly slotValues: Float32Array;
}

export const DEBUG_PROBE_SLOT_META_WORDS = 10;

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
      values: slot.values,
    })),
  };
}

export function packDebugProbeRuntimeSnapshot(
  snapshot: SerializedDebugProbeRuntimeSnapshot,
): PackedDebugProbeRuntimeSnapshot {
  const slotCount = snapshot.slots.length;
  let totalComponentOffsets = 0;
  let totalSlotValues = 0;

  for (const slot of snapshot.slots) {
    const descriptor = slot.descriptor;
    const values = slot.values;
    // [LAW:verifiable-goals] The packed ABI is deterministic only when slot
    // descriptors and slot-local values agree on length.
    if (values.length !== descriptor.length) {
      throw new Error(
        `packDebugProbeRuntimeSnapshot: slot ${slot.slotId} value length mismatch (values=${values.length}, descriptor=${descriptor.length})`,
      );
    }
    totalComponentOffsets += descriptor.componentOffsets?.length ?? 0;
    totalSlotValues += values.length;
  }

  const slotMeta = new Uint32Array(slotCount * DEBUG_PROBE_SLOT_META_WORDS);
  const componentOffsets = new Uint32Array(totalComponentOffsets);
  const slotValues = new Float32Array(totalSlotValues);

  let componentOffsetsCursor = 0;
  let slotValuesCursor = 0;
  let slotMetaCursor = 0;

  for (const slot of snapshot.slots) {
    const descriptor = slot.descriptor;
    const values = slot.values;
    const packingTag = descriptor.packing === 'aos' ? 1 : 0;
    const laneStride = descriptor.laneStride ?? (descriptor.packing === 'aos' ? descriptor.stride : 1);
    const componentStride = descriptor.componentStride ?? (descriptor.packing === 'aos' ? 1 : descriptor.laneCount);
    const componentOffsetsStart = componentOffsetsCursor;
    const componentOffsetsLen = descriptor.componentOffsets?.length ?? 0;
    const valuesStart = slotValuesCursor;

    if (descriptor.componentOffsets && descriptor.componentOffsets.length > 0) {
      componentOffsets.set(descriptor.componentOffsets, componentOffsetsCursor);
      componentOffsetsCursor += descriptor.componentOffsets.length;
    }
    slotValues.set(values, slotValuesCursor);
    slotValuesCursor += values.length;

    slotMeta[slotMetaCursor + 0] = slot.slotId;
    slotMeta[slotMetaCursor + 1] = descriptor.stride;
    slotMeta[slotMetaCursor + 2] = descriptor.laneCount;
    slotMeta[slotMetaCursor + 3] = descriptor.length;
    slotMeta[slotMetaCursor + 4] = packingTag;
    slotMeta[slotMetaCursor + 5] = laneStride;
    slotMeta[slotMetaCursor + 6] = componentStride;
    slotMeta[slotMetaCursor + 7] = componentOffsetsStart;
    slotMeta[slotMetaCursor + 8] = componentOffsetsLen;
    slotMeta[slotMetaCursor + 9] = valuesStart;
    slotMetaCursor += DEBUG_PROBE_SLOT_META_WORDS;
  }

  return {
    runtimeFrameId: snapshot.runtimeFrameId,
    slotMeta,
    componentOffsets,
    slotValues,
  };
}
