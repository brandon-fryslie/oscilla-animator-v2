/**
 * src/pillars/scene/blocks/instance-grid.ts
 *
 * An instance source: a rows×cols grid of instances, each placed by index and
 * rotating over time. It owns *placement only* — count and per-instance
 * transform. Color is a separate concern set downstream by a color block
 * (SolidColor and the richer color ops), so this block's API names no color
 * channels.
 *
 * [LAW:decomposition] Instancing and color are different parts: this block
 *   decides where instances are and how they turn; what color they are is
 *   another block's single concern. The base bundle carries a neutral white so a
 *   grid renders before any color block is wired, and the color block replaces
 *   it — white is the identity, not a silent fallback.
 */

import {
  add,
  div,
  floor,
  input,
  intrinsic,
  konst,
  mod,
  mul,
} from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';
import { neutralColorPlan } from '../color';

const config = {
  rows: sceneConfig.positiveInt({ label: 'Rows', control: 'integer' }),
  cols: sceneConfig.positiveInt({ label: 'Columns', control: 'integer' }),
  spacing: sceneConfig.positiveNumber({ label: 'Spacing', control: 'number' }),
  rotationPerIndex: sceneConfig.finiteNumber({ label: 'Rotation per index', control: 'number' }),
  rotationPerTime: sceneConfig.finiteNumber({ label: 'Rotation per time', control: 'number' }),
} as const;

export const InstanceGridBlock = defineSceneBlock({
  type: 'InstanceGrid',
  role: 'instanceSource',
  catalog: {
    displayName: 'Instance Grid',
    category: 'instance',
    ports: [
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => {
    const index = intrinsic('index');
    const time = input('time');
    const col = mod(index, konst(config.cols));
    const row = floor(div(index, konst(config.cols)));

    return {
      role: 'instanceSource',
      bundle: {
        count: config.rows * config.cols,
        transform: {
          positionX: mul(col, konst(config.spacing)),
          positionY: mul(row, konst(config.spacing)),
          rotation: add(
            mul(index, konst(config.rotationPerIndex)),
            mul(time, konst(config.rotationPerTime)),
          ),
        },
        // Neutral base color; a downstream color block replaces it.
        color: neutralColorPlan(),
      },
    };
  },
});
