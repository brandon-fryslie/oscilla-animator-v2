/**
 * Type 2 Parametric ShapeBank ABI — Template Topology Contracts
 *
 * Defines the canonical 16-word ShapeBank header semantics for Type 2
 * Parametric shapes, plus template payload builders for parametric families
 * (CubicBezierRibbon2D, ClosedBlob2D).
 *
 * // [LAW:one-source-of-truth] This module is the single authority for Type 2
 * // header semantics and template payload generation. The compile-time install
 * // contract and runtime materializer consume these definitions.
 *
 * ## Type 2 Header Layout (16 x u32, shared ABI with Type 1)
 *
 * Word 0  Kind               = 2 (ShapeClass.Type2Parametric)
 * Word 1  TopologyType       = 0 (NonIndexed/ribbon) | 1 (Indexed/blob)
 * Word 2  Flags              = reserved (0)
 * Word 3  MaterialClass      = reserved (0)
 * Word 4  IndexCount         = 0 for ribbon, R*3 for closed blob
 * Word 5  FirstIndex         = word offset where index payload begins (0 if non-indexed)
 * Word 6  VertexCount        = R+1 for ribbon, R+1 for closed blob (centroid + R perimeter)
 * Word 7  FirstVertex        = word offset where template t-values begin (always 16)
 * Word 8  reserved           = 0
 * Word 9  ParamStride        = SoA param stride (e.g. 8 for cubic bezier p0..p3 x,y)
 * Word 10 ParamBlockWords    = reserved (0)
 * Word 11 CpArenaBaseOffset  = Arena base offset for control-point channels
 * Word 12 BoundsMinPacked    = reserved (0)
 * Word 13 BoundsMaxPacked    = reserved (0)
 * Word 14 CpArenaLaneStride  = Arena lane stride
 * Word 15 CpArenaComponentStride = Arena component stride
 *
 * ## Template Payload (appended after 16-word header)
 *
 * For non-indexed (ribbon):   R+1 f32 t-values [0.0, 1/R, 2/R, ..., 1.0]
 * For indexed (blob):         R+1 f32 t-values [-1.0, 0.0, 1/R, ..., (R-1)/R]
 *                             followed by R*3 u32 triangle fan indices
 */

import { TopologyType, ShapeClass } from './types';
import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
} from '../runtime/RuntimeState';

// =============================================================================
// Template Payload Builders
// =============================================================================

/**
 * Result of building a parametric template payload.
 *
 * Contains the template t-values and optional index buffer, plus the
 * metadata needed to populate the Type 2 ShapeBank header.
 */
export interface ParametricTemplatePayload {
  /** Template t-values (f32, stored as u32 bit-cast in ShapeBank) */
  readonly templateValues: Float32Array;
  /** Triangle fan indices (u32), empty for non-indexed families */
  readonly indices: Uint32Array;
  /** Vertex count (templateValues.length) */
  readonly vertexCount: number;
  /** Index count (indices.length; 0 for non-indexed) */
  readonly indexCount: number;
  /** TopologyType discriminant */
  readonly topologyType: TopologyType;
  /** SoA parameter stride (floats per instance per channel set) */
  readonly paramStride: number;
}

/**
 * Build a non-indexed ribbon template (CubicBezierRibbon2D).
 *
 * Generates R+1 evenly-spaced t-values from 0.0 to 1.0.
 * The vertex shader evaluates the cubic Bezier at each t to produce positions.
 *
 * @param resolution R — number of segments (produces R+1 vertices)
 * @param paramStride SoA stride for control-point channels (8 for cubic: p0.x,p0.y,...,p3.y)
 */
export function buildRibbonTemplate(
  resolution: number,
  paramStride: number,
): ParametricTemplatePayload {
  if (resolution < 1) {
    throw new Error(`Ribbon resolution must be >= 1 (got ${resolution})`);
  }

  // Template stores R+1 t-values (segment endpoints).
  // Draw vertex count is R*6: each segment becomes a quad (2 triangles, 6 vertices).
  // The vertex shader maps each draw vertex to the correct t-value and normal side
  // via vertex_index % 6u lookup tables.
  const templateValueCount = resolution + 1;
  const templateValues = new Float32Array(templateValueCount);

  for (let i = 0; i <= resolution; i++) {
    templateValues[i] = i / resolution;
  }

  const vertexCount = resolution * 6;

  return {
    templateValues,
    indices: new Uint32Array(0),
    vertexCount,
    indexCount: 0,
    topologyType: TopologyType.NonIndexed,
    paramStride,
  };
}

/**
 * Build an indexed closed-blob template (ClosedBlob2D).
 *
 * Generates a centroid-anchored triangle fan topology:
 * - Vertex 0: centroid sentinel (t = -1.0)
 * - Vertices 1..R: perimeter at t = 0/R, 1/R, ..., (R-1)/R
 * - Indices: triangle fan [0,1,2, 0,2,3, ..., 0,R,1] (closing back to vertex 1)
 *
 * The vertex shader uses t < -0.5 to detect the centroid anchor and evaluates
 * the shared hardened Bezier for non-centroid vertices.
 *
 * @param resolution R — number of perimeter vertices (produces R+1 total vertices, R*3 indices)
 * @param paramStride SoA stride for control-point channels
 */
