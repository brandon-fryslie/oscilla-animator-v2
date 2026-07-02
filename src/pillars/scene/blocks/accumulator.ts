/**
 * src/pillars/scene/blocks/accumulator.ts
 *
 * The first stateful scene block: a running total. Each frame its value advances
 * by `increment` from where it left off — `next = prev + increment` — so its
 * output depends on prior frames, not just the current time. It owns a
 * renderer-side cell the backend seeds from `init`, advances every frame, and
 * carries across a live reinstall (so a hot edit does not reset the accumulation).
 *
 * It is an *ordinary block*: a scalar output, a routable `increment` knob, and
 * `init` config — the only thing that makes it stateful is that its contribution
 * declares a cell and a recurrence instead of a pure value. Its output is that
 * cell (`state(self)`), so any knob can route from it exactly as from a Constant.
 *
 * [LAW:effects-at-boundaries] `contribute` returns a *description* of the
 *   recurrence (`update`); the renderer closes it at the frame boundary. The block
 *   evaluates nothing.
 * [LAW:one-type-per-behavior] "Stateful" is a property of the contribution (it
 *   owns storage), not a new authoring surface — the block is defined with the
 *   same `defineSceneBlock` as any other.
 */

import { add } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const config = {
  init: sceneConfig.finiteNumber({ label: 'Initial', control: 'number' }),
} as const;

const knobs = {
  increment: { label: 'Increment', default: 0.01 },
} as const;

export const AccumulatorBlock = defineSceneBlock({
  type: 'Accumulator',
  role: 'statefulScalar',
  catalog: {
    displayName: 'Accumulator',
    category: 'signal',
    ports: [{ id: 'value', label: 'Value', direction: 'output', value: 'scalar' }],
  },
  config,
  knobs,
  contribute: (config, inputs) => ({
    role: 'statefulScalar',
    init: config.init,
    // next = prev + increment. `self` is this block's own cell leaf, closed by the
    // assembler; `inputs.increment` is the resolved knob (its config default, or a
    // wired scalar route — a live rate). [LAW:no-ambient-temporal-coupling] the
    // frame boundary owns the step; this is only its rule.
    update: (self) => add(self, inputs.increment),
  }),
});
