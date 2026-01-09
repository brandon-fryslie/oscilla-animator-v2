/**
 * Id01 - Normalized element ID
 *
 * Converts an element index and count to a normalized value in [0, 1).
 * Useful for per-element variation that doesn't require randomness.
 *
 * Inputs:
 * - index: Element index
 * - count: Total element count
 *
 * Output:
 * - out: Normalized ID = index / max(count, 1)
 */

import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  sig,
  type BlockLower,
} from '../registry';

const lowerId01: BlockLower = ({ b, inputsById }) => {
  const index = sig(inputsById, 'index');
  const count = sig(inputsById, 'count');

  // Safe division: index / max(count, 1)
  // This prevents division by zero and ensures count=1 returns 0
  const one = b.sigConst(1, sigType('float'));
  const safeCount = b.sigBinOp(count.id, one, OpCode.Max, sigType('float'));
  const normalized = b.sigBinOp(index.id, safeCount, OpCode.Div, sigType('float'));

  return {
    out: { kind: 'sig', id: normalized, type: sigType('float') },
  };
};

registerBlock({
  type: 'Id01',
  inputs: [
    { portId: portId('index'), type: sigType('float') },
    { portId: portId('count'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: lowerId01,
});
