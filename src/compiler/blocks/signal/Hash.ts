/**
 * Hash - Deterministic hash function
 *
 * Converts a value and optional seed to a pseudo-random number in [0, 1).
 * Uses xxHash-style mixing for good distribution.
 *
 * Inputs:
 * - value: Value to hash
 * - seed: Optional seed (default: 0)
 *
 * Output:
 * - out: Hash result in [0, 1)
 */

import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  sig,
  type BlockLower,
} from '../registry';

const lowerHash: BlockLower = ({ b, inputsById }) => {
  const value = sig(inputsById, 'value');

  // Optional seed input - defaults to 0 if not connected
  const seedInput = inputsById.seed;
  let seedId;
  if (seedInput && seedInput.kind === 'sig') {
    seedId = seedInput.id;
  } else {
    seedId = b.sigConst(0, sigType('float'));
  }

  const hashId = b.sigBinOp(value.id, seedId, OpCode.Hash, sigType('float'));

  return {
    out: { kind: 'sig', id: hashId, type: sigType('float') },
  };
};

registerBlock({
  kind: 'Hash',
  inputs: [
    { portId: portId('value'), type: sigType('float') },
    { portId: portId('seed'), type: sigType('float'), optional: true },
  ],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: lowerHash,
});
