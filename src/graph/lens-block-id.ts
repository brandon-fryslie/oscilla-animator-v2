/**
 * Deterministic lens block identifiers used by frontend normalization.
 *
 * // [LAW:one-source-of-truth] Derived lens block ID format is defined once and reused.
 */

import type { BlockId } from '../types';

/**
 * Compute the derived lens block ID used by normalize-adapters.
 * Format: `_lens_{portId}_{lensId}`
 */
export function derivedLensBlockId(portId: string, lensId: string): BlockId {
  return `_lens_${portId}_${lensId}` as BlockId;
}

/**
 * Compute constant-patcher key for a derived lens parameter port.
 * Format: `{derivedLensBlockId}:{paramId}`
 */
export function derivedLensParamKey(portId: string, lensId: string, paramId: string): string {
  return `${derivedLensBlockId(portId, lensId)}:${paramId}`;
}

