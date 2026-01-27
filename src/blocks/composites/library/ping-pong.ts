/**
 * PingPong Library Composite
 *
 * Generates a triangle wave from 0→1→0 using Phasor and math.
 * Formula: 1 - |2*phase - 1| = triangle wave
 */

import type { CompositeBlockDef } from '../../composite-types';
import { internalBlockId } from '../../composite-types';

/**
 * PingPong composite definition.
 * Phasor → math operations → triangle wave output.
 *
 * The math is: out = 1 - |2*phase - 1|
 * When phase goes 0→1, output goes 0→1→0
 */
export const PingPongComposite: CompositeBlockDef = {
  type: 'PingPong',
  form: 'composite',
  label: 'Ping Pong',
  category: 'composite',
  capability: 'state', // Phasor is stateful
  description: 'Triangle wave (0→1→0) - bouncing animation from Phasor',
  readonly: true,

  internalBlocks: new Map([
    [
      internalBlockId('phasor'),
      {
        type: 'Phasor',
        displayName: 'Phase',
      },
    ],
    [
      internalBlockId('two'),
      {
        type: 'Const',
        displayName: '2',
        params: { value: 2 },
      },
    ],
    [
      internalBlockId('one'),
      {
        type: 'Const',
        displayName: '1',
        params: { value: 1 },
      },
    ],
    [
      internalBlockId('mult'),
      {
        type: 'Multiply',
        displayName: '2 * phase',
      },
    ],
    [
      internalBlockId('sub1'),
      {
        type: 'Subtract',
        displayName: '2*phase - 1',
      },
    ],
    [
      internalBlockId('expr'),
      {
        type: 'Expression',
        displayName: 'abs',
        params: { expression: 'abs(a)' },
      },
    ],
    [
      internalBlockId('sub2'),
      {
        type: 'Subtract',
        displayName: '1 - |...|',
      },
    ],
  ]),

  internalEdges: [
    // Phasor → Multiply (phase * 2)
    {
      fromBlock: internalBlockId('phasor'),
      fromPort: 'out',
      toBlock: internalBlockId('mult'),
      toPort: 'a',
    },
    {
      fromBlock: internalBlockId('two'),
      fromPort: 'out',
      toBlock: internalBlockId('mult'),
      toPort: 'b',
    },
    // Multiply → Subtract (2*phase - 1)
    {
      fromBlock: internalBlockId('mult'),
      fromPort: 'out',
      toBlock: internalBlockId('sub1'),
      toPort: 'a',
    },
    {
      fromBlock: internalBlockId('one'),
      fromPort: 'out',
      toBlock: internalBlockId('sub1'),
      toPort: 'b',
    },
    // Subtract → Expression (abs)
    {
      fromBlock: internalBlockId('sub1'),
      fromPort: 'out',
      toBlock: internalBlockId('expr'),
      toPort: 'a',
    },
    // 1 - |2*phase - 1|
    {
      fromBlock: internalBlockId('one'),
      fromPort: 'out',
      toBlock: internalBlockId('sub2'),
      toPort: 'a',
    },
    {
      fromBlock: internalBlockId('expr'),
      fromPort: 'out',
      toBlock: internalBlockId('sub2'),
      toPort: 'b',
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
      externalId: 'out',
      internalBlockId: internalBlockId('sub2'),
      internalPortId: 'out',
      externalLabel: 'Output',
    },
    {
      externalId: 'phase',
      internalBlockId: internalBlockId('phasor'),
      internalPortId: 'out',
      externalLabel: 'Raw Phase',
    },
  ],

  inputs: {},
  outputs: {},
};
