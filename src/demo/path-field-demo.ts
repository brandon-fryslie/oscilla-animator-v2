/**
 * Path Field Demo - PathField visualization
 *
 * Demonstrates PathField outputs:
 * - position: VEC2/VEC3 control point positions
 * - arcLength: Cumulative distance along path
 *
 * Visual effect:
 * - Star vertices with simple colors
 * - Shows path field functionality
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPathFieldDemo: PatchBuilder = (b) => {
  // Time source for animation
  const time = b.addBlock('InfiniteTimeRoot', { role: timeRootRole() });
  b.setPortDefault(time, 'periodAMs', 4000); // Color cycle speed

  // Create a 5-pointed star
  // Control points are in LOCAL space centered at (0,0)
  const star = b.addBlock('ProceduralStar');
  b.setPortDefault(star, 'points', 5);
  b.setPortDefault(star, 'outerRadius', 0.25);
  b.setPortDefault(star, 'innerRadius', 0.1);

  // Extract path properties from control points
  const pathField = b.addBlock('PathField');
  b.wire(star, 'controlPoints', pathField, 'controlPoints');

  // Small marker shapes
  const marker = b.addBlock('Ellipse');
  b.setPortDefault(marker, 'rx', 0.015);
  b.setPortDefault(marker, 'ry', 0.015);

  // Simple constant color
  const color = b.addBlock('Const');
  b.setConfig(color, 'value', { r: 1.0, g: 0.7, b: 0.3, a: 1.0 }); // Warm orange

  // Render markers at path positions
  const render = b.addBlock('RenderInstances2D');
  b.wire(pathField, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
};
