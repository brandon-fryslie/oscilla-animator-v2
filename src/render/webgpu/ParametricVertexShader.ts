/**
 * Parametric Vertex Shader — Family A NagaBuilder emission
 *
 * Implements the vertex pulling + Bezier evaluation pipeline for Type 2
 * (Parametric Curve / Template Instancing) shapes per specs:
 *   - Shapes 2: The Parametric Curve (Template Instancing)
 *   - P1-2: Unified GPU Shape Bank Strategy (ShapeHeaderV1, 16-word stride)
 *   - P3-4: WebGPU Render Pass Deep Dive (vertex stage contract)
 *
 * Pipeline:
 *   1. instance_index → Arena → 8 control point channels (P0..P3 × X,Y)
 *   2. vertex_index → ShapeBank paramBlock → t-value
 *   3. Evaluate cubic Bezier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 *   4. Compute tangent B'(t) for normal derivation (with epsilon guard)
 *   5. Output clip_position + color
 *
 * [LAW:one-source-of-truth] Buffer bindings, header offsets, and control point
 * layout are defined once here.
 *
 * [LAW:no-string-math] No WGSL strings — everything goes through NagaBuilder.
 *
 * AC 3.1: No dynamic array indexing for control points — each P0_X..P3_Y is
 * a separate named channel at a known Arena offset.
 */

import {
  NagaBuilder,
  NagaScalarKind,
  type BlockContext,
  type ExprHandle,
  type NagaModule,
  type NagaStructField,
} from '../../compiler/ir/naga-emitter';
import { SHAPE_HEADER_STRIDE } from './ShapeBank';

// =============================================================================
// Binding Layout
// =============================================================================

/** @group(0) @binding(0): arena (f32 storage, read-only) — per-instance data */
const BINDING_ARENA = { group: 0, binding: 0 } as const;

/** @group(0) @binding(1): shape_bank (u32 storage, read-only) — topology + t-values */
const BINDING_SHAPE_BANK = { group: 0, binding: 1 } as const;

// =============================================================================
// Per-Instance Arena Layout
//
// Each instance occupies INSTANCE_STRIDE floats in the arena.
// Control points are at fixed offsets — no dynamic array indexing (AC 3.1).
// =============================================================================

export interface ParametricInstanceLayout {
  /** Number of f32 words per instance in the arena */
  readonly instanceStride: number;
  /** Offset to P0.x */
  readonly p0xOffset: number;
  /** Offset to P0.y */
  readonly p0yOffset: number;
  /** Offset to P1.x */
  readonly p1xOffset: number;
  /** Offset to P1.y */
  readonly p1yOffset: number;
  /** Offset to P2.x */
  readonly p2xOffset: number;
  /** Offset to P2.y */
  readonly p2yOffset: number;
  /** Offset to P3.x */
  readonly p3xOffset: number;
  /** Offset to P3.y */
  readonly p3yOffset: number;
  /** Offset to color R */
  readonly colorROffset: number;
  /** Offset to color G */
  readonly colorGOffset: number;
  /** Offset to color B */
  readonly colorBOffset: number;
  /** Offset to color A */
  readonly colorAOffset: number;
}

/** Default layout: 12 floats per instance (8 control point + 4 color) */
export const DEFAULT_PARAMETRIC_INSTANCE_LAYOUT: ParametricInstanceLayout = {
  instanceStride: 12,
  p0xOffset: 0,
  p0yOffset: 1,
  p1xOffset: 2,
  p1yOffset: 3,
  p2xOffset: 4,
  p2yOffset: 5,
  p3xOffset: 6,
  p3yOffset: 7,
  colorROffset: 8,
  colorGOffset: 9,
  colorBOffset: 10,
  colorAOffset: 11,
} as const;

// =============================================================================
// Shape Header Field Offsets (matching ShapeBank.ts ShapeHeaderField)
// =============================================================================

const HEADER_PARAM_BLOCK_OFFSET = 9;

// =============================================================================
// Epsilon for tangent normalization guard (spec §5 pitfall: collinear tangent)
// =============================================================================

const TANGENT_EPSILON = 1e-5;

// =============================================================================
// Builder
// =============================================================================

const META: BlockContext = { visualBlockId: '__parametric_vertex' };

export interface ParametricVertexShaderResult {
  readonly module: NagaModule;
}

/**
 * Build a parametric (cubic Bezier) vertex shader module through NagaBuilder.
 *
 * Evaluates B(t) and B'(t) analytically per vertex, per instance.
 * Control points are read from fixed Arena offsets — no dynamic indexing.
 */
