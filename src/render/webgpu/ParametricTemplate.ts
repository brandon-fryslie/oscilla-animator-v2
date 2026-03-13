/**
 * Parametric Curve Template — Type 2 Shape Instancing
 *
 * Allocates parametric curve templates in the ShapeBank payload heap.
 * Templates store a uniform t-value progression (0.0 → 1.0) that the
 * vertex shader uses to evaluate Bézier polynomials against per-instance
 * control points stored in the Arena.
 *
 * [LAW:one-source-of-truth] Template t-values live in ShapeBank payload.
 * Control points live in Arena. This file owns template allocation only.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md
 */

import {
  type ShapeBank,
  type ShapeHeaderV1,
  ShapeKind,
  TopologyMode,
  floatBitsToUint,
} from './ShapeBank';

// ── Constants ──────────────────────────────────────────────────────────

/** Register ceiling: max control points per curve (spec §4.2) */
export const MAX_CONTROL_POINTS = 16;

/** Default curve resolution (segments) */
export const DEFAULT_CURVE_RESOLUTION = 64;

// ── Types ──────────────────────────────────────────────────────────────

export interface ParametricCurveParams {
  /** Polynomial degree (1=linear, 2=quadratic, 3=cubic) */
  readonly degree: number;
  /** Number of curve segments. Vertex count = resolution + 1. */
  readonly resolution: number;
  /** Number of control points per instance */
  readonly controlPointCount: number;
  /** Material class index for draw bucketing */
  readonly materialClass?: number;
}

// ── T-Value Generation ─────────────────────────────────────────────────

/**
 * Generate a uniform t-value progression from 0.0 to 1.0.
 *
 * [LAW:dataflow-not-control-flow] Always generates resolution+1 values.
 * The shader uses these to evaluate the curve polynomial at each vertex.
 */
export function generateTValues(resolution: number): Float32Array {
  const count = resolution + 1;
  const values = new Float32Array(count);
  // [LAW:dataflow-not-control-flow] unconditional write of all values
  for (let i = 0; i < count; i++) {
    values[i] = i / resolution;
  }
  return values;
}

// ── Template Allocation ────────────────────────────────────────────────

/**
 * Allocate a parametric curve template in the ShapeBank.
 *
 * Writes t-values into the payload heap (bit-cast f32 → u32) and creates
 * a shape header with `kind: ParametricCurve`, `topologyMode: Virtual`.
 *
 * Returns the shape ID (header index).
 */
export function allocateParametricCurve(
  bank: ShapeBank,
  params: ParametricCurveParams,
): number {
  if (params.controlPointCount > MAX_CONTROL_POINTS) {
    throw new Error(
      `ParametricTemplate: control point count ${params.controlPointCount} exceeds register ceiling (max=${MAX_CONTROL_POINTS})`,
    );
  }

  // Generate t-values and bit-cast to u32 for ShapeBank storage
  const tValues = generateTValues(params.resolution);
  const tWordsCount = tValues.length; // resolution + 1
  const tWords = new Uint32Array(tWordsCount);
  for (let i = 0; i < tWordsCount; i++) {
    tWords[i] = floatBitsToUint(tValues[i]!);
  }

  // Allocate payload space and write t-values
  const payloadOffset = bank.allocatePayload(tWordsCount);
  bank.writePayload(payloadOffset, tWords);

  // [LAW:one-source-of-truth] Header fully describes this shape's topology
  const header: ShapeHeaderV1 = {
    kind: ShapeKind.ParametricCurve,
    topologyMode: TopologyMode.Virtual,
    flags: params.degree & 0xff, // degree stored in low byte of flags
    materialClass: params.materialClass ?? 0,
    indexCount: 0,        // virtual topology — no index buffer
    firstIndex: 0,
    baseVertex: 0,
    vertexCount: params.resolution + 1,
    firstVertex: 0,
    paramBlockOffset: payloadOffset,
    paramBlockWords: tWordsCount,
    boundsMinPacked: 0,   // bounds computed at runtime from control points
    boundsMaxPacked: 0,
  };

  return bank.allocateShape(header);
}
