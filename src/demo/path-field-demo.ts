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
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,  // Color cycle speed
  }, { role: timeRootRole() });

  // Create a 5-pointed star
  // Control points are in LOCAL space centered at (0,0)
  const star = b.addBlock('ProceduralStar', {
    points: 5,
    outerRadius: 0.25,
    innerRadius: 0.1,
  });

  // Extract path properties from control points
  const pathField = b.addBlock('PathField', {});
  b.wire(star, 'controlPoints', pathField, 'controlPoints');

  // Small marker shapes
  const marker = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });

  // Simple constant color
  const color = b.addBlock('Const', { value: [1.0, 0.7, 0.3, 1.0] }); // Warm orange

  // Render markers at path positions
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(pathField, 'position', render, 'pos');
  b.wire(color, 'out', render, 'color');
  b.wire(marker, 'shape', render, 'shape');
};
