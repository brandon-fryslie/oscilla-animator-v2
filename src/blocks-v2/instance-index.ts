/**
 * C1 Block: InstanceIndex
 *
 * Outputs the compute dispatch thread index as f32.
 * Used for per-instance math in compute passes.
 */

import { registerC1Block } from './index';
import { cast, intrinsic } from '../render/gpu-ir/ir-builders';

registerC1Block('InstanceIndex', {
  lower: () => ({
    kind: 'proxy',
    outputs: {
      out: cast('f32', intrinsic('global_invocation_id.x')),
    },
  }),
});
