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

    // Emit a StepEvalValue to force evaluation of this signal
    const slot = ctx.b.allocSlot();
    ctx.b.stepEvalSig(value.id as ValueExprId, slot);

    // Sink block - no outputs
    return {
      outputsById: {},
    };
  },
});
