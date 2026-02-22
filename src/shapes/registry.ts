/**
 * Topology Registry
 *
 * Provides O(1) array-indexed lookup for topology definitions.
 * Registry is populated at compile-time with dynamically created topologies (paths).
 *
 * ID Allocation:
 * - Dynamic topologies: IDs 100+ (auto-assigned)
 */

import type { TopologyId, TopologyDef, PathTopologyDef, AbstractTopologyDef, PathSegmentKind } from './types';
import { PathVerb } from './types';

export type SerializableTopologyDef = Omit<TopologyDef, 'render'> & Partial<Pick<
  PathTopologyDef,
  'verbs' | 'pointsPerVerb' | 'totalControlPoints' | 'closed' | 'segmentKind' | 'segmentPointBase' | 'hasQuad' | 'hasCubic'
>>;

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
 * Structural interning map: canonical topology shape signature -> topology ID.
 *
 * Keeps topology IDs stable for structurally identical dynamic topologies.
 */
const TOPOLOGY_BY_SHAPE_SIGNATURE: Map<string, TopologyId> = new Map();

/**
 * Dynamic topology ID allocation
 *
 * Dynamic topologies start at 100 for stable separation from historical IDs.
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
 * Compute precomputed dispatch data for a PathTopologyDef (Sprint 1 WI-1)
 *
 * Computes:
 * - segmentKind: ['line' | 'cubic' | 'quad'] per segment (MOVE/CLOSE excluded)
 * - segmentPointBase: cumulative control point index where each segment starts
 * - hasQuad: true if any QUAD verb present
 * - hasCubic: true if any CUBIC verb present
 *
 * @param verbs - Path verbs
 * @returns Precomputed dispatch data
 */
function computePathDispatchData(verbs: readonly PathVerb[]): {
  segmentKind: PathSegmentKind[];
  segmentPointBase: number[];
  hasQuad: boolean;
  hasCubic: boolean;
} {
  const segmentKind: PathSegmentKind[] = [];
  const segmentPointBase: number[] = [];
  let hasQuad = false;
  let hasCubic = false;
  let pointIndex = 0;

  for (const verb of verbs) {
    if (verb === PathVerb.LINE) {
      segmentKind.push('line');
      segmentPointBase.push(pointIndex);
      pointIndex += 1; // LINE consumes 1 point
    } else if (verb === PathVerb.CUBIC) {
      segmentKind.push('cubic');
      segmentPointBase.push(pointIndex);
      hasCubic = true;
      pointIndex += 3; // CUBIC consumes 3 points
    } else if (verb === PathVerb.QUAD) {
      segmentKind.push('quad');
      segmentPointBase.push(pointIndex);
      hasQuad = true;
      pointIndex += 2; // QUAD consumes 2 points
    } else if (verb === PathVerb.MOVE) {
      // MOVE advances point index but doesn't create a segment
      pointIndex += 1;
    } else if (verb === PathVerb.CLOSE) {
      // CLOSE doesn't consume points or create a segment
    }
  }

  return { segmentKind, segmentPointBase, hasQuad, hasCubic };
}

/**
 * Register a dynamic topology (e.g., path topologies created by blocks)
 *
 * This is called during block lowering to register procedurally-created topologies.
 * Returns a stable numeric ID for the topology shape:
 * - Reuses existing ID for structurally identical topology definitions
 * - Allocates a new ID only for unseen topology shapes
 *
 * For PathTopologyDef, automatically computes precomputed dispatch data (Sprint 1 WI-1):
 * - segmentKind[], segmentPointBase[], hasQuad, hasCubic
 *
 * @param topology - Topology definition WITHOUT id field (id will be assigned)
 * @param debugName - Optional name for debugging/error messages
 * @returns Assigned numeric TopologyId
 */
