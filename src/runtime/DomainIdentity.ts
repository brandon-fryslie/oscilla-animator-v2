/**
 * Domain Identity Module
 *
 * Generates and manages stable element IDs for domain instances.
 * Per spec topics/11-continuity-system.md §3.1-3.2:
 * - elementIds are stable across edits that preserve the conceptual element set
 * - Both shapes and array blocks are domain identity sources
 *
 * @module runtime/DomainIdentity
 */

import type { DomainInstance } from '../compiler/ir/types';

const EMPTY_ELEMENT_IDS = new Uint32Array(0);
const stableElementIdCache = new Map<string, Uint32Array>();

/**
 * Generate deterministic element IDs for a domain (spec §3.2).
 * IDs are monotonic integers starting from seed.
 *
 * When user changes domain count:
 * - Existing IDs persist where possible
 * - New IDs are allocated deterministically (seeded counter stream)
 *
 * @param count - Number of elements
 * @param seed - Starting ID (default 0)
 * @returns Uint32Array of stable element IDs
 */
export function generateElementIds(
  count: number,
  seed: number = 0
): Uint32Array {
  const cacheKey = String(seed) + ':' + String(count);
  const cached = stableElementIdCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = seed + i;
  }
  // [LAW:one-source-of-truth] Stable identity vectors are memoized in one
  // module-owned cache so deterministic domains reuse the same backing IDs.
  stableElementIdCache.set(cacheKey, ids);
  return ids;
}

/**
 * Create a DomainInstance with stable identity (spec §3.1).
 *
 * Domains that claim identityMode="stable" MUST emit deterministic
 * elementId given domain parameters, seed, and (if stateful) their own
 * preserved state.
 *
 * @param count - Number of elements
 * @param seed - Starting ID for element IDs (default 0)
 * @param posHintXY - Optional spatial hints for fallback position-based mapping
 * @returns DomainInstance with stable identity
 */
export function createStableDomainInstance(
  count: number,
  seed: number = 0,
  posHintXY?: Float32Array
): DomainInstance {
  return {
    count,
    elementId: generateElementIds(count, seed),
    identityMode: 'stable',
    posHintXY,
  };
}

/**
 * Create a DomainInstance without identity tracking.
 * Continuity will fall back to crossfade (spec §3.7).
 *
 * If identityMode="none", the system MUST NOT attempt per-element
 * projection; it must use crossfade.
 *
 * @param count - Number of elements
 * @returns DomainInstance without identity tracking
 */
export function createUnstableDomainInstance(
  count: number
): DomainInstance {
  return {
    count,
    elementId: EMPTY_ELEMENT_IDS, // Empty - no identity
    identityMode: 'none',
  };
}

export function shouldRebuildDomainInstance(
  previousDomain: DomainInstance | undefined,
  count: number,
  identityMode: DomainInstance['identityMode'],
  seed: number,
): boolean {
  if (!previousDomain) {
    return true;
  }
  if (previousDomain.count !== count) {
    return true;
  }
  if (previousDomain.identityMode !== identityMode) {
    return true;
  }
  if (identityMode === 'stable') {
    if (count === 0) {
      return false;
    }
    return previousDomain.elementId[0] !== seed;
  }
  return false;
}

/**
 * Extend element IDs when count increases.
 * Preserves existing IDs and allocates new ones deterministically.
 *
 * @param existing - Existing element IDs
 * @param newCount - New element count
 * @param seed - Seed for new element IDs (typically existing.length + existingSeed)
 * @returns Extended Uint32Array with new IDs appended
 */
export function extendElementIds(
  existing: Uint32Array,
  newCount: number,
  seed?: number
): Uint32Array {
  if (newCount <= existing.length) {
    // Shrink: just return slice (IDs stay stable)
    return existing.slice(0, newCount);
  }

  // Grow: copy existing and append new
  const extended = new Uint32Array(newCount);
  extended.set(existing);

  const startSeed = seed ?? existing.length;
  for (let i = existing.length; i < newCount; i++) {
    extended[i] = startSeed + (i - existing.length);
  }

  return extended;
}