export function buildParametricVertexShader(
  layout: ParametricInstanceLayout = DEFAULT_PARAMETRIC_INSTANCE_LAYOUT,
): ParametricVertexShaderResult {
  const b = new NagaBuilder();

  // -- Shared types --
  const f32 = b.getOrCreateScalarType(NagaScalarKind.Float);
  const u32 = b.getOrCreateScalarType(NagaScalarKind.Uint);
  const vec4f = b.getOrCreateVectorType(4, NagaScalarKind.Float);
  const arenaArrayType = b.getOrCreateArrayType(f32, 'dynamic');
  const bankArrayType = b.getOrCreateArrayType(u32, 'dynamic');

  // -- Output struct --
  const vertexOutputFields: NagaStructField[] = [
    { name: 'position', type: vec4f, builtin: 'position' },
    { name: 'color', type: vec4f, location: 0 },
  ];
  const vertexOutputType = b.getOrCreateStructType('VertexOutput', vertexOutputFields);

  // -- Global buffer bindings --
  const arenaVar = b.declareGlobalVariable(
    'arena', 'storage', 'read',
    BINDING_ARENA.group, BINDING_ARENA.binding,
    arenaArrayType,
  );
  const bankVar = b.declareGlobalVariable(
    'shape_bank', 'storage', 'read',
    BINDING_SHAPE_BANK.group, BINDING_SHAPE_BANK.binding,
    bankArrayType,
  );

  // -- Vertex function --
  b.beginFunction('vertex_main', [
    { name: 'v_idx', type: u32, builtin: 'vertex_index' },
    { name: 'i_idx', type: u32, builtin: 'instance_index' },
  ], vertexOutputType);

  const rootBlock = b.buildBlock(() => {
    const vIdx = b.functionArgument(0, u32, META);
    const iIdx = b.functionArgument(1, u32, META);

    // [LAW:one-source-of-truth] Buffer references for this function scope
    const arenaRef = b.globalVariableRef(arenaVar, arenaArrayType, META);
    const bankRef = b.globalVariableRef(bankVar, bankArrayType, META);

    const readArena = (index: ExprHandle): ExprHandle =>
      b.accessLoad(arenaRef, index, f32, META);
    const readBank = (index: ExprHandle): ExprHandle =>
      b.accessLoad(bankRef, index, u32, META);

    // ─── 1. Compute arena base for this instance ───
    const instanceStride = b.literalUint(layout.instanceStride, META);
    const arenaBase = b.mul(iIdx, instanceStride, META);

    // ─── 2. Read 8 control point channels from Arena (no dynamic indexing) ───
    // [AC 3.1] Each channel is a direct offset read
    const p0x = readArena(b.add(arenaBase, b.literalUint(layout.p0xOffset, META), META));
    const p0y = readArena(b.add(arenaBase, b.literalUint(layout.p0yOffset, META), META));
    const p1x = readArena(b.add(arenaBase, b.literalUint(layout.p1xOffset, META), META));
    const p1y = readArena(b.add(arenaBase, b.literalUint(layout.p1yOffset, META), META));
    const p2x = readArena(b.add(arenaBase, b.literalUint(layout.p2xOffset, META), META));
    const p2y = readArena(b.add(arenaBase, b.literalUint(layout.p2yOffset, META), META));
    const p3x = readArena(b.add(arenaBase, b.literalUint(layout.p3xOffset, META), META));
    const p3y = readArena(b.add(arenaBase, b.literalUint(layout.p3yOffset, META), META));

    // ─── 3. Read shapeId from first arena slot (bitcast f32→u32) ───
    // For parametric, we need the shapeId to find the header → paramBlockOffset.
    // We read the first slot as shapeId. But the layout doesn't have shapeIdOffset...
    // In practice, parametric curves may use a different header lookup.
    // For now, we derive paramBlockOffset from the shape header via instance_index.
    //
    // Actually, since parametric curves use template instancing, the shapeId
    // should be encoded somewhere. For S02, we use a fixed approach:
    // Read shapeId from arena slot 0 if present, OR pass it differently.
    //
    // Since the layout doesn't include shapeIdOffset, we read the header
    // paramBlockOffset from a shape whose ID = 0 (single-shape S02).
    // TODO: When multi-shape support is needed, add shapeIdOffset to layout.

    // For S02, read shape header at index 0 to get paramBlockOffset
    const headerBase = b.literalUint(0, META); // shape 0 header
    const paramBlockAddr = b.add(headerBase, b.literalUint(HEADER_PARAM_BLOCK_OFFSET, META), META);
    const paramBlockOffset = readBank(paramBlockAddr);

    // ─── 4. Read t-value from ShapeBank paramBlock ───
    // t = bitcast<f32>(shape_bank[paramBlockOffset + vertex_index])
    const tAddr = b.add(paramBlockOffset, vIdx, META);
    const tU32 = readBank(tAddr);
    const t = b.castScalar(tU32, NagaScalarKind.Float, false, META); // bitcast u32→f32

    // ─── 5. Evaluate cubic Bezier B(t) ───
    // B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    const one = b.literalFloat(1, META);
    const three = b.literalFloat(3, META);

    const omt = b.sub(one, t, META);                // (1 - t)
    const omt2 = b.mul(omt, omt, META);             // (1 - t)²
    const omt3 = b.mul(omt2, omt, META);            // (1 - t)³
    const t2 = b.mul(t, t, META);                    // t²
    const t3 = b.mul(t2, t, META);                   // t³

    // Bernstein basis coefficients
    const b0 = omt3;                                 // (1-t)³
    const b1 = b.mul(three, b.mul(omt2, t, META), META);   // 3(1-t)²t
    const b2 = b.mul(three, b.mul(omt, t2, META), META);   // 3(1-t)t²
    const b3 = t3;                                   // t³

    // B(t).x = b0*P0x + b1*P1x + b2*P2x + b3*P3x
    const bx = b.add(
      b.add(b.mul(b0, p0x, META), b.mul(b1, p1x, META), META),
      b.add(b.mul(b2, p2x, META), b.mul(b3, p3x, META), META),
      META,
    );
    // B(t).y = b0*P0y + b1*P1y + b2*P2y + b3*P3y
    const by = b.add(
      b.add(b.mul(b0, p0y, META), b.mul(b1, p1y, META), META),
      b.add(b.mul(b2, p2y, META), b.mul(b3, p3y, META), META),
      META,
    );

    // ─── 6. Evaluate tangent B'(t) ───
    // B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
    const six = b.literalFloat(6, META);

    const d01x = b.sub(p1x, p0x, META);  // P1 - P0
    const d01y = b.sub(p1y, p0y, META);
    const d12x = b.sub(p2x, p1x, META);  // P2 - P1
    const d12y = b.sub(p2y, p1y, META);
    const d23x = b.sub(p3x, p2x, META);  // P3 - P2
    const d23y = b.sub(p3y, p2y, META);

    // 3(1-t)²
    const c0 = b.mul(three, omt2, META);
    // 6(1-t)t
    const c1 = b.mul(six, b.mul(omt, t, META), META);
    // 3t²
    const c2 = b.mul(three, t2, META);

    const tangentX = b.add(
      b.add(b.mul(c0, d01x, META), b.mul(c1, d12x, META), META),
      b.mul(c2, d23x, META),
      META,
    );
    const tangentY = b.add(
      b.add(b.mul(c0, d01y, META), b.mul(c1, d12y, META), META),
      b.mul(c2, d23y, META),
      META,
    );

    // ─── 7. Epsilon guard on tangent normalization ───
    // Spec §5: collinear control points → zero tangent → NaN from normalize
    // Fix: tangentLen = sqrt(tx² + ty² + epsilon²)
    const epsilon = b.literalFloat(TANGENT_EPSILON, META);
    const txSq = b.mul(tangentX, tangentX, META);
    const tySq = b.mul(tangentY, tangentY, META);
    const epsSq = b.mul(epsilon, epsilon, META);
    const tangentLenSq = b.add(b.add(txSq, tySq, META), epsSq, META);
    const tangentLen = b.sqrt(tangentLenSq, META);

    // Normalized tangent (safe — tangentLen >= epsilon)
    const normTx = b.div(tangentX, tangentLen, META);
    const normTy = b.div(tangentY, tangentLen, META);

    // Normal = perpendicular to tangent: (-ty, tx)
    // (available for future extrusion; not used in S02 position output)
    void normTx;
    void normTy;

    // ─── 8. Read color from arena ───
    const colorR = readArena(b.add(arenaBase, b.literalUint(layout.colorROffset, META), META));
    const colorG = readArena(b.add(arenaBase, b.literalUint(layout.colorGOffset, META), META));
    const colorB = readArena(b.add(arenaBase, b.literalUint(layout.colorBOffset, META), META));
    const colorA = readArena(b.add(arenaBase, b.literalUint(layout.colorAOffset, META), META));

    // ─── 9. Premultiply alpha ───
    const premulR = b.mul(colorR, colorA, META);
    const premulG = b.mul(colorG, colorA, META);
    const premulB = b.mul(colorB, colorA, META);

    // ─── 10. Compose output struct ───
    const zero = b.literalFloat(0, META);
    const clipOne = b.literalFloat(1, META);

    const positionVec4 = b.compose(vec4f, [bx, by, zero, clipOne], META);
    const colorVec4 = b.compose(vec4f, [premulR, premulG, premulB, colorA], META);

    const output = b.compose(vertexOutputType, [positionVec4, colorVec4], META);
    b.returnStatement(output, META);
  });

  void rootBlock;
  b.endFunction();

  // -- Entry point --
  b.declareEntryPoint('vertex', 'vertex_main', [0, 0, 0]);

  return { module: b.buildModule() };
}
