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
  const phaseWrap = b.addBlock('Modulo', {});

  b.wire(phaseDelay, 'out', phaseAdd, 'a');  // Previous phase
  b.wire(speedDelta, 'out', phaseAdd, 'b');  // Delta
  b.wire(phaseAdd, 'out', phaseWrap, 'a');   // Wrap to [0,1)
  b.wire(phaseWrapDivisor, 'out', phaseWrap, 'b');
  b.wire(phaseWrap, 'out', phaseDelay, 'in'); // Feed back for next frame

  // ===========================================================================
  // OUTER RING: Feedback-driven rotation (variable speed)
  // ===========================================================================

  const outerEllipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const outerArray = b.addBlock('Array', { count: 24 });
  b.wire(outerEllipse, 'shape', outerArray, 'element');

  // Use CircleLayoutUV for outer ring
  const outerLayout = b.addBlock('CircleLayoutUV', { radius: 0.35 });
  b.wire(outerArray, 'elements', outerLayout, 'elements');

  // Simple constant color - cyan
  const outerColor = b.addBlock('Const', { value: [0.3, 0.9, 0.9, 1.0] });

  // ===========================================================================
  // INNER RING: Direct time-driven rotation (constant speed for comparison)
  // ===========================================================================

  const innerEllipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });
  const innerArray = b.addBlock('Array', { count: 16 });
  b.wire(innerEllipse, 'shape', innerArray, 'element');

  // Use CircleLayoutUV for inner ring
  const innerLayout = b.addBlock('CircleLayoutUV', { radius: 0.18 });
  b.wire(innerArray, 'elements', innerLayout, 'elements');

  // Simple constant color - orange
  const innerColor = b.addBlock('Const', { value: [1.0, 0.6, 0.3, 1.0] });

  // ===========================================================================
  // RENDER BOTH RINGS
  // ===========================================================================

  const renderOuter = b.addBlock('RenderInstances2D', {});
  b.wire(outerLayout, 'position', renderOuter, 'pos');
  b.wire(outerColor, 'out', renderOuter, 'color');
  b.wire(outerEllipse, 'shape', renderOuter, 'shape');

  const renderInner = b.addBlock('RenderInstances2D', {});
  b.wire(innerLayout, 'position', renderInner, 'pos');
  b.wire(innerColor, 'out', renderInner, 'color');
  b.wire(innerEllipse, 'shape', renderInner, 'shape');
};
