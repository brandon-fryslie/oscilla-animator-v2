/**
 * Domain Test - Slow spiral for continuity testing
 *
 * 50 large ellipses for observing element identity during count changes.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchDomainTest: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 8000,
    periodBMs: 8000,
  }, { role: timeRootRole() });

  const ellipse = b.addBlock('Ellipse', { rx: 0.025, ry: 0.025 });
  const array = b.addBlock('Array', { count: 50 });
  b.wire(ellipse, 'shape', array, 'element');

  const goldenAngle = b.addBlock('GoldenAngle', { turns: 8 });
  const angularOffset = b.addBlock('AngularOffset', { spin: 1.0 });
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

  const hue = b.addBlock('HueFromPhase', {});
  const color = b.addBlock('HsvToRgb', { sat: 1.0, val: 1.0 });

  b.wire(array, 't', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');
  b.wire(hue, 'hue', color, 'hue');

  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pos, 'pos', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(ellipse, 'shape', render, 'shape');
};
