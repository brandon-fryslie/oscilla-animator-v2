/**
 * Arena Control Point Channels — SoA Layout for Parametric Curves
 *
 * Resolves GPU memory layout for per-instance control point data stored in
 * the Arena's Field Zone (Zone 3). Each control point axis (P0_X, P0_Y, ...)
 * occupies a separate contiguous channel in Structure-of-Arrays format.
 *
 * [LAW:one-source-of-truth] This module is the single authority for control
 * point channel naming, ordering, and alignment computation.
 *
 * [LAW:dataflow-not-control-flow] Channel count is derived from degree;
 * all channels are allocated unconditionally for the given degree.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md §2.2
 * Spec: docs/WebGPU-Complete/P1-1__Unified_GPU_Buffer_Strategy_Explained.md §2 (Zone 3)
 */

// ── Constants ──────────────────────────────────────────────────────────

/**
 * Minimum alignment in bytes between channel starts.
 * Spec §2.2: "GpuLayout offset resolver must guarantee strict 16-byte
 * alignment between these channels to avoid driver-level read faults."
 */
export const CHANNEL_ALIGNMENT_BYTES = 16;

/** Alignment in f32 words (16 bytes / 4 bytes per f32) */
export const CHANNEL_ALIGNMENT_WORDS = CHANNEL_ALIGNMENT_BYTES / 4; // 4

/** Maximum control points per curve (spec §4.2 register ceiling) */
export const MAX_CONTROL_POINTS = 16;

/** Spatial dimensions per control point (2D curves) */
export const DIMENSIONS = 2;

// ── Channel Names ──────────────────────────────────────────────────────

/**
 * Generate channel names for a given degree.
 *
 * Cubic Bezier (degree=3, 4 control points):
 *   ['P0_X', 'P0_Y', 'P1_X', 'P1_Y', 'P2_X', 'P2_Y', 'P3_X', 'P3_Y']
 *
 * Channel count = (degree + 1) * DIMENSIONS
 */
export function controlPointChannelNames(degree: number): readonly string[] {
  const pointCount = degree + 1;
  const names: string[] = new Array(pointCount * DIMENSIONS);
  for (let p = 0; p < pointCount; p++) {
    names[p * DIMENSIONS] = `P${p}_X`;
    names[p * DIMENSIONS + 1] = `P${p}_Y`;
  }
  return names;
}

// ── Alignment ──────────────────────────────────────────────────────────

/**
 * Align a byte count up to the given alignment boundary.
 *
 * [LAW:single-enforcer] This is the one alignment enforcer for
 * control point channel layout.
 */
export function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

// ── Layout Types ───────────────────────────────────────────────────────

/** A single channel's position in the Arena layout. */
export interface ControlPointChannel {
  /** Channel name (e.g. 'P0_X', 'P2_Y') */
  readonly name: string;
  /** Byte offset from layout base */
  readonly byteOffset: number;
  /** Word offset from layout base (byteOffset / 4) */
  readonly wordOffset: number;
}

/** Complete SoA layout for all control point channels. */
export interface ControlPointLayout {
  /** Ordered channels with resolved offsets */
  readonly channels: readonly ControlPointChannel[];
  /** Number of channels (= (degree+1) * 2) */
  readonly channelCount: number;
  /** Instance count this layout was resolved for */
  readonly instanceCount: number;
  /** Curve degree (1=linear, 2=quadratic, 3=cubic) */
  readonly degree: number;
  /** Byte stride per channel (instanceCount * 4, aligned to CHANNEL_ALIGNMENT_BYTES) */
  readonly channelStrideBytes: number;
  /** Word stride per channel (channelStrideBytes / 4) */
  readonly channelStrideWords: number;
  /** Total bytes consumed by all channels (channelCount * channelStrideBytes) */
  readonly totalBytes: number;
  /** Total words consumed by all channels */
  readonly totalWords: number;
}

// ── Layout Resolution ──────────────────────────────────────────────────

/**
 * Resolve the SoA layout for parametric curve control points.
 *
 * Given an instance count and curve degree, computes the aligned byte/word
 * offsets for each channel. Channels are packed sequentially with
 * 16-byte alignment between starts.
 *
 * @example
 * ```ts
 * const layout = resolveControlPointLayout(1000, 3);
 * // layout.channels[0] = { name: 'P0_X', byteOffset: 0, wordOffset: 0 }
 * // layout.channels[1] = { name: 'P0_Y', byteOffset: 4000, wordOffset: 1000 }
 * // layout.channelStrideBytes = 4000 (1000 * 4, already 16-aligned)
 * // layout.channelCount = 8
 * // layout.totalBytes = 32000
 * ```
 */
export function resolveControlPointLayout(
  instanceCount: number,
  degree: number,
): ControlPointLayout {
  const pointCount = degree + 1;
  if (pointCount > MAX_CONTROL_POINTS) {
    throw new Error(
      `ArenaControlPoints: ${pointCount} control points exceeds register ceiling (max=${MAX_CONTROL_POINTS})`,
    );
  }

  const names = controlPointChannelNames(degree);
  const channelCount = names.length;

  // Each channel holds instanceCount f32 values.
  // Stride is aligned up to CHANNEL_ALIGNMENT_BYTES.
  const rawChannelBytes = instanceCount * 4;
  const channelStrideBytes = alignUp(rawChannelBytes, CHANNEL_ALIGNMENT_BYTES);
  const channelStrideWords = channelStrideBytes / 4;

  // [LAW:dataflow-not-control-flow] All channels allocated unconditionally
  const channels: ControlPointChannel[] = new Array(channelCount);
  for (let i = 0; i < channelCount; i++) {
    const byteOffset = i * channelStrideBytes;
    channels[i] = {
      name: names[i]!,
      byteOffset,
      wordOffset: byteOffset / 4,
    };
  }

  const totalBytes = channelCount * channelStrideBytes;

  return {
    channels,
    channelCount,
    instanceCount,
    degree,
    channelStrideBytes,
    channelStrideWords,
    totalBytes,
    totalWords: totalBytes / 4,
  };
}
