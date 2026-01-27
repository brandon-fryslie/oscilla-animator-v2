/**
 * Feedback Rotation - UnitDelay showcase demo
 *
 * Demonstrates feedback-driven animation using UnitDelay to implement
 * a phase accumulator with variable speed. The rotation speed oscillates
 * between fast and slow, creating dynamic acceleration and deceleration.
 *
 * This pattern is IMPOSSIBLE without UnitDelay because:
 *   phase[t] = phase[t-1] + delta
 * creates a dependency cycle. UnitDelay breaks the cycle by providing
 * the previous frame's value, enabling feedback loops.
 *
 * The demo shows two rings:
 * - Inner ring: Direct time-driven rotation (constant speed)
 * - Outer ring: Feedback-driven rotation (variable speed via accumulator)
 *
 * Watch how the outer ring accelerates and decelerates while the inner
 * ring maintains constant speed - the visual difference shows the power
 * of stateful feedback.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchFeedbackRotation: PatchBuilder = (b) => {
  // Time root for base oscillation
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 3000,   // 3s period for speed modulation
    periodBMs: 8000,   // 8s period for color cycling
  }, { role: timeRootRole() });

  // ===========================================================================
  // FEEDBACK ACCUMULATOR (the core UnitDelay pattern)
  // ===========================================================================
  //
  // This implements: phase[t] = (phase[t-1] + delta) mod 1
  //
  // The delta varies with time, creating acceleration/deceleration.
  // Without UnitDelay, this feedback loop would be impossible.

  // Speed modulation: oscillates between 0.005 and 0.025 per frame
  // This creates the "breathing" rotation effect
  const speedBase = b.addBlock('Const', { value: 0.015 });
  const speedAmp = b.addBlock('Const', { value: 0.01 });
  const speedOsc = b.addBlock('Oscillator', { offset: 0 });
  b.wire(time, 'phaseA', speedOsc, 'phase');

  const speedModulation = b.addBlock('Multiply', {});
  b.wire(speedOsc, 'out', speedModulation, 'a');
  b.wire(speedAmp, 'out', speedModulation, 'b');

  const speedDelta = b.addBlock('Add', {});
  b.wire(speedBase, 'out', speedDelta, 'a');
  b.wire(speedModulation, 'out', speedDelta, 'b');

  // The feedback loop using UnitDelay
  // accumulatedPhase = UnitDelay(accumulatedPhase + speedDelta)
  const phaseDelay = b.addBlock('UnitDelay', { initialValue: 0 });
  const phaseAdd = b.addBlock('Add', {});
  const phaseWrapDivisor = b.addBlock('Const', { value: 1.0 });
  const phaseWrap = b.addBlock('Mod', {});

  b.wire(phaseDelay, 'out', phaseAdd, 'a');  // Previous phase
  b.wire(speedDelta, 'out', phaseAdd, 'b');  // Delta
  b.wire(phaseAdd, 'out', phaseWrap, 'a');   // Wrap to [0,1)
  b.wire(phaseWrapDivisor, 'out', phaseWrap, 'b');
  b.wire(phaseWrap, 'result', phaseDelay, 'in'); // Feed back for next frame

  // ===========================================================================
  // OUTER RING: Feedback-driven rotation (variable speed)
  // ===========================================================================

  const outerEllipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const outerArray = b.addBlock('Array', { count: 24 });
  b.wire(outerEllipse, 'shape', outerArray, 'element');

  // Angular offset from array index (evenly distributed around circle)
  const outerAnglePerElement = b.addBlock('Multiply', {});
  const twoPi = b.addBlock('Const', { value: 6.283185307 });  // 2*PI
  b.wire(outerArray, 't', outerAnglePerElement, 'a');
  b.wire(twoPi, 'out', outerAnglePerElement, 'b');

  // Convert accumulated phase [0,1) to angle [0, 2*PI)
  const feedbackAngleScaled = b.addBlock('Multiply', {});
  const feedbackAngleBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(phaseWrap, 'result', feedbackAngleBroadcast, 'signal');
  b.wire(feedbackAngleBroadcast, 'field', feedbackAngleScaled, 'a');
  b.wire(twoPi, 'out', feedbackAngleScaled, 'b');

  // Total angle = element offset + accumulated rotation
  const outerTotalAngle = b.addBlock('Add', {});
  b.wire(outerAnglePerElement, 'out', outerTotalAngle, 'a');
  b.wire(feedbackAngleScaled, 'out', outerTotalAngle, 'b');

  // Position on outer ring
  const outerRadius = b.addBlock('Const', { value: 0.35 });
  const outerRadiusBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(outerRadius, 'out', outerRadiusBroadcast, 'signal');

  const outerPos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(outerTotalAngle, 'out', outerPos, 'angle');
  b.wire(outerRadiusBroadcast, 'field', outerPos, 'radius');

  // Color: cyan-ish, varies with accumulated phase
  const outerHue = b.addBlock('Add', {});
  const outerHueBase = b.addBlock('Const', { value: 0.5 }); // Cyan base
  b.wire(outerHueBase, 'out', outerHue, 'a');
  b.wire(phaseWrap, 'result', outerHue, 'b');

  const outerColor = b.addBlock('HsvToRgb', { sat: 0.9, val: 1.0 });
  b.wire(outerHue, 'out', outerColor, 'hue');

  // ===========================================================================
  // INNER RING: Direct time-driven rotation (constant speed for comparison)
  // ===========================================================================

  const innerEllipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });
  const innerArray = b.addBlock('Array', { count: 16 });
  b.wire(innerEllipse, 'shape', innerArray, 'element');

  // Use GoldenAngle for base distribution + AngularOffset for time-driven rotation
  // This matches the pattern used in other demos and handles unit conversion properly
  const innerGoldenAngle = b.addBlock('GoldenAngle', { turns: 1 });
  const innerAngularOffset = b.addBlock('AngularOffset', { spin: 1.0 });
  const innerTotalAngle = b.addBlock('Add', {});

  b.wire(innerArray, 't', innerGoldenAngle, 'id01');
  b.wire(innerArray, 't', innerAngularOffset, 'id01');
  b.wire(time, 'phaseA', innerAngularOffset, 'phase');
  b.wire(innerGoldenAngle, 'angle', innerTotalAngle, 'a');
  b.wire(innerAngularOffset, 'offset', innerTotalAngle, 'b');

  // Position on inner ring
  const innerRadius = b.addBlock('Const', { value: 0.18 });
  const innerRadiusBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  b.wire(innerRadius, 'out', innerRadiusBroadcast, 'signal');

  const innerPos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(innerTotalAngle, 'out', innerPos, 'angle');
  b.wire(innerRadiusBroadcast, 'field', innerPos, 'radius');

  // Color: orange-ish, varies with time
  const innerHue = b.addBlock('HueFromPhase', {});
  b.wire(innerArray, 't', innerHue, 'id01');
  b.wire(time, 'phaseB', innerHue, 'phase');

  const innerColor = b.addBlock('HsvToRgb', { sat: 0.8, val: 0.95 });
  b.wire(innerHue, 'hue', innerColor, 'hue');

  // ===========================================================================
  // RENDER BOTH RINGS
  // ===========================================================================

  const renderOuter = b.addBlock('RenderInstances2D', {});
  b.wire(outerPos, 'pos', renderOuter, 'pos');
  b.wire(outerColor, 'color', renderOuter, 'color');
  b.wire(outerEllipse, 'shape', renderOuter, 'shape');

  const renderInner = b.addBlock('RenderInstances2D', {});
  b.wire(innerPos, 'pos', renderInner, 'pos');
  b.wire(innerColor, 'color', renderInner, 'color');
  b.wire(innerEllipse, 'shape', renderInner, 'shape');
};
