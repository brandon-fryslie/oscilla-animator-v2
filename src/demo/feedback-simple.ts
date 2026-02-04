/**
 * Simple Feedback Loop Demo
 *
 * Demonstrates feedback-driven rotation with VARIABLE SPEED.
 * The rotation accelerates and decelerates - impossible without feedback!
 *
 * Two rings for comparison:
 * - OUTER (cyan): Feedback-driven - speeds up and slows down
 * - INNER (orange): Time-driven - constant speed
 *
 * Watch the outer ring "breathe" while the inner ring stays steady.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchFeedbackSimple: PatchBuilder = (b) => {
  // Time root
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 3000);  // 3s cycle for speed modulation
  b.setPortDefault(time, 'periodBMs', 5000);  // 5s cycle for colors

  // ===========================================================================
  // FEEDBACK ACCUMULATOR WITH VARIABLE SPEED
  // ===========================================================================
  // phase[t] = (phase[t-1] + delta) mod 1
  // delta oscillates between 0.002 and 0.018 (9x speed variation!)

  const one = b.addBlock('Const');
  b.setConfig(one, 'value', 1.0);

  // Speed modulation: base + amplitude * sin(time)
  const speedBase = b.addBlock('Const');
  b.setConfig(speedBase, 'value', 0.01);      // Center speed
  const speedAmplitude = b.addBlock('Const');
  b.setConfig(speedAmplitude, 'value', 0.008); // Variation

  const speedOsc = b.addBlock('Oscillator');
  b.setPortDefault(speedOsc, 'mode', 0);
  b.wire(time, 'phaseA', speedOsc, 'phase');

  const speedVariation = b.addBlock('Multiply');
  b.wire(speedOsc, 'out', speedVariation, 'a');
  b.wire(speedAmplitude, 'out', speedVariation, 'b');

  const delta = b.addBlock('Add');
  b.wire(speedBase, 'out', delta, 'a');
  b.wire(speedVariation, 'out', delta, 'b');

  // The feedback loop
  const delay = b.addBlock('UnitDelay');
  b.setConfig(delay, 'initialValue', 0);
  const accumulate = b.addBlock('Add');
  const wrap = b.addBlock('Modulo');

  b.wire(delay, 'out', accumulate, 'a');      // Previous phase
  b.wire(delta, 'out', accumulate, 'b');       // Variable delta
  b.wire(accumulate, 'out', wrap, 'a');
  b.wire(one, 'out', wrap, 'b');
  b.wire(wrap, 'out', delay, 'in');         // Feedback!

  // ===========================================================================
  // OUTER RING: Feedback-driven (variable speed)
  // ===========================================================================

  const outerShape = b.addBlock('Ellipse');
  b.setPortDefault(outerShape, 'rx', 0.025);
  b.setPortDefault(outerShape, 'ry', 0.025);
  const outerArray = b.addBlock('Array');
  b.setPortDefault(outerArray, 'count', 16);
  b.wire(outerShape, 'shape', outerArray, 'element');

  // Use CircleLayoutUV
  const outerLayout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(outerLayout, 'radius', 0.35);
  b.wire(outerArray, 'elements', outerLayout, 'elements');

  // Color: cyan
  const outerColor = b.addBlock('Const');
  b.setConfig(outerColor, 'value', { r: 0.3, g: 0.9, b: 0.9, a: 1.0 });

  // ===========================================================================
  // INNER RING: Time-driven (constant speed) - for comparison
  // ===========================================================================

  const innerShape = b.addBlock('Ellipse');
  b.setPortDefault(innerShape, 'rx', 0.02);
  b.setPortDefault(innerShape, 'ry', 0.02);
  const innerArray = b.addBlock('Array');
  b.setPortDefault(innerArray, 'count', 12);
  b.wire(innerShape, 'shape', innerArray, 'element');

  // Use CircleLayoutUV
  const innerLayout = b.addBlock('CircleLayoutUV');
  b.setPortDefault(innerLayout, 'radius', 0.18);
  b.wire(innerArray, 'elements', innerLayout, 'elements');

  // Color: orange
  const innerColor = b.addBlock('Const');
  b.setConfig(innerColor, 'value', { r: 1.0, g: 0.6, b: 0.3, a: 1.0 });

  // ===========================================================================
  // RENDER BOTH RINGS
  // ===========================================================================

  const renderOuter = b.addBlock('RenderInstances2D');
  b.wire(outerLayout, 'position', renderOuter, 'pos');
  b.wire(outerColor, 'out', renderOuter, 'color');
  b.wire(outerShape, 'shape', renderOuter, 'shape');

  const renderInner = b.addBlock('RenderInstances2D');
  b.wire(innerLayout, 'position', renderInner, 'pos');
  b.wire(innerColor, 'out', renderInner, 'color');
};
