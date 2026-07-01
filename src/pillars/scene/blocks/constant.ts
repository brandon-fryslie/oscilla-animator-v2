/**
 * src/pillars/scene/blocks/constant.ts
 *
 * The bare scalar source: a single constant value, routable into any modifier
 * knob. It is also the block a knob's *canonical default source* is made of —
 * an unwired knob compiles to a synthesized `Constant` carrying its config
 * default, so "a value with no wire" and "a value from a placed Constant" are the
 * same shape, never two code paths.
 *
 * [LAW:one-type-per-behavior] The user-placed constant and a knob's synthesized
 *   default are one type — a `scalarSource` yielding `konst(value)`.
 * [LAW:composability] Does one thing, asks for nothing: it fans out to as many
 *   knobs as wire to it.
 */

import { konst } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const config = {
  value: sceneConfig.finiteNumber({ label: 'Value', control: 'number' }),
} as const;

export const ConstantBlock = defineSceneBlock({
  type: 'Constant',
  role: 'scalarSource',
  catalog: {
    displayName: 'Constant',
    category: 'signal',
    ports: [{ id: 'value', label: 'Value', direction: 'output', value: 'scalar' }],
  },
  config,
  contribute: (config) => ({ role: 'scalarSource', value: konst(config.value) }),
});
