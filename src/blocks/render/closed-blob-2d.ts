/**
 * ClosedBlob2D Block
 *
 * Type 2 Parametric render block: a centroid-anchored triangle fan topology
 * for morphing closed blob/tile shapes evaluated on the GPU.
 *
 * Uses the same cubic Bézier control-point interface as CubicBezierRibbon2D
 * (p0–p3), but generates a closed triangle fan instead of a ribbon strip.
 * The vertex shader averages p0–p3 for the centroid and evaluates the shared
 * hardened Bézier for perimeter vertices.
 *
 * Follows the WebGPUType1Sink hidden-output pattern: scalar inputs are
 * promoted to field extent in lowering, and the render materialization
 * pipeline reads the hidden _position/_color/_scale/_rotation/_shape outputs.
 */

import { registerBlock } from '../registry';
import {
  canonicalManyDef,
  canonicalType,
  payloadStride,
  type CanonicalType,
  requireManyInstance,
  unitNone,
  unitOklch,
  withInstance,
  COLOR,
  FLOAT,
  INT,
  SHAPE,
  VEC2,
} from '../../core/canonical-types';
import { inferType, cardinalityVar, unitVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { DOMAIN_SHAPE } from '../../core/domain-registry';
import { defaultSource, defaultSourceConst } from '../../types';
import type { LowerCtx } from '../registry';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { promoteToMany, resolveInputConstant } from '../lower-utils';
import { buildClosedBlobTemplate } from '../../shapes/parametric-templates';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const BLOB_SIGNAL_CARD = cardinalityVar(cardinalityVarId('closed_blob_signal'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

const BLOB_VEC2_CARD = cardinalityVar(cardinalityVarId('closed_blob_vec2'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

const BLOB_COLOR_CARD = cardinalityVar(cardinalityVarId('closed_blob_color'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

/**
 * Ensure an input expression has field extent (cardinality many).
 * If already many, returns the input directly. Otherwise broadcasts.
 */
function ensureMany(
  input: { id: ValueExprId; components?: readonly ValueExprId[] },
  outType: CanonicalType,
  ctx: LowerCtx,
): ValueExprId {
  const expr = ctx.b.getValueExpr(input.id);
  try {
    requireManyInstance(expr.type);
    return input.id;
  } catch {
    return promoteToMany(input.id, outType, ctx.b, input.components);
  }
}

export function register(): void {
  registerBlock({
    type: 'ClosedBlob2D',
    label: 'Closed Blob 2D',
    category: 'render',
    description: 'Parametric render block for a centroid-anchored morphing blob shape',
    form: 'primitive',
    capability: 'render',
    gpuVerified: true,
    loweringPurity: 'impure',
    inputs: {
      p0: { label: 'P0', type: inferType(VEC2, unitNone(), { cardinality: BLOB_VEC2_CARD }) },
      p1: { label: 'P1', type: inferType(VEC2, unitNone(), { cardinality: BLOB_VEC2_CARD }) },
      p2: { label: 'P2', type: inferType(VEC2, unitNone(), { cardinality: BLOB_VEC2_CARD }) },
      p3: { label: 'P3', type: inferType(VEC2, unitNone(), { cardinality: BLOB_VEC2_CARD }) },
      resolution: {
        label: 'Resolution',
        type: canonicalType(INT),
        defaultValue: 32,
        defaultSource: defaultSourceConst(32),
        uiHint: { kind: 'slider', min: 3, max: 128, step: 1 },
      },
      posX: {
        label: 'Position X',
        type: inferType(FLOAT, unitNone(), { cardinality: BLOB_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      posY: {
        label: 'Position Y',
        type: inferType(FLOAT, unitNone(), { cardinality: BLOB_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      rot: {
        label: 'Rotation',
        type: inferType(FLOAT, unitNone(), { cardinality: BLOB_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -6.28, max: 6.28, step: 0.01 },
      },
      scale: {
        label: 'Scale',
        type: inferType(FLOAT, unitVar('closed_blob_scale_u'), { cardinality: BLOB_SIGNAL_CARD }),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0.1, max: 2, step: 0.01 },
      },
      color: {
        label: 'Color',
        type: inferType(COLOR, unitOklch(), { cardinality: BLOB_COLOR_CARD }),
        defaultSource: defaultSource('Const', 'out', {
          value: { r: 0.35, g: 0.65, b: 0.25, a: 1 },
        }),
        uiHint: { kind: 'color' },
      },
    },
    outputs: {
      _position: { hidden: true, type: canonicalManyDef(VEC2, unitNone()) },
      _color: { hidden: true, type: canonicalManyDef(COLOR, unitOklch()) },
      _scale: { hidden: true, type: canonicalManyDef(FLOAT, unitNone()) },
      _rotation: { hidden: true, type: canonicalManyDef(FLOAT, unitNone()) },
      _shape: { hidden: true, type: canonicalManyDef(SHAPE, unitNone()) },
    },
    lower: ({ ctx, inputsById }) => {
      const p0Input = inputsById.p0;
      const p1Input = inputsById.p1;
      const p2Input = inputsById.p2;
      const p3Input = inputsById.p3;
      const resolutionInput = inputsById.resolution;
      const posXInput = inputsById.posX;
      const posYInput = inputsById.posY;
      const rotInput = inputsById.rot;
      const scaleInput = inputsById.scale;
      const colorInput = inputsById.color;

      if (
        !p0Input || !p1Input || !p2Input || !p3Input ||
        !resolutionInput || !posXInput || !posYInput || !rotInput || !scaleInput || !colorInput
      ) {
        throw new Error('ClosedBlob2D: missing required input — normalization bug');
      }

      const instanceId = ctx.inferredInstance !== undefined
        ? ctx.inferredInstance
        : ctx.b.createInstance(DOMAIN_SHAPE, 1, undefined, 'static');
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error(`ClosedBlob2D: instance '${String(instanceId)}' not found in instance registry`);
      }

      const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 3, max: 1024 });

      // Register topology — the parametric template payload on the shapeRef
      // carries the actual template data for the install contract.
      const topologyId = ctx.b.registerTopology(
        { params: [] },
        `parametric-template-closed-blob-${resolution}`,
      );

      // Build the closed blob template payload (centroid + perimeter fan).
      // paramStride = 8: p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y
      // (no thickness — blob fills the interior)
      const parametricTemplate = buildClosedBlobTemplate(resolution, 8);

      const instance = { domainTypeId: instanceDecl.domainType, instanceId };
      const positionType = withInstance(ctx.outTypes[0], instance);
      const colorType = withInstance(ctx.outTypes[1], instance);
      const scaleType = withInstance(ctx.outTypes[2], instance);
      const rotationType = withInstance(ctx.outTypes[3], instance);
      const shapeType = withInstance(ctx.outTypes[4], instance);

      const vec2FieldType = withInstance(canonicalManyDef(VEC2, unitNone()), instance);
      const scalarFieldType = withInstance(canonicalManyDef(FLOAT, unitNone()), instance);

      const p0Field = ensureMany(p0Input, vec2FieldType, ctx);
      const p1Field = ensureMany(p1Input, vec2FieldType, ctx);
      const p2Field = ensureMany(p2Input, vec2FieldType, ctx);
      const p3Field = ensureMany(p3Input, vec2FieldType, ctx);

      const posXField = ensureMany(posXInput, scalarFieldType, ctx);
      const posYField = ensureMany(posYInput, scalarFieldType, ctx);
      const positionField = ctx.b.construct([posXField, posYField], positionType);
      // [LAW:dataflow-not-control-flow] ensureMany handles both one and many color
      // inputs identically — no conditional path for scalar workarounds.
      const colorField = ensureMany(colorInput, colorType, ctx);
      const scaleField = ensureMany(scaleInput, scaleType, ctx);
      const rotationField = ensureMany(rotInput, rotationType, ctx);

      // [LAW:one-source-of-truth] Only 4 control-point fields for blob (no thickness).
      const shapeRef = ctx.b.shapeRef(
        topologyId,
        [p0Field, p1Field, p2Field, p3Field],
        canonicalType(SHAPE),
        undefined,
        parametricTemplate,
      );
      const shapeField = promoteToMany(shapeRef, shapeType, ctx.b);

      return {
        outputsById: {
          _position: {
            id: positionField,
            slot: undefined,
            type: positionType,
            stride: payloadStride(positionType.payload),
          },
          _color: {
            id: colorField,
            slot: undefined,
            type: colorType,
            stride: payloadStride(colorType.payload),
            components: colorInput.components,
          },
          _scale: {
            id: scaleField,
            slot: undefined,
            type: scaleType,
            stride: payloadStride(scaleType.payload),
          },
          _rotation: {
            id: rotationField,
            slot: undefined,
            type: rotationType,
            stride: payloadStride(rotationType.payload),
          },
          _shape: {
            id: shapeField,
            slot: undefined,
            type: shapeType,
            stride: payloadStride(shapeType.payload),
          },
        },
        effects: {
          slotRequests: [
            { portId: '_position', type: positionType },
            { portId: '_color', type: colorType },
            { portId: '_scale', type: scaleType },
            { portId: '_rotation', type: rotationType },
            { portId: '_shape', type: shapeType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
