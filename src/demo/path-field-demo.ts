/**
 * Path Field Demo - PathField visualization
 *
 * Star vertices with per-vertex warm-to-cool gradient.
 * Shows path field functionality with animated hue shift.
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPathFieldDemo: PatchBuilder = (b) => {
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000);

  const star = b.addBlock('ProceduralStar');
  b.setPortDefault(star, 'points', 5);
  b.setPortDefault(star, 'outerRadius', 0.25);
  b.setPortDefault(star, 'innerRadius', 0.1);

  const pathField = b.addBlock('PathField');
  b.wire(star, 'controlPoints', pathField, 'controlPoints');

  const marker = b.addBlock('Ellipse');
  b.setPortDefault(marker, 'rx', 0.015);
  b.setPortDefault(marker, 'ry', 0.015);

  // Cycling rainbow color (signal-level, broadcast to field)
  const hueRainbow = b.addBlock('HueRainbow');
  b.wire(time, 'phaseA', hueRainbow, 't');
  const colorField = b.addBlock('Broadcast');
  b.wire(hueRainbow, 'out', colorField, 'signal');

  const render = b.addBlock('RenderInstances2D');
  b.wire(pathField, 'position', render, 'pos');
  b.wire(colorField, 'field', render, 'color');
};
