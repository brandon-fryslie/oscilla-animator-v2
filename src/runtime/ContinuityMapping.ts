/**
 * Continuity Mapping Module
 *
 * Implements the mapping algorithms from spec topics/11-continuity-system.md §3.3-3.5.
 * Computes how old elements map to new elements when domain changes.
 *
 * Key algorithms:
 * - byId: Primary mapping using stable elementIds (spec §3.4)
 * - byPosition: Fallback using spatial position hints (spec §3.5)
 *
 * Performance constraint: Mapping is computed ONLY when domain identity changed,
 * not every frame.
 *
 * @module runtime/ContinuityMapping
 */

import type { DomainInstance } from '../compiler/ir/types';
import type { MappingState } from './ContinuityState';

/**
 * Build element mapping using stable IDs (spec §3.4).
 *
 * Algorithm:
 * 1. Build hash map: oldId → oldIndex
 * 2. For each new element, look up its ID in old map
 * 3. Result: newToOld[i] = oldIndex, or -1 if new element
 *
 * @param oldDomain - Previous domain instance
 * @param newDomain - New domain instance
 * @returns Mapping state
 * @throws If either domain has identityMode='none'
 */
export function buildMappingById(
  oldDomain: DomainInstance,
  newDomain: DomainInstance
): MappingState {
  // Validate inputs
  if (oldDomain.identityMode !== 'stable' || newDomain.identityMode !== 'stable') {
    throw new Error('byId mapping requires stable identity mode');
  }

  // Fast path: identical domains
  if (
    oldDomain.count === newDomain.count &&
    arraysEqual(oldDomain.elementId, newDomain.elementId)
  ) {
    return { kind: 'identity', count: newDomain.count };
  }

  // Build hash map: oldId → oldIndex
  const oldIdMap = new Map<number, number>();
  for (let i = 0; i < oldDomain.count; i++) {
    oldIdMap.set(oldDomain.elementId[i], i);
  }

  // Compute newToOld mapping
  const newToOld = new Int32Array(newDomain.count);
  for (let i = 0; i < newDomain.count; i++) {
    const oldIdx = oldIdMap.get(newDomain.elementId[i]);
    newToOld[i] = oldIdx !== undefined ? oldIdx : -1;
  }

  return { kind: 'byId', newToOld };
}

/**
 * Build element mapping using spatial position hints (spec §3.5).
 * Fallback when stable IDs are not available.
 *
 * Uses nearest-neighbor search with bounded radius:
 * 1. Build spatial hash of old positions (optional future optimization)
 * 2. For each new element, find nearest old element within radius
 * 3. Mark found elements as used (no double-mapping)
 *
 * @param oldDomain - Previous domain instance (must have posHintXY)
 * @param newDomain - New domain instance (must have posHintXY)
 * @param maxSearchRadius - Maximum search radius (default 0.1)
 * @returns Mapping state
 * @throws If either domain lacks posHintXY
 */
export function buildMappingByPosition(
  oldDomain: DomainInstance,
  newDomain: DomainInstance,
  maxSearchRadius: number = 0.1
): MappingState {
  if (!oldDomain.posHintXY || !newDomain.posHintXY) {
    throw new Error('byPosition mapping requires posHintXY');
  }

  const newToOld = new Int32Array(newDomain.count);
  const usedOld = new Set<number>();
  const maxRadiusSq = maxSearchRadius * maxSearchRadius;

  // For each new element, find nearest old element
  for (let i = 0; i < newDomain.count; i++) {
    const newX = newDomain.posHintXY[i * 2];
    const newY = newDomain.posHintXY[i * 2 + 1];

    let bestOldIdx = -1;
    let bestDistSq = maxRadiusSq;

    for (let j = 0; j < oldDomain.count; j++) {
      if (usedOld.has(j)) continue;

      const oldX = oldDomain.posHintXY[j * 2];
      const oldY = oldDomain.posHintXY[j * 2 + 1];
      const dx = newX - oldX;
      const dy = newY - oldY;
      const distSq = dx * dx + dy * dy;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestOldIdx = j;
      }
    }

    newToOld[i] = bestOldIdx;
    if (bestOldIdx >= 0) {
      usedOld.add(bestOldIdx);
    }
  }

  return { kind: 'byPosition', newToOld };
}

/**
 * Detect domain changes and compute mapping.
 * Called at hot-swap boundary, not every frame (spec §5.1).
 *
 * @param instanceId - Instance ID
 * @param newDomain - New domain instance
 * @param prevDomains - Map of previous domain instances
 * @returns Change detection result with optional mapping
 */
export function detectDomainChange(
  instanceId: string,
  newDomain: DomainInstance,
  prevDomains: Map<string, DomainInstance>
): { changed: boolean; mapping: MappingState | null } {
  const oldDomain = prevDomains.get(instanceId);

  // First time seeing this domain
  if (!oldDomain) {
    return { changed: true, mapping: null };
  }

  // Check for identity (fast path)
  if (
    oldDomain.count === newDomain.count &&
    oldDomain.identityMode === 'stable' &&
    newDomain.identityMode === 'stable' &&
    arraysEqual(oldDomain.elementId, newDomain.elementId)
  ) {
    return {
      changed: false,
      mapping: { kind: 'identity', count: newDomain.count },
    };
  }

  // Compute appropriate mapping
  if (newDomain.identityMode === 'stable' && oldDomain.identityMode === 'stable') {
    const mapping = buildMappingById(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  if (newDomain.posHintXY && oldDomain.posHintXY) {
    const mapping = buildMappingByPosition(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  // No mapping possible - crossfade fallback
  return { changed: true, mapping: null };
}

/**
 * Count mapped and unmapped elements in a mapping.
 *
 * @param mapping - Mapping state
 * @returns Count of mapped and unmapped elements
 */
export function countMappedElements(
  mapping: MappingState
): { mapped: number; unmapped: number } {
  if (mapping.kind === 'identity') {
    return { mapped: mapping.count, unmapped: 0 };
  }

  let mapped = 0;
  let unmapped = 0;

  for (let i = 0; i < mapping.newToOld.length; i++) {
    if (mapping.newToOld[i] >= 0) {
      mapped++;
    } else {
      unmapped++;
    }
  }

  return { mapped, unmapped };
}

/**
 * Check if two Uint32Arrays are equal.
 */
function arraysEqual(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
