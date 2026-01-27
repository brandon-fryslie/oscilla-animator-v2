/**
 * DelayedTrigger Library Composite
 *
 * Delays a sample-and-hold trigger by one frame using UnitDelay.
 * Useful for creating chained animations or sequenced events.
 */

import type { CompositeBlockDef } from '../../composite-types';
import { internalBlockId } from '../../composite-types';

/**
 * DelayedTrigger composite definition.
 * SampleHold → UnitDelay creates a 1-frame delayed latch.
 */
export const DelayedTriggerComposite: CompositeBlockDef = {
  type: 'DelayedTrigger',
  form: 'composite',
  label: 'Delayed Trigger',
  category: 'composite',
  capability: 'state', // Both SampleHold and UnitDelay are stateful
  description: 'One-frame delayed sample-and-hold - for sequenced animations',
  readonly: true,

  internalBlocks: new Map([
    [
      internalBlockId('sampleHold'),
      {
        type: 'SampleHold',
        displayName: 'Sample & Hold',
      },
    ],
    [
      internalBlockId('delay'),
      {
        type: 'UnitDelay',
        displayName: '1-Frame Delay',
      },
    ],
  ]),

  internalEdges: [
    {
      fromBlock: internalBlockId('sampleHold'),
      fromPort: 'out',
      toBlock: internalBlockId('delay'),
      toPort: 'in',
    },
  ],

  exposedInputs: [
    {
      externalId: 'value',
      internalBlockId: internalBlockId('sampleHold'),
      internalPortId: 'value',
      externalLabel: 'Value',
    },
    {
      externalId: 'trigger',
      internalBlockId: internalBlockId('sampleHold'),
      internalPortId: 'trigger',
      externalLabel: 'Trigger',
    },
  ],

  exposedOutputs: [
    {
      externalId: 'out',
      internalBlockId: internalBlockId('delay'),
      internalPortId: 'out',
      externalLabel: 'Output (Delayed)',
    },
    {
      externalId: 'immediate',
      internalBlockId: internalBlockId('sampleHold'),
      internalPortId: 'out',
      externalLabel: 'Immediate',
    },
  ],

  inputs: {},
  outputs: {},
};
