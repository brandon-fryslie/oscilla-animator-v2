/**
 * Storage Class Derivation
 *
 * [LAW:one-source-of-truth] Single decision point for storage class + stride.
 * All consumers that need to know whether a slot is canonical numeric or object
 * call deriveStorageLayout() — no parallel derivation allowed.
 */

import type { CanonicalType } from '../../core/canonical-types';
import type { SlotMetaEntry } from './program';
import type { ArenaPacking, ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';
import type { InstanceId } from './Indices';
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
 * Unlike deriveStorageLayout (which models the old dual-store — object for many,
 * f64 for scalars), the arena stores actual floats for ALL numeric slots.
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
  const packing = packingPreference ?? 'aos';
  const laneStride = packing === 'soa' ? 1 : stride;
  const componentStride = packing === 'soa' ? laneCount : 1;
  // [LAW:one-source-of-truth] Canonical descriptor carries explicit packing
  // metadata even while execution is still AoS-backed during W1/W14 migration.
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
