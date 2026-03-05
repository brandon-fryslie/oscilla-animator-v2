import { registerBlock } from '../registry';
import {
  canonicalType,
  payloadStride,
  withInstance,
  instanceRef,
  requireInst,
  vec4Const,
  unitNone,
  SHAPE,
  INT,
  FLOAT,
  VEC4,
} from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { defaultSource, defaultSourceConst } from '../../types';
import { resolveInputConstant } from '../lower-utils';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_create'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: { kind: 'create', domainType: DOMAIN_CIRCLE },
});

function expectExprInput(
  inputsById: Record<string, ValueRefExpr | undefined>,
  portId: string,
  blockType: string,
): ValueRefExpr {
  const ref = inputsById[portId];
  if (!ref) {
    throw new Error(`${blockType}: missing required input '${portId}'`);
  }
  return ref;
}

export function register(): void {
  registerBlock({
    type: 'FluidSplat',
    label: 'Fluid Splat',
    category: 'fluid',
    description: 'Fluid solver source stage. Seeds state, impulse, and simulation grid settings.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      shape: {
        label: 'Shape',
        type: canonicalType(SHAPE),
        defaultSource: defaultSource('Ellipse', 'shape'),
      },
      count: {
        label: 'Count',
        type: canonicalType(INT),
        defaultValue: 8192,
        defaultSource: defaultSourceConst(8192),
        semantic: 'instanceCount',
        uiHint: { kind: 'slider', min: 256, max: 32768, step: 256 },
      },
      simResolution: {
        label: 'Sim Resolution',
        type: canonicalType(INT),
        defaultValue: 128,
        defaultSource: defaultSourceConst(128),
        uiHint: { kind: 'slider', min: 32, max: 512, step: 32 },
      },
      radius: {
        label: 'Radius',
        type: canonicalType(FLOAT),
        defaultValue: 20,
        defaultSource: defaultSourceConst(20),
        uiHint: { kind: 'slider', min: 2, max: 128, step: 1 },
      },
      strength: {
        label: 'Strength',
        type: canonicalType(FLOAT),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
      },
      centerX: {
        label: 'Center X',
        type: canonicalType(FLOAT),
        defaultValue: 0.5,
        defaultSource: defaultSourceConst(0.5),
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
      centerY: {
        label: 'Center Y',
        type: canonicalType(FLOAT),
        defaultValue: 0.5,
        defaultSource: defaultSourceConst(0.5),
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    },
    outputs: {
      state: {
        label: 'State',
        type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }),
      },
      _simResolution: {
        hidden: true,
        type: canonicalType(INT),
      },
      _radius: {
        hidden: true,
        type: canonicalType(FLOAT),
      },
      _strength: {
        hidden: true,
        type: canonicalType(FLOAT),
      },
      _centerX: {
        hidden: true,
        type: canonicalType(FLOAT),
      },
      _centerY: {
        hidden: true,
        type: canonicalType(FLOAT),
      },
    },
    lower: ({ ctx, inputsById }) => {
      const shapeInput = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'shape', 'FluidSplat');
      if (requireInst(shapeInput.type.extent.cardinality, 'cardinality').kind !== 'one') {
        throw new Error('FluidSplat: shape input must be one-cardinality');
      }

      const countInput = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'count', 'FluidSplat');
      const count = resolveInputConstant(ctx, countInput, 'count', { min: 64, max: 65_536 });

      const simResolution = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'simResolution', 'FluidSplat');
      const radius = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'radius', 'FluidSplat');
      const strength = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'strength', 'FluidSplat');
      const centerX = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'centerX', 'FluidSplat');
      const centerY = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'centerY', 'FluidSplat');

      const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, shapeInput.id);
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error('FluidSplat: failed to resolve created instance declaration');
      }

      const instance = instanceRef(instanceDecl.domainType as string, instanceId as string);
      const stateType = withInstance(ctx.outTypes[0], instance);
      const seedState = ctx.b.constant(vec4Const(0, 0, 0, 0), canonicalType(VEC4));
      const stateField = ctx.b.broadcast(seedState, stateType);

      return {
        outputsById: {
          state: {
            id: stateField,
            slot: undefined,
            type: stateType,
            stride: payloadStride(stateType.payload),
          },
          _simResolution: simResolution,
          _radius: radius,
          _strength: strength,
          _centerX: centerX,
          _centerY: centerY,
        },
        effects: {
          // [LAW:single-enforcer] Fluid parameter slot ownership is declared
          // once at block lowering so GPU pass lowering reads one canonical map.
          slotRequests: [
            { portId: 'state', type: stateType },
            { portId: '_simResolution', type: simResolution.type },
            { portId: '_radius', type: radius.type },
            { portId: '_strength', type: strength.type },
            { portId: '_centerX', type: centerX.type },
            { portId: '_centerY', type: centerY.type },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
