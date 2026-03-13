/**
 * Parametric Draw Prep — CPU-Side Bucket Resolution for Parametric Shapes
 *
 * Produces DrawPrepParams uniform data for parametric shape buckets.
 * The GPU-side DrawPrepKernel is generic (handles both rigid and parametric);
 * this module computes the correct parameters for parametric sinks.
 *
 * [LAW:one-source-of-truth] Resolution bucketing lives here. The DrawPrepKernel
 * is topology-agnostic — it just writes the command words it receives.
 *
 * [LAW:dataflow-not-control-flow] All sinks are bucketed unconditionally;
 * empty buckets produce zero-instance records (no-ops in indirect draw).
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md §4.1
 */

import {
  type IndirectBufferLayout,
  INDEXED_INDIRECT_WORDS,
  NON_INDEXED_INDIRECT_WORDS,
} from './IndirectBuffer';

// ── Constants ──────────────────────────────────────────────────────────

/**
 * Draw mode discriminator for DrawPrepKernel uniform v0.x.
 * Matches the convention in DrawPrepKernel.ts.
 */
export const DrawMode = {
  /** DrawIndexedIndirectArgs (5 words): triangle strip with index buffer */
  Indexed: 0,
  /** DrawIndirectArgs (4 words): line strip, no index buffer */
  NonIndexed: 1,
} as const;

// ── Topology Helpers ───────────────────────────────────────────────────

/**
 * Vertex count for a parametric line strip: one vertex per sample point.
 * Line strip with N segments has N+1 vertices.
 */
export function lineStripVertexCount(resolution: number): number {
  return resolution + 1;
}

/**
 * Vertex count for a parametric triangle strip (ribbon/tube extrusion).
 * Each segment produces 2 vertices (left and right edge of the ribbon).
 * Triangle strip with N segments has (N+1) * 2 vertices.
 */
export function triangleStripVertexCount(resolution: number): number {
  return (resolution + 1) * 2;
}

// ── Sink Metadata ──────────────────────────────────────────────────────

/** Topology type for a parametric shape bucket. */
export type ParametricTopology = 'line-strip' | 'triangle-strip';

/**
 * Metadata for a parametric shape sink — one group of instances that
 * share the same resolution and topology.
 */
export interface ParametricSinkDescriptor {
  /** Curve segment count (locked per bucket — uniform resolution mandate) */
  readonly resolution: number;
  /** Number of instances in this bucket */
  readonly instanceCount: number;
  /** First instance index within the instance array */
  readonly firstInstance: number;
  /** Topology determines indexed vs non-indexed draw */
  readonly topology: ParametricTopology;
}

// ── DrawPrepParams ─────────────────────────────────────────────────────

/**
 * CPU-side representation of the DrawPrepParams uniform struct.
 * Matches the 3× vec4<u32> layout consumed by DrawPrepKernel.
 *
 * v0 = [drawMode, countOrIndexCount, firstOrFirstIndex, baseVertexBits]
 * v1 = [instanceCount, firstInstance, recordIndex, maxRecords]
 * v2 = [indexedRegionBaseWords, nonIndexedRegionBaseWords,
 *       indexedStrideWords, nonIndexedStrideWords]
 */
export interface DrawPrepParams {
  readonly v0: readonly [number, number, number, number];
  readonly v1: readonly [number, number, number, number];
  readonly v2: readonly [number, number, number, number];
}

/**
 * Serialize DrawPrepParams to a Uint32Array (12 words = 48 bytes)
 * for GPU uniform upload.
 */
export function serializeDrawPrepParams(params: DrawPrepParams): Uint32Array {
  const data = new Uint32Array(12);
  data[0] = params.v0[0]; data[1] = params.v0[1];
  data[2] = params.v0[2]; data[3] = params.v0[3];
  data[4] = params.v1[0]; data[5] = params.v1[1];
  data[6] = params.v1[2]; data[7] = params.v1[3];
  data[8] = params.v2[0]; data[9] = params.v2[1];
  data[10] = params.v2[2]; data[11] = params.v2[3];
  return data;
}

// ── Bucket Resolution ──────────────────────────────────────────────────

