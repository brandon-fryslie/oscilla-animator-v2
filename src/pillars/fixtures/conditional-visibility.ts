/**
 * src/pillars/fixtures/conditional-visibility.ts
 *
 * Native replacement for the "Conditional Visibility" demo (DEMO-PATCHES.md §1):
 * a field of points where a single threshold scalar controls which are visible —
 * proving show/hide is opacity (a material decision), not a domain operation that
 * removes instances. Built from native scene blocks: a bare `InstanceCount`
 * source, a `RingLayout` spreading the points, and a `ThresholdVisibility`
 * material modifier whose per-instance alpha is `step(threshold, field)`. As time
 * drifts, the visible arcs sweep around the ring.
 *
 * Chain: InstanceCount(240) → RingLayout → ThresholdVisibility → DrawInstances.
 *
 * Faithful to the architectural claim (boolean per-instance opacity from a
 * threshold over a per-instance field). The original's *noise-driven density*
 * over a scatter layout needs a hash/fract PlanExpr operator and ScatterUV, both
 * out of this slice's vocabulary — captured as a follow-up child ticket.
 *
 * [LAW:dataflow-not-control-flow] Every point is drawn; visibility is the value
 *   of its alpha (0 or 1), never a branch that skips an instance.
 */

import type { PillarPatch } from '../types';

export function makeConditionalVisibilityPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'count', kind: 'generator', type: 'InstanceCount', config: { count: 240 } },
      {
        id: 'ring',
        kind: 'modifier',
        type: 'RingLayout',
        config: { radius: 0.45, angularSpeed: 0 },
      },
      {
        id: 'visibility',
        kind: 'modifier',
        type: 'ThresholdVisibility',
        config: { color: '#38e1c8', threshold: 0.55, frequency: 25, speed: 1.5 },
      },
      {
        id: 'draw',
        kind: 'intent',
        type: 'DrawInstances',
        config: { size: 0.02, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 },
      },
    ],
    edges: [
      { id: 'e0', source: 'count', target: 'ring', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'ring', target: 'visibility', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'visibility', target: 'draw', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
