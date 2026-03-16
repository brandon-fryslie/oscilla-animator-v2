/**
 * Topology Registry
 *
 * Provides O(1) array-indexed lookup for topology definitions.
 * Registry is populated at compile-time with dynamically created topologies (paths).
 *
 * ID Allocation:
 * - Dynamic topologies: IDs 100+ (auto-assigned)
 */

import type {
  TopologyId,
  TopologyDef,
  PathTopologyDef,
  ParametricTopologyDef,
  AbstractTopologyDef,
  PathSegmentKind,
  SerializableTopologyDef,
} from './types';
import { PathVerb } from './types';

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
let topologyRegistryRevision = 0;

/**
 * Topology bank packed record layout (u32 words per topology).
 *
 * [LAW:one-source-of-truth] This layout is the canonical structural export for
 * GPU-facing topology metadata.
 */
export const TOPOLOGY_BANK_WORDS = 4;
export const TopologyBankWord = {
  Id: 0,
  VerbCount: 1,
  TotalControlPoints: 2,
  Flags: 3,
} as const;
export const TopologyBankFlag = {
  IsPath: 1 << 0,
  Closed: 1 << 1,
} as const;

export interface TopologyBankExport {
  readonly wordsPerRecord: number;
  readonly ids: readonly TopologyId[];
  readonly indexById: ReadonlyMap<TopologyId, number>;
  readonly data: Uint32Array;
  readonly revision: number;
}

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
 * Get the current topology registry revision.
 *
 * Increments on any registry mutation (new topology registration/install).
 */
export function getTopologyRegistryRevision(): number {
  return topologyRegistryRevision;
}

function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return Array.isArray((topology as Partial<PathTopologyDef>).verbs);
}

/**
 * Type guard for ParametricTopologyDef.
 *
 * // [LAW:one-type-per-behavior] Parametric topologies are distinct from path
 * // topologies — they have degree/resolution instead of verbs/pointsPerVerb.
 */
export function isParametricTopology(topology: TopologyDef): topology is ParametricTopologyDef {
  return (topology as Partial<ParametricTopologyDef>).parametric === true;
}

/**
 * Export topology metadata as a packed u32 bank for GPU upload.
 *
 * Record layout (4 words):
 * - 0: topology id
 * - 1: verb count (0 for non-path topologies)
 * - 2: total control points (0 for non-path topologies)
 * - 3: flags bitfield (isPath, closed)
 */
export function exportTopologyBankU32(ids?: readonly TopologyId[]): TopologyBankExport {
  const topologyIds = ids ?? getAllTopologyIds();
  const wordsPerRecord = TOPOLOGY_BANK_WORDS;
  const data = new Uint32Array(topologyIds.length * wordsPerRecord);
  const indexById = new Map<TopologyId, number>();

  for (let i = 0; i < topologyIds.length; i++) {
    const id = topologyIds[i]!;
    const topology = getTopology(id);
    const base = i * wordsPerRecord;
    const path = isPathTopology(topology);
    const flags =
      (path ? TopologyBankFlag.IsPath : 0) |
      (path && topology.closed ? TopologyBankFlag.Closed : 0);

    data[base + TopologyBankWord.Id] = id >>> 0;
    data[base + TopologyBankWord.VerbCount] = path ? topology.verbs.length >>> 0 : 0;
    data[base + TopologyBankWord.TotalControlPoints] = path ? topology.totalControlPoints >>> 0 : 0;
    data[base + TopologyBankWord.Flags] = flags >>> 0;
    indexById.set(id, i);
  }

  return {
    wordsPerRecord,
    ids: topologyIds,
    indexById,
    data,
    revision: topologyRegistryRevision,
  };
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
  topology: AbstractTopologyDef | Omit<PathTopologyDef, 'id'> | Omit<ParametricTopologyDef, 'id'>,
  debugName?: string
): TopologyId {
  // Check if this is a PathTopologyDef (has 'verbs' field)
  // If so, compute precomputed dispatch data
  let shapeTopology: Omit<TopologyDef, 'id'>;
  if ('verbs' in topology) {
    const dispatchData = computePathDispatchData(topology.verbs);
    shapeTopology = { ...topology, ...dispatchData } as Omit<PathTopologyDef, 'id'>;
  } else {
    // ParametricTopologyDef and AbstractTopologyDef both pass through directly.
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
  topologyRegistryRevision++;
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
  return topology as SerializableTopologyDef;
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
  // [RECOVER-11] Parametric topology fields in signature for structural interning.
  const parametricFields =
    'parametric' in topology && topology.parametric === true
      ? {
          degree: topology.degree,
          resolution: topology.resolution,
          closed: topology.closed,
          ribbonWidth: topology.ribbonWidth,
        }
      : null;
  return JSON.stringify({
    params: topology.params,
    path: pathFields,
    parametric: parametricFields,
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
  let changed = false;
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
        changed = true;
      }
      continue;
    }

    // [LAW:one-source-of-truth] Main-thread topology registry is synchronized from
    // compile artifacts instead of re-deriving runtime-only IDs.
    TOPOLOGY_REGISTRY[topology.id] = { ...topology } as TopologyDef;
    changed = true;
    if (!TOPOLOGY_BY_SHAPE_SIGNATURE.has(shapeSig)) {
      TOPOLOGY_BY_SHAPE_SIGNATURE.set(shapeSig, topology.id);
    }
    if (topology.id >= nextDynamicId) {
      nextDynamicId = topology.id + 1;
    }
  }
  if (changed) {
    topologyRegistryRevision++;
  }
}

// =============================================================================
// Type 2 Parametric Template Generation
// =============================================================================

/**
 * Generate a template t-value array for a parametric topology.
 *
 * // [LAW:one-source-of-truth] Template t-values are derived from the
 * // ParametricTopologyDef's resolution field. This is the single canonical
 * // source for template progression data stored in ShapeBank.
 *
 * For a curve with resolution R, this produces R+1 evenly-spaced t-values
 * from 0.0 to 1.0 (inclusive). These are stored as f32 values in ShapeBank's
 * param block and read by the vertex shader to evaluate the parametric curve.
 *
 * @param resolution - Number of segments (produces resolution + 1 t-values)
 * @returns Float32Array of t-values, bitcast-ready for u32 ShapeBank storage
 */
export function generateParametricTemplate(resolution: number): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 1) {
    // [LAW:single-enforcer] Parametric template generation owns the
    // `resolution >= 1` invariant for the canonical template payload.
    throw new Error(`generateParametricTemplate: resolution must be an integer >= 1 (received ${resolution})`);
  }
  const count = resolution + 1;
  const template = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    template[i] = i / resolution;
  }
  return template;
}

/**
 * Compute the vertex count for a Type 2 parametric ribbon.
 *
 * Each segment of the curve produces a quad (2 triangles = 6 vertices).
 * The vertex shader determines which segment and which triangle vertex
 * from @builtin(vertex_index).
 *
 * @param resolution - Number of segments
 * @returns Total vertex count for non-indexed draw
 */
export function parametricRibbonVertexCount(resolution: number): number {
  return resolution * 6;
}
