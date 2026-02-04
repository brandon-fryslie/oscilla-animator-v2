/**
 * TestSignal Block
 *
 * Captures a signal value for testing (sink block).
 */

import { registerBlock } from '../registry';
import { canonicalType, requireInst, FLOAT } from '../../core/canonical-types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'TestSignal',
  label: 'Test Signal',
  category: 'test',
  description: 'Captures a signal value for testing (sink block)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const value = inputsById.value;

    if (!value || requireInst(value.type.extent.temporality, 'temporality').kind !== 'continuous') {
      throw new Error('TestSignal value input must be a signal');
    }

    // Sink block - no outputs, but needs to evaluate the signal
    return {
      outputsById: {},
      effects: {
        // Request evaluation of the input signal (for testing/debugging)
        evalRequests: [{ exprId: value.id as ValueExprId }],
      },
    };
  },
});
