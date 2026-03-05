import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, FLOAT, VEC4, unitNone } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_curl'), {
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
    type: 'FluidCurl',
    label: 'Fluid Curl',
    category: 'fluid',
    description: 'Computes rotational curl influence for the fluid state.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      stateIn: { label: 'State In', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      strength: {
        label: 'Strength',
        type: canonicalType(FLOAT),
        defaultValue: 1.0,
        defaultSource: defaultSourceConst(1.0),
        uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
      },
    },
    outputs: {
      state: { label: 'State', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      _strength: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ inputsById }) => {
      const state = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'stateIn', 'FluidCurl');
      const card = requireInst(state.type.extent.cardinality, 'cardinality');
      if (card.kind !== 'many') {
        throw new Error('FluidCurl: state input must be many-cardinality');
      }
      const strength = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'strength', 'FluidCurl');
      return {
        outputsById: {
          state: {
            id: state.id,
            slot: state.slot,
            type: state.type,
            stride: payloadStride(state.type.payload),
            components: state.components,
          },
          _strength: strength,
        },
        effects: {
          slotRequests: [{ portId: '_strength', type: strength.type }],
        },
      };
    },
  });
}
