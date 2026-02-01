/**
 * ColorCycle Library Composite
 *
 * Generates cycling colors by driving a simple color constant.
 * Simplified version - uses just a constant color output.
 */

import type { CompositeBlockDef } from '../../composite-types';
import { internalBlockId } from '../../composite-types';

/**
 * ColorCycle composite definition.
 * Simplified to use Const block for color output.
 */
export const ColorCycleComposite: CompositeBlockDef = {
  type: 'ColorCycle',
  form: 'composite',
  label: 'Color Cycle',
  category: 'composite',
  capability: 'state', // Phasor is stateful
  description: 'Color output (simplified)',
  readonly: true,

  internalBlocks: new Map([
    [
      internalBlockId('phasor'),
      {
        type: 'Phasor',
        displayName: 'Hue Phase',
      },
    ],
    [
      internalBlockId('color'),
      {
        type: 'Const',
        displayName: 'Color',
        params: { value: [1, 0.5, 0.5, 1] }, // RGBA constant
      },
    ],
  ]),

  internalEdges: [],

  exposedInputs: [
    {
      externalId: 'frequency',
      internalBlockId: internalBlockId('phasor'),
      internalPortId: 'frequency',
      externalLabel: 'Frequency',
    },
  ],

  exposedOutputs: [
    {
      externalId: 'color',
      internalBlockId: internalBlockId('color'),
      internalPortId: 'out',
      externalLabel: 'Color',
    },
    {
      externalId: 'phase',
      internalBlockId: internalBlockId('phasor'),
      internalPortId: 'out',
      externalLabel: 'Phase',
    },
  ],

  inputs: {},
  outputs: {},
};