export function buildClosedBlobTemplate(
  resolution: number,
  paramStride: number,
): ParametricTemplatePayload {
  if (resolution < 3) {
    throw new Error(`ClosedBlob resolution must be >= 3 (got ${resolution})`);
  }

  // R+1 vertices: centroid + R perimeter points
  const vertexCount = resolution + 1;
  const templateValues = new Float32Array(vertexCount);

  // Vertex 0: centroid sentinel
  templateValues[0] = -1.0;

  // Vertices 1..R: perimeter t-values [0/R, 1/R, ..., (R-1)/R]
  for (let i = 0; i < resolution; i++) {
    templateValues[i + 1] = i / resolution;
  }

  // Triangle fan indices: R triangles, 3 indices each
  // [0,1,2, 0,2,3, ..., 0,R-1,R, 0,R,1]
  const indexCount = resolution * 3;
  const indices = new Uint32Array(indexCount);

  for (let i = 0; i < resolution; i++) {
    const base = i * 3;
    indices[base] = 0; // centroid
    indices[base + 1] = i + 1; // current perimeter vertex
    // Next perimeter vertex, wrapping back to vertex 1
    indices[base + 2] = ((i + 1) % resolution) + 1;
  }

  return {
    templateValues,
    indices,
    vertexCount,
    indexCount,
    topologyType: TopologyType.Indexed,
    paramStride,
  };
}

// =============================================================================
// ShapeBank Packing
// =============================================================================

/**
 * Compute the total word count for a Type 2 Parametric ShapeBank record.
 *
 * Use this to pre-allocate the target buffer before calling
 * packParametricShapeBankRecord().
 */
export function parametricRecordWordCount(payload: ParametricTemplatePayload): number {
  return SHAPE_BANK_HEADER_WORDS + payload.templateValues.length + payload.indices.length;
}

/**
 * Pack a ParametricTemplatePayload DIRECTLY into a pre-allocated target buffer.
 *
 * Writes the 16-word header followed by template t-values (f32→u32 bit-cast)
 * and optional index payload into `target` starting at `offset`.
 *
 * Returns the number of words written (header + template + indices).
 *
 * // [LAW:one-source-of-truth] This function is the single producer of
 * // Type 2 ShapeBank records. Both compile-time install and runtime
 * // materialization use this packer.
 */
export function packParametricShapeBankRecord(
  target: Uint32Array,
  offset: number,
  payload: ParametricTemplatePayload,
  cpArenaBaseOffset: number,
  cpArenaLaneStride: number,
  cpArenaComponentStride: number,
): number {
  const { templateValues, indices, vertexCount, indexCount, topologyType, paramStride } = payload;

  // Template t-values start immediately after the 16-word header (relative offset)
  const firstVertex = SHAPE_BANK_HEADER_WORDS;
  // Index payload starts after t-values (relative offset within record)
  const firstIndex = indexCount > 0 ? firstVertex + templateValues.length : 0;
  const totalWords = SHAPE_BANK_HEADER_WORDS + templateValues.length + indices.length;

  // -- 16-word header via ShapeBankHeaderWord enum --
  // [LAW:one-source-of-truth] ShapeBankHeaderWord is the single authority for word offsets.
  target[offset + ShapeBankHeaderWord.Kind] = ShapeClass.Type2Parametric >>> 0;
  target[offset + ShapeBankHeaderWord.TopologyMode] = topologyType >>> 0;
  target[offset + ShapeBankHeaderWord.Flags] = 0;
  target[offset + ShapeBankHeaderWord.MaterialClass] = 0;
  target[offset + ShapeBankHeaderWord.IndexCount] = indexCount >>> 0;
  target[offset + ShapeBankHeaderWord.FirstIndex] = firstIndex >>> 0;
  // Word 6 (BaseVertex) is unused for Type 2 — leave as 0 (zero-initialized by caller)
  target[offset + ShapeBankHeaderWord.VertexCount] = vertexCount >>> 0;
  target[offset + ShapeBankHeaderWord.FirstVertex] = firstVertex >>> 0;
  // Word 9 (ParamBlockOffset) stores ParamStride for Type 2
  target[offset + ShapeBankHeaderWord.ParamBlockOffset] = paramStride >>> 0;
  target[offset + ShapeBankHeaderWord.ParamBlockWords] = 0;
  target[offset + ShapeBankHeaderWord.CpArenaBaseOffset] = cpArenaBaseOffset >>> 0;
  target[offset + ShapeBankHeaderWord.BoundsMinPacked] = 0;
  target[offset + ShapeBankHeaderWord.BoundsMaxPacked] = 0;
  target[offset + ShapeBankHeaderWord.CpArenaLaneStride] = cpArenaLaneStride >>> 0;
  target[offset + ShapeBankHeaderWord.CpArenaComponentStride] = cpArenaComponentStride >>> 0;

  // -- Template t-values (f32 → u32 bit-cast) --
  const templateU32View = new Uint32Array(templateValues.buffer, templateValues.byteOffset, templateValues.length);
  target.set(templateU32View, offset + firstVertex);

  // -- Index payload (u32, only for indexed families) --
  if (indexCount > 0) {
    target.set(indices, offset + firstIndex);
  }

  return totalWords;
}
