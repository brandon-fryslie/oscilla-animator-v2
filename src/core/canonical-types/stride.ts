/**
 * Stride — Derived from Payload (Resolution Q7)
 *
 * payloadStride() is the SINGLE AUTHORITY for stride.
 * Stride is derived, never stored.
 */

import type { PayloadType, ConcretePayloadType } from './payloads';

// =============================================================================
// Stride
// =============================================================================

/**
 * Get payload stride (derived from payload only).
 * Per resolution Q7: This is the single authority for stride.
 * Per resolution Q4: Exhaustive switch with explicit case for every PayloadType kind.
 */
export function payloadStride(p: PayloadType): number {
  switch (p.kind) {
    case 'float': return 1;
    case 'int': return 1;
    case 'bool': return 1;
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    case 'cameraProjection': return 1;
    default: {
      const _exhaustive: never = p as never;
      throw new Error(`Unknown payload kind: ${(_exhaustive as ConcretePayloadType).kind}`);
    }
  }
}
