/**
 * Path Field Demo - 3D helix visualization using PathField
 *
 * Demonstrates PathField outputs with 3D perspective:
 * - position: VEC3 control point positions
 * - arcLength: Cumulative distance along path → used for Z height
 *
 * Visual effect:
 * - Star vertices form a 3D helix (Z rises with arcLength)
 * - Rainbow colors show path progression
 * - Static tilted camera shows the 3D structure
 */

import { timeRootRole } from '../types';
import type { PatchBuilder } from './types';

export const patchPathFieldDemo: PatchBuilder = (b) => {
  // Time source for animation
  const time = b.addBlock('InfiniteTimeRoot', {
    periodAMs: 4000,  // Color cycle speed
  }, { role: timeRootRole() });

  // Camera for 3D perspective view (static position - manual yaw adjustment)
  // Set yaw to 30 degrees for a nice angled view
  const camera = b.addBlock('Camera', {
    tiltDeg: 45,  // Look down at the helix
    yawDeg: 30,   // Angle from side
  });

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

  // Offset XY positions to center of world space (0.5, 0.5)
  const zeroRand = b.addBlock('Const', { value: 0 });
  const offsetPos = b.addBlock('OffsetVec', {
    amountX: 0.5,
    amountY: 0.5,
    amountZ: 0,
  });
  b.wire(pathField, 'position', offsetPos, 'posIn');
  b.wire(zeroRand, 'out', offsetPos, 'rand');

  // Scale arcLength to create Z height (helix effect)
  // arcLength goes 0 → ~perimeter, scale to reasonable Z range
  const zScaleFactor = b.addBlock('Const', { value: 0.1 });
  const zScale = b.addBlock('Multiply', {});
  b.wire(pathField, 'arcLength', zScale, 'a');
  b.wire(zScaleFactor, 'out', zScale, 'b');

  // Apply Z from arcLength to create 3D helix
  const posWithZ = b.addBlock('SetZ', {});
  b.wire(offsetPos, 'posOut', posWithZ, 'pos');
  b.wire(zScale, 'out', posWithZ, 'z');

  // Small marker shapes
  const marker = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });

  // Rainbow color based on arc length
  const hue = b.addBlock('HueFromPhase', {});
  b.wire(pathField, 'arcLength', hue, 'id01');
  b.wire(time, 'phaseA', hue, 'phase');

  const color = b.addBlock('HsvToRgb', { sat: 0.95, val: 1.0 });
  b.wire(hue, 'hue', color, 'hue');

  // Render markers at 3D positions
  const render = b.addBlock('RenderInstances2D', {});
  b.wire(posWithZ, 'out', render, 'pos');
  b.wire(color, 'color', render, 'color');
  b.wire(marker, 'shape', render, 'shape');
};
