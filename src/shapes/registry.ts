/**
 * Topology Registry
 *
 * Provides lookup for topology definitions by ID.
 * Registry is immutable and populated at module load time.
 */

import type { TopologyId, TopologyDef } from './types';
import { TOPOLOGY_ELLIPSE, TOPOLOGY_RECT } from './topologies';

/**
 * Registry of all available topologies
 *
 * Immutable map of TopologyId → TopologyDef
 */
const TOPOLOGY_REGISTRY: ReadonlyMap<TopologyId, TopologyDef> = new Map([
  [TOPOLOGY_ELLIPSE.id, TOPOLOGY_ELLIPSE],
  [TOPOLOGY_RECT.id, TOPOLOGY_RECT],
]);

/**
 * Get a topology definition by ID
 *
 * @param id - Topology ID
 * @returns TopologyDef for the given ID
 * @throws Error if topology ID is not found
 */
export function getTopology(id: TopologyId): TopologyDef {
  const topology = TOPOLOGY_REGISTRY.get(id);
  if (!topology) {
    throw new Error(`Unknown topology ID: ${id}`);
  }
  return topology;
}

/**
 * Check if a topology ID is registered
 *
 * @param id - Topology ID to check
 * @returns true if registered, false otherwise
 */
export function hasTopology(id: TopologyId): boolean {
  return TOPOLOGY_REGISTRY.has(id);
}

/**
 * Get all registered topology IDs
 *
 * @returns Array of all registered topology IDs
 */
export function getAllTopologyIds(): readonly TopologyId[] {
  return Array.from(TOPOLOGY_REGISTRY.keys());
}
