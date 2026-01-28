/**
 * Path Field Demo - Showcases PathField tangent and arc length features
 *
 * Demonstrates the new PathField block outputs:
 * - position: VEC3 control point positions
 * - tangent: VEC3 tangent vectors at each point
 * - arcLength: Cumulative distance along the path
 *
 * Visual elements:
 * - Colored markers at each star vertex (color = arc length mapped to rainbow)
 * - Slowly rotating color cycle
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPathFieldDemo: PatchBuilder = (b) => {
  // Time source for animation
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 3000,  // Color cycle speed
    periodBMs: 10000, // Slow overall rotation
  }, { role: timeRootRole() });

  // Create a 5-pointed star
  // Control points are in LOCAL space centered at (0,0)
  const star = b.addBlock('ProceduralStar', {
    points: 5,
    outerRadius: 0.3,
    innerRadius: 0.12,
  });

  // Extract path properties from control points
  // PathField outputs VEC3 (with z=0 for 2D compatibility)
  const pathField = b.addBlock('PathField', {});
  b.wire(star, 'controlPoints', pathField, 'controlPoints');

  // Offset positions from local space (0,0) to world space (0.5, 0.5)
  // Using OffsetVec with zero random to just add the offset
  const zeroRand = b.addBlock('Const', { value: 0 });
  const offsetPos = b.addBlock('OffsetVec', {
    amountX: 0.5,
    amountY: 0.5,
    amountZ: 0,
  });
  b.wire(pathField, 'position', offsetPos, 'posIn');
  b.wire(zeroRand, 'out', offsetPos, 'rand');

  // Marker shapes at each control point
  const marker = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });

  // Color based on normalized arc length
  // Since arcLength is cumulative (0 to perimeter), we use it as a 0-1 value
  // by relying on HueFromPhase's fract() behavior
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(pathField, 'arcLength', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');

  const color = b.addBlock('HsvToRgb', { sat: 0.95, val: 1.0 });
  b.wire(hue, 'hue', color, 'hue');

  // Render markers at control point positions
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(offsetPos, 'posOut', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(marker, 'shape', render, 'shape');
};
