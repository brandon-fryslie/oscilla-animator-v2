/**
 * SmoothNoise Library Composite
 *
 * Generates smooth random values by feeding Noise through Lag.
 * Useful for organic, continuous random modulation.
 */

import type { CompositeBlockDef } from '../../composite-types';
import { internalBlockId } from '../../composite-types';

/**
 * SmoothNoise composite definition.
 * Noise → Lag produces smooth, continuous random values.
 */
export const SmoothNoiseComposite: CompositeBlockDef = {
  type: 'SmoothNoise',
  form: 'composite',
  label: 'Smooth Noise',
  category: 'composite',
  capability: 'state', // Lag is stateful
  description: 'Smooth random values - Noise filtered through Lag for organic modulation',
  readonly: true,

  internalBlocks: new Map([
    [
      internalBlockId('noise'),
      {
        type: 'Noise',
        displayName: 'Noise Source',
      },
    ],
    [
      internalBlockId('lag'),
      {
        type: 'Lag',
        displayName: 'Smoothing',
        params: {
          smoothing: 0.9, // Default smoothing (high = slow, low = fast)
        },
      },
    ],
  ]),

  internalEdges: [
    {
      fromBlock: internalBlockId('noise'),
      fromPort: 'out',
      toBlock: internalBlockId('lag'),
      toPort: 'target',
    },
  ],

  exposedInputs: [
    {
      externalId: 'x',
      internalBlockId: internalBlockId('noise'),
      internalPortId: 'x',
      externalLabel: 'X',
    },
    {
      externalId: 'smoothing',
      internalBlockId: internalBlockId('lag'),
      internalPortId: 'smoothing',
      externalLabel: 'Smoothing',
    },
  ],

  exposedOutputs: [
    {
      externalId: 'out',
      internalBlockId: internalBlockId('lag'),
      internalPortId: 'out',
      externalLabel: 'Output',
    },
  ],

  // These will be computed during registration
  inputs: {},
  outputs: {},
};
