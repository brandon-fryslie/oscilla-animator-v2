/**
 * src/pillars/scene/blocks/index.ts
 *
 * The full set of scene blocks the ScenePlan lowering knows how to compile.
 * Adding a block is adding a row here, not editing the lowering.
 */

import type { SceneBlockDefinition } from '../scene-block';
import { InstanceGridBlock } from './instance-grid';
import { WaveOffsetBlock } from './wave-offset';
import { BrightnessBlock } from './brightness';
import { DrawInstancesBlock } from './draw-instances';

export const ALL_SCENE_BLOCKS: readonly SceneBlockDefinition<unknown>[] = [
  InstanceGridBlock as SceneBlockDefinition<unknown>,
  WaveOffsetBlock as SceneBlockDefinition<unknown>,
  BrightnessBlock as SceneBlockDefinition<unknown>,
  DrawInstancesBlock as SceneBlockDefinition<unknown>,
];
