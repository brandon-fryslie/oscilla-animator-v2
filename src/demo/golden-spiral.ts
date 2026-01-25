/**
 * Golden Spiral - Main demo patch
 *
 * 5000 ellipses in a golden angle spiral with animated rotation and jitter.
 * Classic phyllotaxis pattern with HSV color mapping.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchGoldenSpiral: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,
    periodBMs: 120000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
  const array = b.addBlock('Array', { count: 5000 });
  b.wire(ellipse, 'shape', array, 'element');

  const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('AngularOffset', { spin: 2.0 });
  const totalAngle = b.addBlock('Add', {});

  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');

  const effectiveRadius = b.addBlock('RadiusSqrt', { radius: 0.35 });
  b.wire(array, 't', effectiveRadius, 'id01');

  const pos = b.addBlock('FieldPolarToCartesian', {});
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  const jitter = b.addBlock('Jitter2D', { amountX: 0.015, amountY: 0.015 });
  // Broadcast time (scalar) for jitter seed variation
  const timeBroadcast = b.addBlock('Broadcast', { payloadType: 'float' });
  const jitterRand = b.addBlock('Add', {});

  b.wire(time, 'tMs', timeBroadcast, 'signal');
  b.wire(timeBroadcast, 'field', jitterRand, 'a');
  b.wire(array, 't', jitterRand, 'b');
  b.wire(pos, 'pos', jitter, 'pos');
  b.wire(jitterRand, 'out', jitter, 'rand');

  const hue = b.addBlock('HueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 0.85, val: 0.9 });

  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(jitter, 'out', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
