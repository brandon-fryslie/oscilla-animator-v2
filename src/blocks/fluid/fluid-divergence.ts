import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, FLOAT, VEC4, unitNone } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_divergence'), {
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
    type: 'FluidDivergence',
    label: 'Fluid Divergence',
    category: 'fluid',
    description: 'Computes divergence damping term for incompressibility correction.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      stateIn: { label: 'State In', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      damping: {
        label: 'Damping',
        type: canonicalType(FLOAT),
        defaultValue: 0.24,
        defaultSource: defaultSourceConst(0.24),
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.005 },
      },
    },
    outputs: {
      state: { label: 'State', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      _damping: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ inputsById }) => {
      const state = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'stateIn', 'FluidDivergence');
      if (requireInst(state.type.extent.cardinality, 'cardinality').kind !== 'many') {
        throw new Error('FluidDivergence: state input must be many-cardinality');
      }
      const damping = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'damping', 'FluidDivergence');
      return {
        outputsById: {
          state: {
            id: state.id,
            slot: state.slot,
            type: state.type,
            stride: payloadStride(state.type.payload),
            components: state.components,
          },
          _damping: damping,
        },
        effects: {
          slotRequests: [{ portId: '_damping', type: damping.type }],
        },
      };
    },
  });
}
