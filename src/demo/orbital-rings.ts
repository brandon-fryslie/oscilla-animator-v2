/**
 * Orbital Rings - Concentric ellipse orbits
 *
 * Multiple rings of ellipses orbiting at different speeds.
 * Each ring has different rotation rate and color.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchOrbitalRings: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 2000,
    periodBMs: 5000,
  }, { role: timeRootRole() });

  // Elongated ellipses for comet-like appearance
  const ellipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.008 });
  const array = b.addBlock('Array', { count: 300 });
  b.wire(ellipse, 'shape', array, 'element');

  // Golden spiral with fast spin for orbital motion
  const goldenAngle = b.addBlock('GoldenAngle', { turns: 50 });
  const angularOffset = b.addBlock('AngularOffset', {});
  const totalAngle = b.addBlock('Add', {});
  const effectiveRadius = b.addBlock('RadiusSqrt', {});
  const pos = b.addBlock('FieldPolarToCartesian', {});

  b.wire(array, 't', goldenAngle, 'id01');
  b.wire(array, 't', angularOffset, 'id01');
  b.wire(array, 't', effectiveRadius, 'id01');
  b.wire(time, 'phaseA', angularOffset, 'phase');
  b.wire(goldenAngle, 'angle', totalAngle, 'a');
  b.wire(angularOffset, 'offset', totalAngle, 'b');
  b.wire(totalAngle, 'out', pos, 'angle');
  b.wire(effectiveRadius, 'out', pos, 'radius');

  // Color: hue varies by element position + time shift
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(time, 'phaseB', hue, 'phase');
  b.wire(array, 't', hue, 'id01');

  const color = b.addBlock('HsvToRgb', {});
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
