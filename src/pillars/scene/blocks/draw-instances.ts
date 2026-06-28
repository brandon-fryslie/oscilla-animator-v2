import { assetId as makeAssetId } from '../../../core/ids';
import { defineSceneBlock, sceneConfig, type MaterialShell } from '../scene-block';

const config = {
  size: sceneConfig.positiveNumber({ label: 'Size', control: 'number' }),
  cameraHalfExtentX: sceneConfig.positiveNumber({
    label: 'Camera half extent X',
    control: 'number',
  }),
  cameraHalfExtentY: sceneConfig.positiveNumber({
    label: 'Camera half extent Y',
    control: 'number',
  }),
  textureAssetId: sceneConfig.optionalAssetId({ label: 'Texture asset', control: 'asset' }),
} as const;

export const DrawInstancesBlock = defineSceneBlock({
  type: 'DrawInstances',
  role: 'draw',
  catalog: {
    displayName: 'Draw Instances',
    category: 'draw',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'draw', label: 'Draw', direction: 'output', value: 'materialShell' },
    ],
  },
  config,
  contribute: (config) => {
    const material: MaterialShell =
      config.textureAssetId === undefined
        ? { kind: 'unlitColor' }
        : { kind: 'texturedUnlit', assetId: makeAssetId(config.textureAssetId) };

    return {
      role: 'draw',
      shell: {
        geometry: { kind: 'rectangle', width: config.size, height: config.size },
        material,
        camera: {
          kind: 'orthographic',
          halfExtentX: config.cameraHalfExtentX,
          halfExtentY: config.cameraHalfExtentY,
        },
        target: 'previewCanvas',
      },
    };
  },
});
