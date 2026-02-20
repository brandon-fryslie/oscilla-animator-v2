/**
 * Storage Class Derivation
 *
 * [LAW:one-source-of-truth] Single decision point for storage class + stride.
 * All consumers that need to know whether a slot is f64 or object
 * call deriveStorageLayout() — no parallel derivation allowed.
 */

import type { CanonicalType } from '../../core/canonical-types';
import type { SlotMetaEntry } from './program';
import { requireInst, isMany, payloadStride } from '../../core/canonical-types';

export interface StorageLayout {
  readonly storage: SlotMetaEntry['storage'];
  readonly stride: number;
}

/**
 * Derive physical storage class and stride from a fully-instantiated CanonicalType.
 *
 * many cardinality → object storage, stride 1
 * one/zero cardinality → f64 storage, stride from payloadStride()
 *
 * @param type - Fully instantiated CanonicalType (no vars — throws if var)
 * @param overrideStride - Optional stride override (e.g. from IRBuilder registration)
 */
export function deriveStorageLayout(
  type: CanonicalType,
  overrideStride?: number,
): StorageLayout {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  const storage: SlotMetaEntry['storage'] = isMany(card) ? 'object' : 'f64';
  // [LAW:one-source-of-truth] Object slots store a single buffer reference (stride 1).
  // Scalar slots derive stride from payload unless explicitly overridden.
  const stride = storage === 'object'
    ? 1
    : (overrideStride ?? payloadStride(type.payload));
  return { storage, stride };
}
