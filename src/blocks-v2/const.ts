/**
 * C1 Block: Const
 *
 * Outputs a constant value from config.
 */

import { registerC1Block } from './index';
import { litF32 } from '../render/gpu-ir/ir-builders';

registerC1Block('Const', {
  lower: (ctx) => ({
    kind: 'proxy',
    outputs: {
      out: litF32(typeof ctx.config.value === 'number' ? ctx.config.value : 0),
    },
  }),
});
