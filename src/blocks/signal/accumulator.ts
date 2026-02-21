/**
 * Accumulator Block
 *
 * Accumulates value over time with delta input.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, cardinalityVar } from '../../core/canonical-types';
import { FLOAT, BOOL } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const ACCUMULATOR_CARD = cardinalityVar(cardinalityVarId('accumulator_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Accumulator',
  label: 'Accumulator',
  category: 'signal',
  description: 'Accumulates value over time with delta input',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  inputs: {
    delta: { label: 'Delta', type: inferType(FLOAT, unitVar('accum_U'), { cardinality: ACCUMULATOR_CARD }) },
    reset: { label: 'Reset', type: canonicalType(BOOL, undefined, { cardinality: ACCUMULATOR_CARD }) },
  },
  outputs: {
    value: { label: 'Value', type: inferType(FLOAT, unitVar('accum_U'), { cardinality: ACCUMULATOR_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const delta = inputsById.delta;
    const reset = inputsById.reset;

    if (!delta) {
      throw new Error('Accumulator delta input required');
    }
    if (!reset) {
      throw new Error('Accumulator reset input required');
    }

    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'accumulator');

    // Read current state (symbolic key, no allocation)
    const currentValue = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

    // Compute new value: reset ? 0 : (currentValue + delta)
    const add = ctx.b.opcode(OpCode.Add);
    const zero = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const newValue = zipAuto([currentValue, delta.id], add, outType, ctx.b);

    // Select: reset ? 0 : newValue
    const select = ctx.b.opcode(OpCode.Select);
    const finalValue = zipAuto([reset.id, zero, newValue], select, outType, ctx.b);

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        value: { id: finalValue, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue: 0 },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: finalValue },
        ],
        slotRequests: [
          { portId: 'value', type: outType },
        ],
      },
    };
  },
});
