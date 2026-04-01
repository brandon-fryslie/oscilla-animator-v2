/**
 * C1 Block: InfiniteTimeRoot
 *
 * Declares sys:time as a dynamic global and outputs it.
 */

import { registerC1Block } from './index';
import { loadGlobal } from '../render/gpu-ir/ir-builders';

registerC1Block('InfiniteTimeRoot', {
  manifestRequirements: () => ({
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
    },
  }),
  lower: () => ({
    kind: 'proxy',
    outputs: { time: loadGlobal('sys:time') },
  }),
});
