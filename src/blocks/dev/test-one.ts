/**
 * TestOne Block
 *
 * Captures a scalar value for testing (sink block).
 */

import { registerBlock } from '../registry';
import { canonicalType, requireInst, FLOAT } from '../../core/canonical-types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'TestOne',
  label: 'Test One',
  category: 'test',
  description: 'Captures a scalar value for testing (sink block)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const value = inputsById.value;

    if (!value || requireInst(value.type.extent.temporality, 'temporality').kind !== 'continuous') {
      throw new Error('TestOne value input must be one-cardinality');
    }

    // Sink block - no outputs, but needs to evaluate the one-cardinality input
    return {
      outputsById: {},
      effects: {
        // Request evaluation of the input expression (for testing/debugging)
        evalRequests: [{ exprId: value.id as ValueExprId }],
      },
    };
  },
});
