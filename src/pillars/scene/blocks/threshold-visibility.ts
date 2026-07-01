/**
 * src/pillars/scene/blocks/threshold-visibility.ts
 *
 * A color modifier: show or hide each instance by a threshold over a per-instance
 * field, proving that visibility is a material decision (opacity 0 vs 1), not a
 * domain operation that removes instances. The block names a base color and a
 * `threshold`/`frequency`/`speed` intent; the rgba channel layout and the `step`
 * that turns the field boolean live at the color seam (`thresholdVisibilityBinding`).
 *
 * [LAW:decomposition] Visibility is a color/material concern; placement stays
 *   with the layout modifier upstream. No instance is added or dropped — every
 *   instance is drawn, some at opacity 0.
 * [LAW:dataflow-not-control-flow] Show/hide is the *value* of the alpha channel,
 *   not a branch; the threshold scalar is a uniform every instance reads.
 */

import { defineSceneBlock, sceneConfig } from '../scene-block';
import { bindingColor, thresholdVisibilityBinding } from '../color';

const config = {
  color: sceneConfig.color({ label: 'Color', control: 'color' }),
  threshold: sceneConfig.finiteNumber({ label: 'Threshold', control: 'number' }),
  frequency: sceneConfig.finiteNumber({ label: 'Frequency', control: 'number' }),
  speed: sceneConfig.finiteNumber({ label: 'Speed', control: 'number' }),
} as const;

export const ThresholdVisibilityBlock = defineSceneBlock({
  type: 'ThresholdVisibility',
  role: 'modifier',
  catalog: {
    displayName: 'Threshold Visibility',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({
      ...bundle,
      color: bindingColor(
        thresholdVisibilityBinding(config.color, config.threshold, config.frequency, config.speed),
      ),
    }),
  }),
});
