import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, FLOAT, VEC4, unitNone } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import type { ValueRefExpr } from '../../compiler/ir/lowerTypes';

const FLUID_STATE_CARD = cardinalityVar(cardinalityVarId('fluid_state_pressure'), {
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
    type: 'FluidPressureJacobi',
    label: 'Fluid Pressure Jacobi',
    category: 'fluid',
    description: 'Pressure solve shaping controls for fluid incompressibility.',
    form: 'primitive',
    capability: 'render',
    loweringPurity: 'impure',
    inputs: {
      stateIn: { label: 'State In', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      iterations: {
        label: 'Iterations',
        type: canonicalType(FLOAT),
        defaultValue: 20,
        defaultSource: defaultSourceConst(20),
        uiHint: { kind: 'slider', min: 1, max: 64, step: 1 },
      },
      pressure: {
        label: 'Pressure',
        type: canonicalType(FLOAT),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
      },
    },
    outputs: {
      state: { label: 'State', type: inferType(VEC4, unitNone(), { cardinality: FLUID_STATE_CARD }) },
      _iterations: { hidden: true, type: canonicalType(FLOAT) },
      _pressure: { hidden: true, type: canonicalType(FLOAT) },
    },
    lower: ({ inputsById }) => {
      const state = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'stateIn', 'FluidPressureJacobi');
      if (requireInst(state.type.extent.cardinality, 'cardinality').kind !== 'many') {
        throw new Error('FluidPressureJacobi: state input must be many-cardinality');
      }
      const iterations = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'iterations', 'FluidPressureJacobi');
      const pressure = expectExprInput(inputsById as Record<string, ValueRefExpr | undefined>, 'pressure', 'FluidPressureJacobi');
      return {
        outputsById: {
          state: {
            id: state.id,
            slot: state.slot,
            type: state.type,
            stride: payloadStride(state.type.payload),
            components: state.components,
          },
          _iterations: iterations,
          _pressure: pressure,
        },
        effects: {
          slotRequests: [
            { portId: '_iterations', type: iterations.type },
            { portId: '_pressure', type: pressure.type },
          ],
        },
      };
    },
  });
}
