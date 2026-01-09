/**
 * Rail Block
 *
 * Rails are buses. Buses are blocks.
 *
 * A Rail is a generic passthrough block that provides a named connection point
 * for any signal type. Rails exist to:
 * 1. Provide explicit wiring points in the graph
 * 2. Allow multiple consumers to tap a single signal source
 * 3. Make signal flow visible in the editor
 *
 * Rail blocks don't compute anything - they pass through their input unchanged.
 * The signal type is determined by what's connected to the input.
 */

import { registerBlock, portId, sigType, eventType, type BlockLower } from '../registry';

// =============================================================================
// Rail - Generic signal passthrough
// =============================================================================

const lowerRail: BlockLower = ({ b, inputsById }) => {
  const input = inputsById.in;

  // If connected, pass through unchanged
  if (input) {
    return { out: input };
  }

  // If not connected, provide a default float signal (0.0)
  // The actual type will be inferred from downstream connections
  const defaultValue = b.sigConst(0, sigType('float'));
  return { out: { kind: 'sig', id: defaultValue, type: sigType('float') } };
};

registerBlock({
  kind: 'Rail',
  inputs: [{ portId: portId('in'), type: sigType('float'), optional: true }],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: lowerRail,
});
