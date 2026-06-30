/**
 * src/pillars/scene/blocks/instance-count.ts
 *
 * The bare instance source: N instances at the origin, unrotated, neutral white.
 * It owns *count only* — the one thing a source must decide. Where the instances
 * land, how they turn, and what color they are is each a downstream modifier's
 * single concern.
 *
 * This is the composable base the demo library rests on: a layout (ring,
 * spirograph, kaleidoscope) is a `rank`/`index`→transform *modifier* folded onto
 * this source, not a fresh fused source. Contrast `InstanceGrid`, which welds
 * count+layout+rotation into one block that serves exactly one demo.
 *
 * [LAW:decomposition] Count is this block's whole truth; a layout modifier
 *   downstream supplies placement. The identity transform is the honest base
 *   case (every instance at the origin), replaced by whatever layout folds over
 *   it — not a silent default that hides a missing layout.
 * [LAW:composability] Asks for nothing, does one thing completely: any layout
 *   modifier drops onto it with no negotiation.
 */

import { konst } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const config = {
  count: sceneConfig.positiveInt({ label: 'Count', control: 'integer' }),
} as const;

export const InstanceCountBlock = defineSceneBlock({
  type: 'InstanceCount',
  role: 'instanceSource',
  catalog: {
    displayName: 'Instance Count',
    category: 'instance',
    ports: [{ id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' }],
  },
  config,
  contribute: (config) => ({
    role: 'instanceSource',
    bundle: {
      count: config.count,
      transform: { positionX: konst(0), positionY: konst(0), rotation: konst(0) },
      // Neutral base color; a downstream color block replaces it.
      color: { space: 'rgb', r: konst(1), g: konst(1), b: konst(1) },
    },
  }),
});
