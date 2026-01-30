/**
 * Signal Expression Types
 *
 * Additional types for signal and event expressions.
 */

import { payloadStride as corePayloadStride, type PayloadType, type ConcretePayloadType } from '../../core/canonical-types';

export type Stride = 0 | 1 | 2 | 3 | 4 | 8;

function assertNever(x: never, msg: string): never {
  throw new Error(msg);
}

/**
 * Canonical mapping: payload -> component stride.
 *
 * This is used by slot allocation, debug sampling, and any code that needs
 * to reason about multi-component signal payloads.
 *
 * Note: PayloadType is now always concrete (no vars), so we can use it directly.
 */
export function payloadStride(payload: PayloadType): Stride {
  return corePayloadStride(payload) as Stride;
}

/** True iff this payload can be sampled into numeric components. */
export function isSampleablePayload(payload: PayloadType): boolean {
  return payloadStride(payload) !== 0;
}

/**
 * Event combine mode for combining multiple event streams.
 */
export type EventCombineMode = 'merge' | 'last';
