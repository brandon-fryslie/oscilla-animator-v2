/**
 * Rigid Vertex Shader — Family A NagaBuilder emission
 *
 * Implements the vertex pulling pipeline for Type 1 (Rigid Stamp) shapes
 * per specs:
 *   - P1-2: Unified GPU Shape Bank Strategy (ShapeHeaderV1, 16-word stride)
 *   - P3-4: WebGPU Render Pass Deep Dive (vertex stage contract)
 *   - Shapes 1: Rigid Stamp Technical Implementation Blueprint
 *
 * [LAW:one-source-of-truth] Buffer bindings and header offsets are defined once
 * here; the Rust Naga shim consumes the structured IR without re-deriving layout.
 *
 * [LAW:no-string-math] No WGSL strings — everything goes through NagaBuilder.
 */

import {
  NagaBuilder,
  NagaScalarKind,
  type BlockContext,
  type ExprHandle,
  type NagaModule,
  type NagaStructField,
} from '../../compiler/ir/naga-emitter';
import { SHAPE_HEADER_STRIDE, ShapeHeaderField } from './ShapeBank';

// =============================================================================
// Binding Layout
// =============================================================================

/** @group(0) @binding(0): arena (f32 storage, read-only) — per-instance data */
const BINDING_ARENA = { group: 0, binding: 0 } as const;

/** @group(0) @binding(1): shape_bank (u32 storage, read-only) — topology */
const BINDING_SHAPE_BANK = { group: 0, binding: 1 } as const;

// =============================================================================
// Per-Instance Arena Layout
//
// Each instance occupies INSTANCE_STRIDE floats in the arena.
// The arena stores shape ID as f32 (bitcast to u32 in shader).
// =============================================================================

export interface RigidInstanceLayout {
  /** Number of f32 words per instance in the arena */
  readonly instanceStride: number;
  /** Offset to shape ID (f32 bitcast to u32) */
  readonly shapeIdOffset: number;
  /** Offset to posX */
  readonly posXOffset: number;
  /** Offset to posY */
  readonly posYOffset: number;
  /** Offset to rotation (radians) */
  readonly rotOffset: number;
  /** Offset to uniform scale */
  readonly scaleOffset: number;
  /** Offset to color R */
  readonly colorROffset: number;
  /** Offset to color G */
  readonly colorGOffset: number;
  /** Offset to color B */
  readonly colorBOffset: number;
  /** Offset to color A */
  readonly colorAOffset: number;
}

/** Default layout: 9 floats per instance */
export const DEFAULT_RIGID_INSTANCE_LAYOUT: RigidInstanceLayout = {
  instanceStride: 9,
  shapeIdOffset: 0,
  posXOffset: 1,
  posYOffset: 2,
  rotOffset: 3,
  scaleOffset: 4,
  colorROffset: 5,
  colorGOffset: 6,
  colorBOffset: 7,
  colorAOffset: 8,
} as const;

// =============================================================================
// Builder
// =============================================================================

const META: BlockContext = { visualBlockId: '__rigid_vertex' };

export interface RigidVertexShaderResult {
  readonly module: NagaModule;
}

/**
 * Build a rigid vertex shader module through NagaBuilder.
 *
 * The shader:
 * 1. Reads instance_index → arena → shapeId
 * 2. Reads ShapeHeaderV1 from shape_bank[shapeId * 16]
 * 3. Fetches indexed vertex position from shape_bank payload
 * 4. Applies per-instance transform (rotate, scale, translate)
 * 5. Outputs clip_position + color
 */
