/**
 * Signal Expression Types
 *
 * Additional types for signal and event expressions.
 */

import { payloadStride,  type PayloadType, type ConcretePayloadType, isPayloadVar } from '../../core/canonical-types';

export type Stride = 0 | 1 | 2 | 3 | 4 | 8;

function assertNever(x: never, msg: string): never {
  throw new Error(msg);
}

/**
 * Canonical mapping: payload -> component stride.
 *
 * This is used by slot allocation, debug sampling, and any code that needs
 * to reason about multi-component signal payloads.
 */
export function payloadStride(payload: PayloadType): Stride {
  if (isPayloadVar(payload)) {
    // Payload variables should be resolved before this point
    throw new Error(`Cannot get stride for unresolved payload variable: ${payload.id}`);
  }

  // After the guard, payload is guaranteed to be a ConcretePayloadType
  // Stride is now baked into the type, so we can just return it directly!
  const concretePayload = payload as ConcretePayloadType;
  return payloadStride(concretePayload) as Stride;
}

/** True iff this payload can be sampled into numeric components. */
export function isSampleablePayload(payload: PayloadType): boolean {
  return payloadStride(payload) !== 0;
}

/**
 * Event combine mode for combining multiple event streams.
 */
export type EventCombineMode = 'merge' | 'last';
