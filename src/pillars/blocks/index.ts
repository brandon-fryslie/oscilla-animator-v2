import type { BlockDefinition } from '../block-api';
import { ParticlePoolBlock } from './particle-pool';
import { ClockBlock } from './clock';
import { ExpressionModifierBlock } from './expression-modifier';
import { DrawBundleBlock } from './draw-bundle';
import { TextureGridBlock } from './texture-grid';
import { MaterializeBlock } from './materialize';

export const ALL_BLOCKS: readonly BlockDefinition<unknown>[] = [
  ParticlePoolBlock as BlockDefinition<unknown>,
  ClockBlock as BlockDefinition<unknown>,
  ExpressionModifierBlock as BlockDefinition<unknown>,
  DrawBundleBlock as BlockDefinition<unknown>,
  TextureGridBlock as BlockDefinition<unknown>,
  MaterializeBlock as BlockDefinition<unknown>,
];
