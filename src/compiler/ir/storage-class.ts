/**
 * Storage Class Derivation
 *
 * [LAW:one-source-of-truth] Single decision point for storage class + stride.
 * All consumers that need canonical storage class/stride metadata call
 * deriveStorageLayout() — no parallel derivation allowed.
 */

import type { CanonicalType } from '../../core/canonical-types';
import type {
  SlotMetaEntry,
  ArenaZoneAlignmentPolicyIR,
  ArenaZoneRangeIR,
  ArenaZonesIR,
  ArenaRuntimeLayoutIR,
  ArenaGaugeTargetLayoutIR,
} from './program';
import type { ArenaPacking, ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';
import type { InstanceId, ValueSlot } from './Indices';
import type { InstanceDecl } from './types';
import { requireInst, isMany, payloadStride } from '../../core/canonical-types';

export interface StorageLayout {
  readonly storage: SlotMetaEntry['storage'];
  readonly stride: number;
}

/**
 * Derive physical storage class and stride from a fully-instantiated CanonicalType.
 *
 * Canonical runtime storage is numeric `f32` with payload-derived stride.
 *
 * @param type - Fully instantiated CanonicalType (no vars — throws if var)
 * @param overrideStride - Optional stride override (e.g. from IRBuilder registration)
 */
export function deriveStorageLayout(
  type: CanonicalType,
  overrideStride?: number,
): StorageLayout {
  // Enforce fully instantiated canonical types at the storage boundary.
  requireInst(type.extent.cardinality, 'cardinality');
  // [LAW:one-source-of-truth] Slot metadata reflects canonical arena numeric ABI.
  // Cardinality affects lane count (deriveArenaDescriptor), never storage class.
  const storage: SlotMetaEntry['storage'] = 'f32';
  const stride = overrideStride ?? payloadStride(type.payload);
  return { storage, stride };
}

// =============================================================================
// Arena Descriptor Derivation
// =============================================================================

/**
 * Resolve instance count from a many-cardinality value.
 * For static counts returns count directly; for dynamic returns maxCount.
 */
function resolveInstanceCount(
  instanceId: InstanceId,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
): number {
  const decl = instances.get(instanceId);
  if (!decl) throw new Error(`Unknown instance ${instanceId}`);
  return typeof decl.count === 'number' ? decl.count : decl.maxCount;
}

/**
 * Derive an ArenaSlotDescriptor for a slot.
 *
 * The arena stores floats for all numeric slots.
 * many-cardinality slots get laneCount from InstanceDecl rather than stride=1.
 *
 * [LAW:one-source-of-truth] Arena stride is always payloadStride(payload),
 * arena laneCount is always from cardinality. No parallel derivation.
 *
 * @param type - Fully instantiated CanonicalType
 * @param arenaOffset - Current bump-allocation offset
 * @param instances - Instance declarations for resolving many-cardinality counts
 * @param overrideStride - Optional stride override (from IRBuilder slot registration)
 */
export function deriveArenaDescriptor(
  type: CanonicalType,
  arenaOffset: number,
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  overrideStride?: number,
  packingPreference?: ArenaPacking,
): ArenaSlotDescriptor {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  const stride = overrideStride ?? payloadStride(type.payload);
  const laneCount = isMany(card)
    ? resolveInstanceCount(card.instance.instanceId, instances)
    : 1;
  const length = stride * laneCount;
  const packing = packingPreference ?? 'soa';
  const laneStride = packing === 'soa' ? 1 : stride;
  const componentStride = packing === 'soa' ? laneCount : 1;
  // [LAW:one-source-of-truth] Canonical descriptor carries explicit packing
  // metadata, defaulting to SoA unless a caller requests AoS.
  return {
    offset: arenaOffset,
    stride,
    laneCount,
    length,
    packing,
    laneStride,
    componentStride,
  };
}

// =============================================================================
// Arena Zone Plan Derivation
// =============================================================================

export interface ArenaSlotPlanInput {
  readonly slot: ValueSlot;
  readonly type: CanonicalType;
  readonly overrideStride?: number;
  readonly packingPreference?: ArenaPacking;
}

/**
 * Canonical alignment policy for arena zone planning.
 *
 * - 64 floats = 256 bytes header reservation.
 * - 64-float alignment at scalar->field transition.
 */
export const DEFAULT_ARENA_ALIGNMENT_POLICY: ArenaZoneAlignmentPolicyIR = {
  headerFloats: 64,
  scalarToFieldAlignFloats: 64,
};

export interface ArenaZonePlan {
  readonly totalFloats: number;
  readonly zones: readonly ArenaZoneRangeIR[];
  readonly alignment: ArenaZoneAlignmentPolicyIR;
  readonly runtimeLayout: ArenaRuntimeLayoutIR;
  slotDescriptor(slot: ValueSlot): ArenaSlotDescriptor;
  slotOffset(slot: ValueSlot): number;
  toIR(): ArenaZonesIR;
}

export interface ArenaGaugeTargetPlanInput {
  readonly targetId: string;
  readonly instanceId: string;
  readonly slot: ValueSlot;
}

export interface ArenaZonePlanOptions {
  /** Floats per persistent state bank (read/write). */
  readonly stateBankLength?: number;
  /** Number of logical state mappings (for diagnostics/metadata only). */
  readonly stateEntryCount?: number;
  /** Continuity targets that own gauge segments in zone 5. */
  readonly gaugeTargets?: readonly ArenaGaugeTargetPlanInput[];
}

function alignUp(value: number, alignment: number): number {
  if (alignment <= 1) return value;
  const remainder = value % alignment;
  if (remainder === 0) return value;
  return value + (alignment - remainder);
}

function normalizeAlignmentCount(value: number, min: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(Math.max(min, value));
}

function classifySlotZone(type: CanonicalType): 'scalar' | 'field' {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  return isMany(card) ? 'field' : 'scalar';
}

function makeZone(
  kind: ArenaZoneRangeIR['kind'],
  start: number,
  end: number,
  slotCount: number,
  alignmentFloats: number,
): ArenaZoneRangeIR {
  return {
    kind,
    start,
    end,
    length: Math.max(0, end - start),
    slotCount,
    alignmentFloats,
  };
}

/**
 * Derive compiler-owned arena zone boundaries + per-slot descriptors.
 *
 * [LAW:one-source-of-truth] Zone ownership and aligned offsets are computed once
 * by the compiler and consumed downstream as emitted metadata.
 */
export function deriveArenaZonePlan(
  slots: readonly ArenaSlotPlanInput[],
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  alignment: ArenaZoneAlignmentPolicyIR = DEFAULT_ARENA_ALIGNMENT_POLICY,
  options: ArenaZonePlanOptions = {},
): ArenaZonePlan {
  const normalizedAlignment: ArenaZoneAlignmentPolicyIR = {
    headerFloats: normalizeAlignmentCount(
      alignment.headerFloats,
      0,
      DEFAULT_ARENA_ALIGNMENT_POLICY.headerFloats,
    ),
    scalarToFieldAlignFloats: normalizeAlignmentCount(
      alignment.scalarToFieldAlignFloats,
      1,
      DEFAULT_ARENA_ALIGNMENT_POLICY.scalarToFieldAlignFloats,
    ),
  };

  const scalarSlots: ArenaSlotPlanInput[] = [];
  const fieldSlots: ArenaSlotPlanInput[] = [];
  for (const slot of slots) {
    if (classifySlotZone(slot.type) === 'field') {
      fieldSlots.push(slot);
    } else {
      scalarSlots.push(slot);
    }
  }

  const descriptors = new Map<ValueSlot, ArenaSlotDescriptor>();
  const zones: ArenaZoneRangeIR[] = [];
  const gaugeTargetLayouts: ArenaGaugeTargetLayoutIR[] = [];

  const normalizedStateBankLength = normalizeAlignmentCount(options.stateBankLength ?? 0, 0, 0);
  const normalizedStateEntryCount = normalizeAlignmentCount(options.stateEntryCount ?? 0, 0, 0);
  const gaugeTargets = options.gaugeTargets ?? [];

  const headerStart = 0;
  const headerEnd = headerStart + normalizedAlignment.headerFloats;
  zones.push(makeZone('header', headerStart, headerEnd, 0, normalizedAlignment.headerFloats));

  let cursor = headerEnd;
  const scalarStart = cursor;
  for (const slot of scalarSlots) {
    const descriptor = deriveArenaDescriptor(
      slot.type,
      cursor,
      instances,
      slot.overrideStride,
      slot.packingPreference,
    );
    descriptors.set(slot.slot, descriptor);
    cursor += descriptor.length;
  }
  const scalarDataEnd = cursor;
  const fieldStart =
    fieldSlots.length > 0
      ? alignUp(scalarDataEnd, normalizedAlignment.scalarToFieldAlignFloats)
      : scalarDataEnd;
  zones.push(
    makeZone(
      'scalar',
      scalarStart,
      fieldStart,
      scalarSlots.length,
      normalizedAlignment.scalarToFieldAlignFloats,
    ),
  );

  cursor = fieldStart;
  const fieldZoneStart = cursor;
  for (const slot of fieldSlots) {
    const descriptor = deriveArenaDescriptor(
      slot.type,
      cursor,
      instances,
      slot.overrideStride,
      slot.packingPreference,
    );
    descriptors.set(slot.slot, descriptor);
    cursor += descriptor.length;
  }
  const fieldEnd = cursor;
  zones.push(
    makeZone(
      'field',
      fieldZoneStart,
      fieldEnd,
      fieldSlots.length,
      normalizedAlignment.scalarToFieldAlignFloats,
    ),
  );

  // [LAW:one-source-of-truth] State bank offsets are emitted once by compiler
  // zone planning and consumed by runtime state constructors.
  const stateStart = fieldEnd;
  const stateEnd = stateStart + normalizedStateBankLength * 2;
  const stateRuntimeLayout = {
    offset: stateStart,
    length: stateEnd - stateStart,
    bankLength: normalizedStateBankLength,
    readOffset: stateStart,
    writeOffset: stateStart + normalizedStateBankLength,
  };
  const seenGaugeTargetIds = new Set<string>();
  let gaugeCursor = stateEnd;
  for (const target of gaugeTargets) {
    if (seenGaugeTargetIds.has(target.targetId)) {
      continue;
    }
    seenGaugeTargetIds.add(target.targetId);
    const source = descriptors.get(target.slot);
    if (!source) {
      throw new Error(
        `deriveArenaZonePlan: gauge target ${target.targetId} references missing slot ${target.slot}`,
      );
    }
    const descriptor: ArenaSlotDescriptor = {
      ...source,
      offset: gaugeCursor,
    };
    gaugeTargetLayouts.push({
      targetId: target.targetId,
      instanceId: target.instanceId,
      descriptor,
    });
    gaugeCursor += descriptor.length;
  }
  const gaugeStart = stateEnd;
  const gaugeEnd = gaugeCursor;
  zones.push(makeZone('state', stateStart, stateEnd, normalizedStateEntryCount, 1));
  zones.push(makeZone('gauge', gaugeStart, gaugeEnd, gaugeTargetLayouts.length, 1));

  const toIR = (): ArenaZonesIR => ({
    alignment: normalizedAlignment,
    zones,
    totalFloats: gaugeEnd,
  });

  return {
    totalFloats: gaugeEnd,
    zones,
    alignment: normalizedAlignment,
    runtimeLayout: {
      stateBank: stateRuntimeLayout,
      gaugeTargets: gaugeTargetLayouts,
    },
    slotDescriptor(slot: ValueSlot): ArenaSlotDescriptor {
      const descriptor = descriptors.get(slot);
      if (!descriptor) {
        throw new Error(`deriveArenaZonePlan: missing descriptor for slot ${slot}`);
      }
      return descriptor;
    },
    slotOffset(slot: ValueSlot): number {
      return this.slotDescriptor(slot).offset;
    },
    toIR,
  };
}
