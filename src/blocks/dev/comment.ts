/**
 * Comment Block
 *
 * UI-only annotation block for in-graph notes and instructions.
 */

import { registerBlock } from '../registry';
import { canonicalType, FLOAT } from '../../core/canonical-types';

export function register(): void {
  registerBlock({
    type: 'Comment',
    label: 'Comment',
    category: 'test',
    description: 'Non-executing annotation block for graph notes and instructions',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      text: {
        label: 'Text',
        // [LAW:one-source-of-truth] This key is config-only (exposedAsPort: false).
        // The runtime/compiler does not consume it; UI is the sole owner.
        type: canonicalType(FLOAT),
        exposedAsPort: false,
        defaultValue: '',
        uiHint: { kind: 'text' },
      },
    },
    outputs: {},
    lower: () => {
      // [LAW:dataflow-not-control-flow] Lowering always executes and deterministically
      // yields an empty output set for this non-executing annotation block.
      return { outputsById: {} };
    },
  });
}

