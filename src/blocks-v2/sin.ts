/**
 * C1 Block: Sin
 *
 * Computes sin(x).
 */

import { registerC1Block } from './index';
import { callBuiltin, litF32 } from '../render/gpu-ir/ir-builders';

registerC1Block('Sin', {
  lower: (ctx) => ({
    kind: 'proxy',
    outputs: {
      out: callBuiltin('sin', [ctx.inputsById.x ?? litF32(0)]),
    },
  }),
});
