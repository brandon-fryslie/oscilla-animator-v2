/**
 * Signal Expression Types
 *
 * Additional types for signal and event expressions.
 */

import type { PayloadType } from './types';

export type Stride = 0 | 1 | 2 | 3 | 4;

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
  switch (payload) {
    case 'float':
    case 'int':
    case 'phase':
    case 'unit':
    case 'bool':
      return 1;
    case 'vec2':
      return 2;
    case 'vec3':
      return 3;
    case 'color':
      return 4;
    case 'shape':
      return 0;
    default:
      return assertNever(payload as never, `Unhandled payload in payloadStride(): ${String(payload)}`);
  }
}

/** True iff this payload can be sampled into numeric components. */
export function isSampleablePayload(payload: PayloadType): boolean {
  return payloadStride(payload) !== 0;
}

/**
 * Event combine mode for combining multiple event streams.
 */
export type EventCombineMode = 'merge' | 'last';
