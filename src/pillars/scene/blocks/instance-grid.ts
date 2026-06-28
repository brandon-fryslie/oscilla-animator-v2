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

const config = {
  rows: sceneConfig.positiveInt({ label: 'Rows', control: 'integer' }),
  cols: sceneConfig.positiveInt({ label: 'Columns', control: 'integer' }),
  spacing: sceneConfig.positiveNumber({ label: 'Spacing', control: 'number' }),
  rotationPerIndex: sceneConfig.finiteNumber({ label: 'Rotation per index', control: 'number' }),
  rotationPerTime: sceneConfig.finiteNumber({ label: 'Rotation per time', control: 'number' }),
  huePerTime: sceneConfig.finiteNumber({ label: 'Hue per time', control: 'number' }),
  saturation: sceneConfig.finiteNumber({ label: 'Saturation', control: 'number' }),
  lightness: sceneConfig.finiteNumber({ label: 'Lightness', control: 'number' }),
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
    const rank = intrinsic('rank');
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
        color: {
          space: 'hsl',
          h: add(rank, mul(time, konst(config.huePerTime))),
          s: konst(config.saturation),
          l: konst(config.lightness),
        },
      },
    };
  },
});
