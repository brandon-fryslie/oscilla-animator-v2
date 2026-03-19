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

const TEMPLATE_SIGNAL_CARD = cardinalityVar(cardinalityVarId('parametric_template_signal'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

const TEMPLATE_VEC2_CARD = cardinalityVar(cardinalityVarId('parametric_template_vec2'), {
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

function ensureMany(
  input: { id: ValueExprId; components?: readonly ValueExprId[] },
  outType: CanonicalType,
  ctx: LowerCtx,
): ValueExprId {
  const expr = ctx.b.getValueExpr(input.id);
  if (!expr) {
    throw new Error(`CubicBezierRibbon2D: missing expression ${String(input.id)} during extent promotion`);
  }
  try {
    requireManyInstance(expr.type);
    return input.id;
  } catch {
    return promoteToMany(input.id, outType, ctx.b, input.components);
  }
}

export function register(): void {
  registerBlock({
    type: 'CubicBezierRibbon2D',
    label: 'Cubic Bezier Ribbon 2D',
    category: 'render',
    description: 'ParametricTemplates render block for an analytical cubic bezier ribbon',
    form: 'primitive',
    capability: 'render',
    gpuVerified: true,
    loweringPurity: 'impure',
    inputs: {
      p0: { label: 'P0', type: inferType(VEC2, unitNone(), { cardinality: TEMPLATE_VEC2_CARD }) },
      p1: { label: 'P1', type: inferType(VEC2, unitNone(), { cardinality: TEMPLATE_VEC2_CARD }) },
      p2: { label: 'P2', type: inferType(VEC2, unitNone(), { cardinality: TEMPLATE_VEC2_CARD }) },
      p3: { label: 'P3', type: inferType(VEC2, unitNone(), { cardinality: TEMPLATE_VEC2_CARD }) },
      thickness: {
        label: 'Thickness',
        type: inferType(FLOAT, unitVar('parametric_template_thickness_u'), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultValue: 0.02,
        defaultSource: defaultSourceConst(0.02),
        uiHint: { kind: 'slider', min: 0.001, max: 0.08, step: 0.001 },
      },
      resolution: {
        label: 'Resolution',
        type: canonicalType(INT),
        defaultValue: 64,
        defaultSource: defaultSourceConst(64),
        uiHint: { kind: 'slider', min: 4, max: 128, step: 1 },
      },
      posX: {
        label: 'Position X',
        type: inferType(FLOAT, unitNone(), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      posY: {
        label: 'Position Y',
        type: inferType(FLOAT, unitNone(), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -1, max: 1, step: 0.01 },
      },
      rot: {
        label: 'Rotation',
        type: inferType(FLOAT, unitNone(), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: -6.28, max: 6.28, step: 0.01 },
      },
      scale: {
        label: 'Scale',
        type: inferType(FLOAT, unitVar('parametric_template_scale_u'), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0.1, max: 2, step: 0.01 },
      },
      color: {
        label: 'Color',
        type: inferType(COLOR, unitOklch(), { cardinality: TEMPLATE_SIGNAL_CARD }),
        defaultSource: defaultSource('Const', 'out', {
          value: { r: 0.08, g: 0.22, b: 0.72, a: 1 },
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
      const thicknessInput = inputsById.thickness;
      const resolutionInput = inputsById.resolution;
      const posXInput = inputsById.posX;
      const posYInput = inputsById.posY;
      const rotInput = inputsById.rot;
      const scaleInput = inputsById.scale;
      const colorInput = inputsById.color;

      if (
        !p0Input || !p1Input || !p2Input || !p3Input || !thicknessInput ||
        !resolutionInput || !posXInput || !posYInput || !rotInput || !scaleInput || !colorInput
      ) {
        throw new Error('CubicBezierRibbon2D: missing required input — normalization bug');
      }

      const instanceId = ctx.inferredInstance !== undefined
        ? ctx.inferredInstance
        : ctx.b.createInstance(DOMAIN_SHAPE, 1, undefined, 'static');
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error(`CubicBezierRibbon2D: instance '${String(instanceId)}' not found in instance registry`);
      }

      const resolution = resolveInputConstant(ctx, resolutionInput, 'resolution', { min: 1, max: 1024 });
      const topologyId = ctx.b.registerTopology(
        {
          params: [],
          parametricTemplate: true,
          family: 'cubicBezierRibbon2D',
          resolution,
          arenaComponentCount: 9,
        },
        `parametric-template-cubic-bezier-ribbon-${resolution}`,
      );

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
      const thicknessField = ensureMany(thicknessInput, scalarFieldType, ctx);

      const posXField = ensureMany(posXInput, scalarFieldType, ctx);
      const posYField = ensureMany(posYInput, scalarFieldType, ctx);
      const positionField = ctx.b.construct([posXField, posYField], positionType);
      const colorField = ensureMany(colorInput, colorType, ctx);
      const scaleField = ensureMany(scaleInput, scaleType, ctx);
      const rotationField = ensureMany(rotInput, rotationType, ctx);

      const shapeRef = ctx.b.shapeRef(
        topologyId,
        [p0Field, p1Field, p2Field, p3Field, thicknessField],
        canonicalType(SHAPE),
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
