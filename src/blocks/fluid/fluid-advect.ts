import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, FLOAT, VEC4, unitNone } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_advect'), {
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
    type: 'FluidAdvect',
    label: 'Fluid Advect',
    category: 'fluid',
    description: 'Applies advection and dissipation terms to fluid state.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      stateIn: { label: 'State In', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      velocityDissipation: {
        label: 'Velocity Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.992,
        defaultSource: defaultSourceConst(0.992),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9995, step: 0.0005 },
      },
      dyeDissipation: {
        label: 'Dye Dissipation',
        type: canonicalType(FLOAT),
        defaultValue: 0.996,
        defaultSource: defaultSourceConst(0.996),
        uiHint: { kind: 'slider', min: 0.85, max: 0.9999, step: 0.0005 },
      },
      advection: {
        label: 'Advection',
        type: canonicalType(FLOAT),
        defaultValue: 1.0,
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0.1, max: 3, step: 0.01 },
      },
    },
    outputs: {
      state: { label: 'State', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      _velocityDissipation: { hidden: true, type: canonicalType(FLOAT) },
      _dyeDissipation: { hidden: true, type: canonicalType(FLOAT) },
      _advection: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ inputsById }) => {
      const state = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'stateIn', 'FluidAdvect');
      if (requireInst(state.type.extent.cardinality, 'cardinality').kind !== 'many') {
        throw new Error('FluidAdvect: state input must be many-cardinality');
      }
      const velocityDissipation = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'velocityDissipation', 'FluidAdvect');
      const dyeDissipation = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'dyeDissipation', 'FluidAdvect');
      const advection = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'advection', 'FluidAdvect');
      return {
        outputsById: {
          state: {
            id: state.id,
            slot: state.slot,
            type: state.type,
            stride: payloadStride(state.type.payload),
            components: state.components,
          },
          _velocityDissipation: velocityDissipation,
          _dyeDissipation: dyeDissipation,
          _advection: advection,
        },
        effects: {
          slotRequests: [
            { portId: '_velocityDissipation', type: velocityDissipation.type },
            { portId: '_dyeDissipation', type: dyeDissipation.type },
            { portId: '_advection', type: advection.type },
          ],
        },
      };
    },
  });
}
