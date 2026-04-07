/**
 * src/pillars/blocks/index.ts
 *
 * Explicit array of every block definition. No side-effect registration —
 * the registry is built from this array as a value passed into normalization.
 */

import type { BlockDefinition } from '../block-api';
import { ParticlePoolBlock } from './particle-pool';
import { ClockBlock } from './clock';
import { ExpressionModifierBlock } from './expression-modifier';
import { DrawBundleBlock } from './draw-bundle';

export const ALL_BLOCKS: readonly BlockDefinition<unknown, unknown>[] = [
  ParticlePoolBlock as BlockDefinition<unknown, unknown>,
  ClockBlock as BlockDefinition<unknown, unknown>,
  ExpressionModifierBlock as BlockDefinition<unknown, unknown>,
  DrawBundleBlock as BlockDefinition<unknown, unknown>,
];
