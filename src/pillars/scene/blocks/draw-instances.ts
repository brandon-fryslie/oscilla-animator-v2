import type { GeometryDef } from '../../../render/scene-plan';
import { assetId as makeAssetId } from '../../../core/ids';
import { defineSceneBlock, sceneConfig, type MaterialShell } from '../scene-block';

const SHAPES = ['rectangle', 'point'] as const;
type Shape = (typeof SHAPES)[number];

const config = {
  // A `rectangle` is sized `size` wide by `size * aspect` tall (aspect 1 is a
  // square, ≠ 1 a bar); a `point` is a round dot of diameter `size`, aspect
  // unused. [LAW:dataflow-not-control-flow]
  shape: sceneConfig.choice(SHAPES, 'rectangle', { label: 'Shape', control: 'select' }),
  size: sceneConfig.positiveNumber({ label: 'Size', control: 'number' }),
  aspect: sceneConfig.ratio(1, { label: 'Aspect (H/W)', control: 'number' }),
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

// [LAW:types-are-the-program] Total over the shape discriminant: adding a shape
//   forces a new arm here, and each arm builds exactly the GeometryDef variant
//   its fields describe. The authoring seam is where a picked option becomes a
//   typed geometry value; downstream never re-decides the shape.
function geometryForShape(shape: Shape, size: number, aspect: number): GeometryDef {
  switch (shape) {
    case 'point':
      return { kind: 'point', size };
    case 'rectangle':
      return { kind: 'rectangle', width: size, height: size * aspect };
    default:
      return assertNever(shape);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] DrawInstances: unhandled shape: ${JSON.stringify(value)}`);
}

export const DrawInstancesBlock = defineSceneBlock({
  type: 'DrawInstances',
  role: 'draw',
  catalog: {
    displayName: 'Draw Instances',
    category: 'draw',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
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
        geometry: geometryForShape(config.shape, config.size, config.aspect),
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
