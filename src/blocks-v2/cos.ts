/**
 * C1 Block: Cos
 *
 * Computes cos(x).
 */

import { registerC1Block } from './index';
import { callBuiltin, litF32 } from '../render/gpu-ir/ir-builders';

registerC1Block('Cos', {
  lower: (ctx) => ({
    kind: 'proxy',
    outputs: {
      out: callBuiltin('cos', [ctx.inputsById.x ?? litF32(0)]),
    },
  }),
});
