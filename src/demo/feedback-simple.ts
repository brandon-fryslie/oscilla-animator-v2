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
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 3000,  // 3s cycle for speed modulation
    periodBMs: 5000,  // 5s cycle for colors
  }, { role: timeRootRole() });

  // ===========================================================================
  // FEEDBACK ACCUMULATOR WITH VARIABLE SPEED
  // ===========================================================================
  // phase[t] = (phase[t-1] + delta) mod 1
  // delta oscillates between 0.002 and 0.018 (9x speed variation!)

  const one = b.addBlock('Const', { value: 1.0 });

  // Speed modulation: base + amplitude * sin(time)
  const speedBase = b.addBlock('Const', { value: 0.01 });      // Center speed
  const speedAmplitude = b.addBlock('Const', { value: 0.008 }); // Variation

  const speedOsc = b.addBlock('Oscillator', { waveform: 'oscSin' });
  b.wire(time, 'phaseA', speedOsc, 'phase');

  const speedVariation = b.addBlock('Multiply', {});
  b.wire(speedOsc, 'out', speedVariation, 'a');
  b.wire(speedAmplitude, 'out', speedVariation, 'b');

  const delta = b.addBlock('Add', {});
  b.wire(speedBase, 'out', delta, 'a');
  b.wire(speedVariation, 'out', delta, 'b');

  // The feedback loop
  const delay = b.addBlock('UnitDelay', { initialValue: 0 });
  const accumulate = b.addBlock('Add', {});
  const wrap = b.addBlock('Mod', {});

  b.wire(delay, 'out', accumulate, 'a');      // Previous phase
  b.wire(delta, 'out', accumulate, 'b');       // Variable delta
  b.wire(accumulate, 'out', wrap, 'a');
  b.wire(one, 'out', wrap, 'b');
  b.wire(wrap, 'result', delay, 'in');         // Feedback!

  // ===========================================================================
  // OUTER RING: Feedback-driven (variable speed)
  // ===========================================================================

  const outerShape = b.addBlock('Ellipse', { rx: 0.025, ry: 0.025 });
  const outerArray = b.addBlock('Array', { count: 16 });
  b.wire(outerShape, 'shape', outerArray, 'element');

  const twoPi = b.addBlock('Const', { value: 6.283185307 });

  // Base angle from array index
  const outerBaseAngle = b.addBlock('Multiply', {});
  b.wire(outerArray, 't', outerBaseAngle, 'a');
  b.wire(twoPi, 'out', outerBaseAngle, 'b');

  // Rotation from accumulated phase (broadcast to field)
  const outerPhaseBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(wrap, 'result', outerPhaseBroadcast, 'signal');

  const outerRotation = b.addBlock('Multiply', {});
  b.wire(outerPhaseBroadcast, 'field', outerRotation, 'a');
  b.wire(twoPi, 'out', outerRotation, 'b');

  const outerTotalAngle = b.addBlock('Add', {});
  b.wire(outerBaseAngle, 'out', outerTotalAngle, 'a');
  b.wire(outerRotation, 'out', outerTotalAngle, 'b');

  // Position
  const outerRadius = b.addBlock('Const', { value: 0.35 });
  const outerRadiusBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(outerRadius, 'out', outerRadiusBroadcast, 'signal');

  const outerPos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(outerTotalAngle, 'out', outerPos, 'angle');
  b.wire(outerRadiusBroadcast, 'field', outerPos, 'radius');

  // Color: cyan (hue ~0.5)
  const outerHueConst = b.addBlock('Const', { value: 0.52 });
  const outerHue = b.addBlock('HueFromPhase', {});
  b.wire(outerArray, 't', outerHue, 'id01');
  b.wire(outerHueConst, 'out', outerHue, 'phase');

  const outerColor = b.addBlock('HsvToRgb', { sat: 0.9, val: 1.0 });
  b.wire(outerHue, 'hue', outerColor, 'hue');

  // ===========================================================================
  // INNER RING: Time-driven (constant speed) - for comparison
  // ===========================================================================

  const innerShape = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const innerArray = b.addBlock('Array', { count: 12 });
  b.wire(innerShape, 'shape', innerArray, 'element');

  // Base angle from array index
  const innerBaseAngle = b.addBlock('Multiply', {});
  b.wire(innerArray, 't', innerBaseAngle, 'a');
  b.wire(twoPi, 'out', innerBaseAngle, 'b');

  // Rotation directly from time (constant speed)
  const innerPhaseBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(time, 'phaseB', innerPhaseBroadcast, 'signal');

  const innerRotation = b.addBlock('Multiply', {});
  b.wire(innerPhaseBroadcast, 'field', innerRotation, 'a');
  b.wire(twoPi, 'out', innerRotation, 'b');

  const innerTotalAngle = b.addBlock('Add', {});
  b.wire(innerBaseAngle, 'out', innerTotalAngle, 'a');
  b.wire(innerRotation, 'out', innerTotalAngle, 'b');

  // Position
  const innerRadius = b.addBlock('Const', { value: 0.18 });
  const innerRadiusBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(innerRadius, 'out', innerRadiusBroadcast, 'signal');

  const innerPos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(innerTotalAngle, 'out', innerPos, 'angle');
  b.wire(innerRadiusBroadcast, 'field', innerPos, 'radius');

  // Color: orange (hue ~0.08)
  const innerHueConst = b.addBlock('Const', { value: 0.08 });
  const innerHue = b.addBlock('HueFromPhase', {});
  b.wire(innerArray, 't', innerHue, 'id01');
  b.wire(innerHueConst, 'out', innerHue, 'phase');

  const innerColor = b.addBlock('HsvToRgb', { sat: 0.9, val: 1.0 });
  b.wire(innerHue, 'hue', innerColor, 'hue');

  // ===========================================================================
  // RENDER BOTH RINGS
  // ===========================================================================

  const renderOuter = b.addBlock('RenderInstances2D', {});
  b.wire(outerPos, 'pos', renderOuter, 'pos');
  b.wire(outerColor, 'color', renderOuter, 'color');
  b.wire(outerShape, 'shape', renderOuter, 'shape');

  const renderInner = b.addBlock('RenderInstances2D', {});
  b.wire(innerPos, 'pos', renderInner, 'pos');
  b.wire(innerColor, 'color', renderInner, 'color');
  b.wire(innerShape, 'shape', renderInner, 'shape');
};
