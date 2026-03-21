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

import { TopologyType } from './types';

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

  const vertexCount = resolution + 1;
  const templateValues = new Float32Array(vertexCount);

  for (let i = 0; i <= resolution; i++) {
    templateValues[i] = i / resolution;
  }

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
 * Pack a ParametricTemplatePayload into ShapeBank words.
 *
 * Returns a Uint32Array containing the 16-word header followed by the
 * template t-values (as f32→u32 bit-cast) and optional index payload.
 *
 * // [LAW:one-source-of-truth] This function is the single producer of
 * // Type 2 ShapeBank records. Both compile-time install and runtime
 * // materialization use this packer.
 */
export function packParametricShapeBankRecord(
  payload: ParametricTemplatePayload,
  cpArenaBaseOffset: number,
  cpArenaLaneStride: number,
  cpArenaComponentStride: number,
): Uint32Array {
  const { templateValues, indices, vertexCount, indexCount, topologyType, paramStride } = payload;

  // Header (16 words) + template t-values + index buffer
  const HEADER_WORDS = 16;
  const firstVertex = HEADER_WORDS; // t-values start immediately after header
  const firstIndex = indexCount > 0 ? firstVertex + templateValues.length : 0;
  const totalWords = HEADER_WORDS + templateValues.length + indices.length;

  const words = new Uint32Array(totalWords);

  // -- 16-word header --
  words[0] = 2; // Kind = Type2Parametric
  words[1] = topologyType; // TopologyType
  words[2] = 0; // Flags (reserved)
  words[3] = 0; // MaterialClass (reserved)
  words[4] = indexCount >>> 0; // IndexCount
  words[5] = firstIndex >>> 0; // FirstIndex (word offset to index payload)
  words[6] = vertexCount >>> 0; // VertexCount
  words[7] = firstVertex >>> 0; // FirstVertex (word offset to t-values, always 16)
  words[8] = 0; // reserved
  words[9] = paramStride >>> 0; // ParamStride (SoA stride)
  words[10] = 0; // ParamBlockWords (reserved)
  words[11] = cpArenaBaseOffset >>> 0; // CpArenaBaseOffset
  words[12] = 0; // BoundsMinPacked (reserved)
  words[13] = 0; // BoundsMaxPacked (reserved)
  words[14] = cpArenaLaneStride >>> 0; // CpArenaLaneStride
  words[15] = cpArenaComponentStride >>> 0; // CpArenaComponentStride

  // -- Template t-values (f32 → u32 bit-cast) --
  const templateU32View = new Uint32Array(templateValues.buffer, templateValues.byteOffset, templateValues.length);
  words.set(templateU32View, firstVertex);

  // -- Index payload (u32, only for indexed families) --
  if (indexCount > 0) {
    words.set(indices, firstIndex);
  }

  return words;
}
