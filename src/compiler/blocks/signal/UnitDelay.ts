/**
 * UnitDelay - Unit delay (z^-1)
 *
 * Delays a signal by one frame, implementing y(t) = x(t-1).
 * This is the foundational building block for all feedback systems.
 *
 * Initial state: 0.0
 * Reads previous frame's value, writes current frame's value for next frame.
 *
 * Inputs:
 * - in: Signal to delay
 *
 * Output:
 * - out: Delayed signal (value from previous frame)
 */

import {
  registerBlock,
  portId,
  sigType,
  sig,
  type BlockLower,
} from '../registry';

const lowerUnitDelay: BlockLower = ({ b, inputsById }) => {
  const input = sig(inputsById, 'in');

  // Allocate persistent state slot (initialized to 0)
  const stateSlot = b.allocStateSlot(0);

  // Read previous value FIRST (from last frame)
  const prevId = b.sigStateRead(stateSlot, sigType('float'));

  // Schedule write of current input for end of frame
  // This write happens AFTER the read, ensuring proper delay semantics
  b.stepStateWrite(stateSlot, input.id);

  return {
    out: { kind: 'sig', id: prevId, type: sigType('float') },
  };
};

registerBlock({
  kind: 'UnitDelay',
  inputs: [{ portId: portId('in'), type: sigType('float') }],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: lowerUnitDelay,
});
