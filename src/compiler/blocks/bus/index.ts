/**
 * Bus Block
 *
 * Buses are passthrough blocks with multiple lanes (previously called Rails).
 *
 * A Bus is a generic passthrough block that provides named connection points
 * for any signal type. Buses exist to:
 * 1. Provide explicit wiring points in the graph
 * 2. Allow multiple consumers to tap signal sources
 * 3. Make signal flow visible in the editor
 *
 * Bus blocks don't compute anything - they pass through their inputs unchanged.
 * Each output passes through the corresponding input (out_N = in_N).
 * If an input is not connected, the output defaults to 0.
 */

import { registerBlock, portId, sigType, type BlockLower } from '../registry';

// =============================================================================
// Bus - 2-lane signal passthrough
// =============================================================================

const lowerBus: BlockLower = ({ b, inputsById }) => {
  const in0 = inputsById.in_0;
  const in1 = inputsById.in_1;

  // Passthrough: out_N = in_N (or default to 0 if not connected)
  const out0 = in0 || { kind: 'sig' as const, id: b.sigConst(0, sigType('float')), type: sigType('float') };
  const out1 = in1 || { kind: 'sig' as const, id: b.sigConst(0, sigType('float')), type: sigType('float') };

  return { out_0: out0, out_1: out1 };
};

registerBlock({
  kind: 'Bus',
  inputs: [
    { portId: portId('in_0'), type: sigType('float'), optional: true },
    { portId: portId('in_1'), type: sigType('float'), optional: true },
  ],
  outputs: [
    { portId: portId('out_0'), type: sigType('float') },
    { portId: portId('out_1'), type: sigType('float') },
  ],
  lower: lowerBus,
});
