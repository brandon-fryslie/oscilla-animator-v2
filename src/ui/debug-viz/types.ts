/**
 * Core types for the debug visualization system.
 *
 * Defines the type foundation for temporal history tracking and
 * visualization rendering of debug probe data.
 */

import type { PayloadType } from '../../core/canonical-types';

// =============================================================================
// DebugTargetKey - What is being observed
// =============================================================================

/**
 * Discriminated union identifying a debug observation target.
 *
 * - edge: An edge in the patch graph (identified by edge ID)
 * - port: An output port on a block (identified by blockId + portName)
 *
 * Note: portName is the stable PortBindingIR.portName, not an edge ID.
 */
export type DebugTargetKey =
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'port'; readonly blockId: string; readonly portName: string };

/**
 * Canonical bijective serialization of a DebugTargetKey.
 *
 * Format:
 * - edge: "e:" + edgeId
 * - port: "p:" + blockId + "\0" + portName
 *
 * Uses NUL separator for port keys to guarantee no ambiguity
 * (blockId and portName cannot contain NUL).
 */
export function serializeKey(key: DebugTargetKey): string {
  switch (key.kind) {
    case 'edge':
      return `e:${key.edgeId}`;
    case 'port':
      return `p:${key.blockId}\0${key.portName}`;
  }
}

// =============================================================================
// Stride - Component count per sample
// =============================================================================

/**
 * Number of float components per sample.
 * Compile-time enforced literal union (not just `number`).
 *
 * - 0: non-sampleable (bool, shape)
 * - 1: scalar (float, int)
 * - 2: vec2
 * - 3: (reserved for vec3)
 * - 4: color (RGBA)
 */
export type Stride = 0 | 1 | 2 | 3 | 4;

// =============================================================================
// SampleEncoding - How to interpret a PayloadType for history
// =============================================================================

/**
 * Describes how a PayloadType maps to float samples in the history buffer.
 */
export interface SampleEncoding {
  /** The source payload type */
  readonly payload: PayloadType;
  /** Number of float components per sample */
  readonly stride: Stride;
  /** Human-readable component labels (e.g., ['x', 'y'] for vec2) */
  readonly components: readonly string[];
  /** Whether this payload type can be sampled into a history buffer */
  readonly sampleable: boolean;
}

/**
 * Get the sample encoding for a given PayloadType.
 *
 * Exhaustive switch with `never` default ensures compile-time
 * coverage of all PayloadType members.
 */
export function getSampleEncoding(payload: PayloadType): SampleEncoding {
  switch (payload) {
    case 'float':
      return { payload, stride: 1, components: ['value'], sampleable: true };
    case 'int':
      return { payload, stride: 1, components: ['value'], sampleable: true };
    case 'vec2':
      return { payload, stride: 2, components: ['x', 'y'], sampleable: true };
    case 'vec3':
      return { payload, stride: 3, components: ['x', 'y', 'z'], sampleable: true };

    case 'color':
      return { payload, stride: 4, components: ['r', 'g', 'b', 'a'], sampleable: true };
    case 'bool':
      return { payload, stride: 0, components: [], sampleable: false };
    case 'shape':
      return { payload, stride: 0, components: [], sampleable: false };
    case 'cameraProjection':
      return { payload, stride: 1, components: ['projection'], sampleable: true };
    default: {
      const _exhaustive: never = payload;
      throw new Error(`Unknown PayloadType: ${_exhaustive}`);
    }
  }
}

// =============================================================================
// HistoryView - Ring buffer read interface
// =============================================================================

/**
 * Read-only view of a temporal history ring buffer.
 *
 * The buffer stores `capacity` samples, each of `stride` floats.
 * writeIndex is monotonically increasing (unbounded) — use modulo
 * to find the physical position in the buffer.
 */
export interface HistoryView {
  /** The ring buffer storage (length = capacity * stride) */
  readonly buffer: Float32Array;
  /** Monotonically increasing write position (unbounded) */
  readonly writeIndex: number;
  /** Maximum number of samples the buffer can hold */
  readonly capacity: number;
  /** Number of float components per sample */
  readonly stride: Stride;
  /** Whether the buffer has been completely filled at least once */
  readonly filled: boolean;
}

// =============================================================================
// AggregateStats - Summary statistics for field-cardinality data
// =============================================================================

/**
 * Aggregate statistics across lanes for field-cardinality values.
 *
 * min/max/mean are Float32Array of length 4. Only the first `stride`
 * components are meaningful; remaining are zero-filled.
 */
export interface AggregateStats {
  /** Number of lanes aggregated */
  readonly count: number;
  /** Component stride of the aggregated values */
  readonly stride: Stride;
  /** Per-component minimum (length 4, first `stride` valid) */
  readonly min: Float32Array;
  /** Per-component maximum (length 4, first `stride` valid) */
  readonly max: Float32Array;
  /** Per-component mean (length 4, first `stride` valid) */
  readonly mean: Float32Array;
}

// =============================================================================
// RendererSample - What a renderer receives to draw
// =============================================================================

/**
 * Discriminated union of sample types passed to renderers.
 *
 * - scalar: A single multi-component sample (from cardinality:one history)
 * - aggregate: Summary statistics (from cardinality:many data)
 */
export type RendererSample =
  | { readonly type: 'scalar'; readonly components: Float32Array; readonly stride: Stride }
  | { readonly type: 'aggregate'; readonly stats: AggregateStats };
