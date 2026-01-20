/**
 * Topology Registry
 *
 * Provides lookup for topology definitions by ID.
 * Registry is populated at module load time with built-in topologies
 * and can be extended at compile-time with dynamically created topologies (paths).
 */

import type { TopologyId, TopologyDef, PathTopologyDef } from './types';
import { TOPOLOGY_ELLIPSE, TOPOLOGY_RECT } from './topologies';

/**
 * Registry of all available topologies
 *
 * Mutable map of TopologyId → TopologyDef.
 * Built-in topologies are registered at module load.
 * Dynamic topologies (e.g., paths) are registered during compilation.
 */
const TOPOLOGY_REGISTRY: Map<TopologyId, TopologyDef> = new Map([
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

/**
 * Register a dynamic topology (e.g., path topologies created by blocks)
 *
 * This is called during block lowering to register procedurally-created topologies.
 * If a topology with the same ID already exists, it will be replaced (idempotent).
 *
 * @param topology - Topology definition to register
 */
export function registerDynamicTopology(topology: TopologyDef | PathTopologyDef): void {
  TOPOLOGY_REGISTRY.set(topology.id, topology);
}
