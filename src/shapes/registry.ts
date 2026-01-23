/**
 * Topology Registry
 *
 * Provides O(1) array-indexed lookup for topology definitions.
 * Registry is populated at module load time with built-in topologies
 * and can be extended at compile-time with dynamically created topologies (paths).
 *
 * ID Allocation:
 * - Built-in topologies: IDs 0-99 (reserved)
 * - Dynamic topologies: IDs 100+ (auto-assigned)
 */

import type { TopologyId, TopologyDef, PathTopologyDef } from './types';

/**
 * Registry of all available topologies (array-indexed by TopologyId)
 *
 * Sparse array where TOPOLOGY_REGISTRY[id] = TopologyDef.
 * Built-in topologies are registered at module load.
 * Dynamic topologies (e.g., paths) are registered during compilation.
 */
const TOPOLOGY_REGISTRY: TopologyDef[] = [];

/**
 * Debug mapping from topology name to numeric ID
 *
 * Used for debugging, error messages, and testing.
 * NOT used in hot paths - use numeric ID directly.
 */
const TOPOLOGY_BY_NAME: Map<string, TopologyId> = new Map();

/**
 * Reserved numeric IDs for built-in topologies
 */
export const TOPOLOGY_ID_ELLIPSE = 0;
export const TOPOLOGY_ID_RECT = 1;

/**
 * Dynamic topology ID allocation
 *
 * Dynamic topologies start at 100 to leave room for future built-ins.
 */
const NEXT_DYNAMIC_ID_START = 100;
let nextDynamicId = NEXT_DYNAMIC_ID_START;

/**
 * Get a topology definition by numeric ID (O(1) array access)
 *
 * @param id - Topology ID (array index)
 * @returns TopologyDef for the given ID
 * @throws Error if topology ID is not found or out of bounds
 */
export function getTopology(id: TopologyId): TopologyDef {
  if (id < 0 || id >= TOPOLOGY_REGISTRY.length) {
    throw new Error(`Unknown topology ID: ${id} (out of bounds)`);
  }
  const topology = TOPOLOGY_REGISTRY[id];
  if (!topology) {
    throw new Error(`Unknown topology ID: ${id} (not registered)`);
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
  return id >= 0 && id < TOPOLOGY_REGISTRY.length && TOPOLOGY_REGISTRY[id] !== undefined;
}

/**
 * Get all registered topology IDs
 *
 * @returns Array of all registered topology IDs (may be sparse)
 */
export function getAllTopologyIds(): readonly TopologyId[] {
  return TOPOLOGY_REGISTRY
    .map((_, idx) => idx)
    .filter(idx => TOPOLOGY_REGISTRY[idx] !== undefined);
}

/**
 * Register a dynamic topology (e.g., path topologies created by blocks)
 *
 * This is called during block lowering to register procedurally-created topologies.
 * Assigns a new numeric ID and returns it to the caller.
 *
 * @param topology - Topology definition WITHOUT id field (id will be assigned)
 * @param debugName - Optional name for debugging/error messages
 * @returns Assigned numeric TopologyId
 */
export function registerDynamicTopology(
  topology: Omit<TopologyDef | PathTopologyDef, 'id'>,
  debugName?: string
): TopologyId {
  const id = nextDynamicId++;
  const fullTopology = { ...topology, id } as TopologyDef | PathTopologyDef;
  TOPOLOGY_REGISTRY[id] = fullTopology;
  if (debugName) {
    TOPOLOGY_BY_NAME.set(debugName, id);
  }
  return id;
}

/**
 * Get topology ID by debug name (for testing/debugging only)
 *
 * @param name - Debug name used during registration
 * @returns TopologyId if found, undefined otherwise
 */
export function getTopologyIdByName(name: string): TopologyId | undefined {
  return TOPOLOGY_BY_NAME.get(name);
}

/**
 * Initialize built-in topologies at module load time
 *
 * Must be called AFTER topologies are defined but BEFORE any code uses the registry.
 */
function initializeBuiltinTopologies(ellipse: TopologyDef, rect: TopologyDef): void {
  // Pre-assign reserved IDs
  TOPOLOGY_REGISTRY[TOPOLOGY_ID_ELLIPSE] = { ...ellipse, id: TOPOLOGY_ID_ELLIPSE };
  TOPOLOGY_REGISTRY[TOPOLOGY_ID_RECT] = { ...rect, id: TOPOLOGY_ID_RECT };

  // Register debug names
  TOPOLOGY_BY_NAME.set('ellipse', TOPOLOGY_ID_ELLIPSE);
  TOPOLOGY_BY_NAME.set('rect', TOPOLOGY_ID_RECT);
}

// Import built-in topologies and initialize registry
// Note: Import is at bottom to avoid circular dependency issues
import { TOPOLOGY_ELLIPSE, TOPOLOGY_RECT } from './topologies';
initializeBuiltinTopologies(TOPOLOGY_ELLIPSE, TOPOLOGY_RECT);
