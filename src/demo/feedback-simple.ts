/**
 * Simple Feedback Loop Demo
 *
 * Minimal test of UnitDelay feedback functionality.
 * A phase accumulator that increments each frame.
 *
 * Pattern: phase[t] = (phase[t-1] + delta) mod 1
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchFeedbackSimple: PatchBuilder = (b) => {
  // Time root (required)
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 2000,
    periodBMs: 4000,
  }, { role: timeRootRole() });

  // ===========================================================================
  // FEEDBACK ACCUMULATOR
  // ===========================================================================
  // phase[t] = (phase[t-1] + 0.01) mod 1
  // This creates a continuously incrementing phase that wraps at 1.0

  const delta = b.addBlock('Const', { value: 0.005 }); // Increment per frame
  const one = b.addBlock('Const', { value: 1.0 });     // Wrap modulus

  // The feedback loop
  const delay = b.addBlock('UnitDelay', { initialValue: 0 });
  const add = b.addBlock('Add', {});
  const wrap = b.addBlock('Mod', {});

  // delay.out -> add.a (previous phase)
  b.wire(delay, 'out', add, 'a');
  // delta -> add.b (increment)
  b.wire(delta, 'out', add, 'b');
  // add.out -> wrap.a
  b.wire(add, 'out', wrap, 'a');
  // one -> wrap.b
  b.wire(one, 'out', wrap, 'b');
  // wrap.result -> delay.in (feedback!)
  b.wire(wrap, 'result', delay, 'in');

  // ===========================================================================
  // VISUALIZATION: Simple ring that rotates based on accumulated phase
  // ===========================================================================

  // Create array of elements
  const shape = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
  const array = b.addBlock('Array', { count: 12 });
  b.wire(shape, 'shape', array, 'element');

  // Angular position = element index * (2*PI/12) + accumulated phase * 2*PI
  const twoPi = b.addBlock('Const', { value: 6.283185307 });

  // Base angle from array index (evenly distributed)
  const baseAngle = b.addBlock('Multiply', {});
  b.wire(array, 't', baseAngle, 'a');
  b.wire(twoPi, 'out', baseAngle, 'b');

  // Rotation from accumulated phase (broadcast signal to field)
  const phaseBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(wrap, 'result', phaseBroadcast, 'signal');

  const rotationAngle = b.addBlock('Multiply', {});
  b.wire(phaseBroadcast, 'field', rotationAngle, 'a');
  b.wire(twoPi, 'out', rotationAngle, 'b');

  // Total angle = base + rotation
  const totalAngle = b.addBlock('Add', {});
  b.wire(baseAngle, 'out', totalAngle, 'a');
  b.wire(rotationAngle, 'out', totalAngle, 'b');

  // Convert polar to cartesian
  const radius = b.addBlock('Const', { value: 0.3 });
  const radiusBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(radius, 'out', radiusBroadcast, 'signal');

  const pos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(radiusBroadcast, 'field', pos, 'radius');

  // Simple color from array index
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');

  const color = b.addBlock('HsvToRgb', { sat: 0.8, val: 1.0 });
  b.wire(hue, 'hue', color, 'hue');

  // Render
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(shape, 'shape', render, 'shape');
};
