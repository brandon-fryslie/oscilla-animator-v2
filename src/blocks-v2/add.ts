/**
 * C1 Block: Add
 *
 * Computes a + b.
 */

import { registerC1Block } from './index';
import { binop, litF32 } from '../render/gpu-ir/ir-builders';

registerC1Block('Add', {
  lower: (ctx) => ({
    kind: 'proxy',
    outputs: {
      out: binop('+', ctx.inputsById.a ?? litF32(0), ctx.inputsById.b ?? litF32(0)),
    },
  }),
});
