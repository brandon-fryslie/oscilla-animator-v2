/**
 * ColorCycle Library Composite
 *
 * Generates cycling colors by driving HSV hue with a Phasor.
 * Useful for rainbow effects and color animations.
 */

import type { CompositeBlockDef } from '../../composite-types';
import { internalBlockId } from '../../composite-types';

/**
 * ColorCycle composite definition.
 * Phasor → HSVToColor creates smooth color cycling through the rainbow.
 */
export const ColorCycleComposite: CompositeBlockDef = {
  type: 'ColorCycle',
  form: 'composite',
  label: 'Color Cycle',
  category: 'composite',
  capability: 'state', // Phasor is stateful
  description: 'Rainbow color cycling - Phasor drives hue through HSV',
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
      internalBlockId('saturation'),
      {
        type: 'Const',
        displayName: 'Saturation',
        params: { value: 1 },
      },
    ],
    [
      internalBlockId('value'),
      {
        type: 'Const',
        displayName: 'Value',
        params: { value: 1 },
      },
    ],
    [
      internalBlockId('hsv'),
      {
        type: 'HSVToColor',
        displayName: 'HSV → RGB',
      },
    ],
  ]),

  internalEdges: [
    {
      fromBlock: internalBlockId('phasor'),
      fromPort: 'out',
      toBlock: internalBlockId('hsv'),
      toPort: 'h',
    },
    {
      fromBlock: internalBlockId('saturation'),
      fromPort: 'out',
      toBlock: internalBlockId('hsv'),
      toPort: 's',
    },
    {
      fromBlock: internalBlockId('value'),
      fromPort: 'out',
      toBlock: internalBlockId('hsv'),
      toPort: 'v',
    },
  ],

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
      internalBlockId: internalBlockId('hsv'),
      internalPortId: 'color',
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
