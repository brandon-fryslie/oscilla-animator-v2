/**
 * src/pillars/scene/blocks/index.ts
 *
 * The full set of scene blocks the ScenePlan lowering knows how to compile.
 * Adding a block is adding a row here, not editing the lowering.
 */

import type { SceneBlockDefinition } from '../scene-block';
import { ConstantBlock } from './constant';
import { TimeBlock } from './time';
import { AccumulatorBlock } from './accumulator';
import { ScaleBlock } from './scale';
import { OffsetBlock } from './offset';
import { ClampBlock } from './clamp';
import { InstanceGridBlock } from './instance-grid';
import { InstanceCountBlock } from './instance-count';
import { RingLayoutBlock } from './ring-layout';
import { SpirographBlock } from './spirograph';
import { KaleidoscopeBlock } from './kaleidoscope';
import { ScatterBlock } from './scatter';
import { WaveOffsetBlock } from './wave-offset';
import { SolidColorBlock } from './solid-color';
import { GradientBlock } from './gradient';
import { ColorByIndexBlock } from './color-by-index';
import { ColorFromGradientBlock } from './color-from-gradient';
import { ColorCycleBlock } from './color-cycle';
import { BrightnessBlock } from './brightness';
import { ThresholdVisibilityBlock } from './threshold-visibility';
import { DrawInstancesBlock } from './draw-instances';

export const ALL_SCENE_BLOCKS: readonly SceneBlockDefinition<unknown>[] = [
  ConstantBlock as SceneBlockDefinition<unknown>,
  TimeBlock as SceneBlockDefinition<unknown>,
  AccumulatorBlock as SceneBlockDefinition<unknown>,
  ScaleBlock as SceneBlockDefinition<unknown>,
  OffsetBlock as SceneBlockDefinition<unknown>,
  ClampBlock as SceneBlockDefinition<unknown>,
  InstanceGridBlock as SceneBlockDefinition<unknown>,
  InstanceCountBlock as SceneBlockDefinition<unknown>,
  RingLayoutBlock as SceneBlockDefinition<unknown>,
  SpirographBlock as SceneBlockDefinition<unknown>,
  KaleidoscopeBlock as SceneBlockDefinition<unknown>,
  ScatterBlock as SceneBlockDefinition<unknown>,
  WaveOffsetBlock as SceneBlockDefinition<unknown>,
  SolidColorBlock as SceneBlockDefinition<unknown>,
  GradientBlock as SceneBlockDefinition<unknown>,
  ColorByIndexBlock as SceneBlockDefinition<unknown>,
  ColorFromGradientBlock as SceneBlockDefinition<unknown>,
  ColorCycleBlock as SceneBlockDefinition<unknown>,
  BrightnessBlock as SceneBlockDefinition<unknown>,
  ThresholdVisibilityBlock as SceneBlockDefinition<unknown>,
  DrawInstancesBlock as SceneBlockDefinition<unknown>,
];