export function registerDynamicTopology(
  topology: AbstractTopologyDef | Omit<PathTopologyDef, 'id'>,
  debugName?: string
): TopologyId {
  // Check if this is a PathTopologyDef (has 'verbs' field)
  // If so, compute precomputed dispatch data
  let shapeTopology: Omit<TopologyDef, 'id'>;
  if ('verbs' in topology) {
    const dispatchData = computePathDispatchData(topology.verbs);
    shapeTopology = { ...topology, ...dispatchData } as Omit<PathTopologyDef, 'id'>;
  } else {
    shapeTopology = { ...topology } as Omit<TopologyDef, 'id'>;
  }

  // [LAW:one-source-of-truth] Dynamic topology IDs are canonical per shape.
  const shapeSig = topologyShapeSignature(shapeTopology as Omit<SerializableTopologyDef, 'id'>);
  const existingId = TOPOLOGY_BY_SHAPE_SIGNATURE.get(shapeSig);
  if (existingId !== undefined) {
    if (debugName) {
      TOPOLOGY_BY_NAME.set(debugName, existingId);
    }
    return existingId;
  }

  const id = nextDynamicId++;
  const fullTopology = { ...shapeTopology, id } as TopologyDef;
  TOPOLOGY_REGISTRY[id] = fullTopology;
  TOPOLOGY_BY_SHAPE_SIGNATURE.set(shapeSig, id);
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

function toSerializableTopology(topology: TopologyDef): SerializableTopologyDef {
  const { render: _render, ...serializable } = topology as TopologyDef & { render?: TopologyDef['render'] };
  return serializable as SerializableTopologyDef;
}

function topologyShapeSignature(topology: Omit<SerializableTopologyDef, 'id'> | SerializableTopologyDef): string {
  const pathFields =
    'verbs' in topology && Array.isArray(topology.verbs)
      ? {
          verbs: topology.verbs,
          pointsPerVerb: topology.pointsPerVerb,
          totalControlPoints: topology.totalControlPoints,
          closed: topology.closed,
          segmentKind: topology.segmentKind,
          segmentPointBase: topology.segmentPointBase,
          hasQuad: topology.hasQuad,
          hasCubic: topology.hasCubic,
        }
      : null;
  return JSON.stringify({
    params: topology.params,
    path: pathFields,
  });
}

function topologySignatureWithId(topology: SerializableTopologyDef): string {
  return JSON.stringify({
    id: topology.id,
    shape: topologyShapeSignature(topology),
  });
}

/**
 * Export clone-safe topology definitions (no function fields) for thread/message transfer.
 *
 * @param ids - Optional subset of topology IDs to export. Defaults to all registered IDs.
 */
export function exportSerializableTopologies(ids?: readonly TopologyId[]): readonly SerializableTopologyDef[] {
  const topologyIds = ids ?? getAllTopologyIds();
  return topologyIds.map((id) => toSerializableTopology(getTopology(id)));
}

/**
 * Install topology definitions received across thread/process boundaries.
 *
 * Existing IDs must match exactly; mismatched redefinitions throw.
 */
export function installSerializableTopologies(topologies: readonly SerializableTopologyDef[]): void {
  for (const topology of topologies) {
    const existing = TOPOLOGY_REGISTRY[topology.id];
    const shapeSig = topologyShapeSignature(topology);
    if (existing) {
      const existingSignature = topologySignatureWithId(toSerializableTopology(existing));
      const incomingSignature = topologySignatureWithId(topology);
      if (existingSignature !== incomingSignature) {
        throw new Error(`Topology ID collision with incompatible definitions: ${topology.id}`);
      }
      if (!TOPOLOGY_BY_SHAPE_SIGNATURE.has(shapeSig)) {
        TOPOLOGY_BY_SHAPE_SIGNATURE.set(shapeSig, topology.id);
      }
      continue;
    }

    // [LAW:one-source-of-truth] Main-thread topology registry is synchronized from
    // compile artifacts instead of re-deriving runtime-only IDs.
    TOPOLOGY_REGISTRY[topology.id] = { ...topology } as TopologyDef;
    if (!TOPOLOGY_BY_SHAPE_SIGNATURE.has(shapeSig)) {
      TOPOLOGY_BY_SHAPE_SIGNATURE.set(shapeSig, topology.id);
    }
    if (topology.id >= nextDynamicId) {
      nextDynamicId = topology.id + 1;
    }
  }
}