export function buildRigidVertexShader(
  layout: RigidInstanceLayout = DEFAULT_RIGID_INSTANCE_LAYOUT,
): RigidVertexShaderResult {
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
    // Get builtin arguments
    const vIdx = b.functionArgument(0, u32, META);
    const iIdx = b.functionArgument(1, u32, META);

    // Create per-function references to global buffer variables
    // [LAW:one-source-of-truth] These expression handles are the single way to
    // reference buffers in Access expressions within this function scope.
    const arenaRef = b.globalVariableRef(arenaVar, arenaArrayType, META);
    const bankRef = b.globalVariableRef(bankVar, bankArrayType, META);

    // Helper: read f32 from arena[index]
    const readArena = (index: ExprHandle): ExprHandle =>
      b.accessLoad(arenaRef, index, f32, META);

    // Helper: read u32 from shape_bank[index]
    const readBank = (index: ExprHandle): ExprHandle =>
      b.accessLoad(bankRef, index, u32, META);

    // ─── 1. Compute arena base for this instance ───
    const instanceStride = b.literalUint(layout.instanceStride, META);
    const arenaBase = b.mul(iIdx, instanceStride, META);

    // ─── 2. Read shapeId from arena (f32 → bitcast to u32) ───
    const shapeIdAddr = b.add(arenaBase, b.literalUint(layout.shapeIdOffset, META), META);
    const shapeIdF32 = readArena(shapeIdAddr);
    const shapeId = b.castScalar(shapeIdF32, NagaScalarKind.Uint, false, META); // bitcast

    // ─── 3. Read ShapeHeaderV1 from shape_bank ───
    const headerStride = b.literalUint(SHAPE_HEADER_STRIDE, META);
    const headerBase = b.mul(shapeId, headerStride, META);

    // Read indexed topology fields
    const firstIndexAddr = b.add(headerBase, b.literalUint(ShapeHeaderField.FirstIndex, META), META);
    const baseVertexAddr = b.add(headerBase, b.literalUint(ShapeHeaderField.BaseVertex, META), META);

    const firstIndex = readBank(firstIndexAddr);
    const baseVertexU32 = readBank(baseVertexAddr);

    // ─── 4. Fetch local vertex position from indexed topology ───
    // topology_index = shape_bank[firstIndex + v_idx]
    const topologyAddr = b.add(firstIndex, vIdx, META);
    const topologyIndex = readBank(topologyAddr);

    // vertex_index = baseVertex + topologyIndex
    const vertexIndex = b.add(baseVertexU32, topologyIndex, META);

    // Local position: 2 floats per vertex, stored as bitcast u32 in payload
    const two = b.literalUint(2, META);
    const vertexDataBase = b.mul(vertexIndex, two, META);
    const localXU32 = readBank(vertexDataBase);
    const localYAddr = b.add(vertexDataBase, b.literalUint(1, META), META);
    const localYU32 = readBank(localYAddr);

    // Bitcast u32 → f32
    const localX = b.castScalar(localXU32, NagaScalarKind.Float, false, META);
    const localY = b.castScalar(localYU32, NagaScalarKind.Float, false, META);

    // ─── 5. Read per-instance transform from arena ───
    const posX = readArena(b.add(arenaBase, b.literalUint(layout.posXOffset, META), META));
    const posY = readArena(b.add(arenaBase, b.literalUint(layout.posYOffset, META), META));
    const rot = readArena(b.add(arenaBase, b.literalUint(layout.rotOffset, META), META));
    const scale = readArena(b.add(arenaBase, b.literalUint(layout.scaleOffset, META), META));

    // ─── 6. Apply transform: rotate + scale + translate ───
    const cosR = b.cos(rot, META);
    const sinR = b.sin(rot, META);

    // scaled_local = scale * local
    const scaledX = b.mul(scale, localX, META);
    const scaledY = b.mul(scale, localY, META);

    // rotated = [cos*sx - sin*sy, sin*sx + cos*sy]
    const rotX1 = b.mul(cosR, scaledX, META);
    const rotX2 = b.mul(sinR, scaledY, META);
    const rotY1 = b.mul(sinR, scaledX, META);
    const rotY2 = b.mul(cosR, scaledY, META);

    const worldX = b.add(posX, b.sub(rotX1, rotX2, META), META);
    const worldY = b.add(posY, b.add(rotY1, rotY2, META), META);

    // ─── 7. Read color from arena ───
    const colorR = readArena(b.add(arenaBase, b.literalUint(layout.colorROffset, META), META));
    const colorG = readArena(b.add(arenaBase, b.literalUint(layout.colorGOffset, META), META));
    const colorB = readArena(b.add(arenaBase, b.literalUint(layout.colorBOffset, META), META));
    const colorA = readArena(b.add(arenaBase, b.literalUint(layout.colorAOffset, META), META));

    // ─── 8. Premultiply alpha ───
    const premulR = b.mul(colorR, colorA, META);
    const premulG = b.mul(colorG, colorA, META);
    const premulB = b.mul(colorB, colorA, META);

    // ─── 9. Compose output struct ───
    const zero = b.literalFloat(0, META);
    const one = b.literalFloat(1, META);

    const positionVec4 = b.compose(vec4f, [worldX, worldY, zero, one], META);
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