/**
 * Build DrawPrepParams for a parametric shape sink.
 *
 * @param sink - Parametric sink descriptor (resolution, instanceCount, topology)
 * @param recordIndex - Which indirect record slot this bucket occupies
 * @param maxRecords - Total indirect record capacity (for bounds guard)
 * @param layout - IndirectBuffer layout (region offsets)
 * @returns DrawPrepParams ready for GPU uniform upload
 */
export function buildParametricDrawPrepParams(
  sink: ParametricSinkDescriptor,
  recordIndex: number,
  maxRecords: number,
  layout: IndirectBufferLayout,
): DrawPrepParams {
  // [LAW:dataflow-not-control-flow] Both topology paths produce valid params;
  // the drawMode value selects which indirect buffer region receives writes.
  const isIndexed = sink.topology === 'triangle-strip';
  const drawMode = isIndexed ? DrawMode.Indexed : DrawMode.NonIndexed;

  const vertexCount = isIndexed
    ? triangleStripVertexCount(sink.resolution)
    : lineStripVertexCount(sink.resolution);

  // Region base offsets in u32 words (byte offset / 4)
  const indexedRegionBaseWords = layout.indexedRegionBaseBytes / 4;
  const nonIndexedRegionBaseWords = layout.nonIndexedRegionBaseBytes / 4;

  return {
    v0: [
      drawMode,
      vertexCount,       // countOrIndexCount
      0,                 // firstOrFirstIndex (always 0 for virtual topology)
      0,                 // baseVertexBits (no index buffer for line strip; 0 for triangle strip)
    ],
    v1: [
      sink.instanceCount,
      sink.firstInstance,
      recordIndex,
      maxRecords,
    ],
    v2: [
      indexedRegionBaseWords,
      nonIndexedRegionBaseWords,
      INDEXED_INDIRECT_WORDS,
      NON_INDEXED_INDIRECT_WORDS,
    ],
  };
}

// ── Resolution Bucketing ───────────────────────────────────────────────

/**
 * A resolved draw bucket — one indirect record for a group of
 * same-resolution instances.
 */
export interface ParametricDrawBucket {
  /** The sink descriptor for this bucket */
  readonly sink: ParametricSinkDescriptor;
  /** The indirect record index assigned to this bucket */
  readonly recordIndex: number;
  /** The draw prep params for GPU upload */
  readonly params: DrawPrepParams;
}

/**
 * Group parametric instances by resolution and produce draw buckets.
 *
 * [LAW:single-enforcer] This is the one place that enforces the
 * uniform resolution mandate (spec §4.1). Instances with different
 * resolutions are split into separate indirect records.
 *
 * @param instances - Array of (resolution, topology) per instance, in order
 * @param startRecordIndex - First available indirect record slot
 * @param maxRecords - Total indirect record capacity
 * @param layout - IndirectBuffer layout
 * @returns Resolved draw buckets, one per unique (resolution, topology) pair
 */
export function bucketParametricInstances(
  instances: readonly { resolution: number; topology: ParametricTopology }[],
  startRecordIndex: number,
  maxRecords: number,
  layout: IndirectBufferLayout,
): readonly ParametricDrawBucket[] {
  // Group by (resolution, topology) key
  const groups = new Map<string, { resolution: number; topology: ParametricTopology; firstInstance: number; count: number }>();

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    const key = `${inst.resolution}:${inst.topology}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, {
        resolution: inst.resolution,
        topology: inst.topology,
        firstInstance: i,
        count: 1,
      });
    }
  }

  // [LAW:dataflow-not-control-flow] All groups produce buckets unconditionally
  const buckets: ParametricDrawBucket[] = [];
  let recordIndex = startRecordIndex;

  for (const group of groups.values()) {
    if (recordIndex >= maxRecords) {
      throw new Error(
        `ParametricDrawPrep: indirect record capacity exceeded (max=${maxRecords})`,
      );
    }

    const sink: ParametricSinkDescriptor = {
      resolution: group.resolution,
      instanceCount: group.count,
      firstInstance: group.firstInstance,
      topology: group.topology,
    };

    const params = buildParametricDrawPrepParams(sink, recordIndex, maxRecords, layout);

    buckets.push({ sink, recordIndex, params });
    recordIndex++;
  }

  return buckets;
}
