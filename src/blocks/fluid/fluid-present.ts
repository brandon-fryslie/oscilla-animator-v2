import { registerBlock } from '../registry';
import {
  canonicalType,
  payloadStride,
  withInstance,
  requireInst,
  vec2Const,
  colorConst,
  unitNone,
  unitHsl,
  VEC4,
  VEC2,
  COLOR,
  FLOAT,
} from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_present'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

const FLUID_OUTPUT_CARD = cardinalityVar(cardinalityVarId('fluid_outputs_present'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

function expectExprInput(inputsById: Record<string, ValueRefExpr | undefined>, portId: string, blockType: string): ValueRefExpr {
  const ref = inputsById[portId];
  if (!ref) throw new Error(`${blockType}: missing required input '${portId}'`);
  return ref;
}

export function register(): void {
  registerBlock({
    type: 'FluidPresent',
    label: 'Fluid Present',
    category: 'fluid',
    description: 'Converts fluid state into RenderInstances2D control points and color.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      state: { label: 'State', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      particleScale: {
        label: 'Particle Scale',
        type: canonicalType(FLOAT),
        defaultValue: 0.02,
        defaultSource: defaultSourceConst(0.02),
        uiHint: { kind: 'slider', min: 0.001, max: 0.08, step: 0.001 },
      },
      colorGain: {
        label: 'Color Gain',
        type: canonicalType(FLOAT),
        defaultValue: 1.0,
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0.1, max: 2.5, step: 0.01 },
      },
    },
    outputs: {
      controlPoints: { label: 'Control Points', type: inferType(VEC2, unitNone(), { cardinality: FLUID_OUTPUT_CARD }) },
      color: { label: 'Color', type: inferType(COLOR, unitHsl(), { cardinality: FLUID_OUTPUT_CARD }) },
      _particleScale: { hidden: true, type: canonicalType(FLOAT) },
      _colorGain: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ ctx, inputsById }) => {
      const state = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'state', 'FluidPresent');
      const card = requireInst(state.type.extent.cardinality, 'cardinality');
      if (card.kind !== 'many') {
        throw new Error('FluidPresent: state input must be many-cardinality');
      }
      const particleScale = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'particleScale', 'FluidPresent');
      const colorGain = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'colorGain', 'FluidPresent');

      const controlPointsType = withInstance(ctx.outTypes[0], card.instance);
      const colorType = withInstance(ctx.outTypes[1], card.instance);
      const defaultControl = ctx.b.constant(vec2Const(0.5, 0.5), canonicalType(VEC2));
      const defaultColor = ctx.b.constant(colorConst(0.1, 0.2, 0.95, 1.0), canonicalType(COLOR, unitHsl()));
      const controlField = ctx.b.broadcast(defaultControl, controlPointsType);
      const colorField = ctx.b.broadcast(defaultColor, colorType);

      return {
        outputsById: {
          controlPoints: {
            id: controlField,
            slot: undefined,
            type: controlPointsType,
            stride: payloadStride(controlPointsType.payload),
          },
          color: {
            id: colorField,
            slot: undefined,
            type: colorType,
            stride: payloadStride(colorType.payload),
          },
          _particleScale: particleScale,
          _colorGain: colorGain,
        },
        effects: {
          slotRequests: [
            { portId: 'controlPoints', type: controlPointsType },
            { portId: 'color', type: colorType },
            { portId: '_particleScale', type: particleScale.type },
            { portId: '_colorGain', type: colorGain.type },
          ],
        },
      };
    },
  });
}
