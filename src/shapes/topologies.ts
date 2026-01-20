/**
 * Built-in Topology Definitions
 *
 * Contains the predefined topologies (ellipse, rect) with their render functions.
 * These are immutable and registered at module load time.
 */

import type { TopologyDef } from './types';

/**
 * TOPOLOGY_ELLIPSE - Ellipse topology
 *
 * Parameters:
 * - rx: X-axis radius
 * - ry: Y-axis radius
 * - rotation: Rotation in radians
 *
 * Renders using ctx.ellipse() centered at origin (after translate).
 */
export const TOPOLOGY_ELLIPSE: TopologyDef = Object.freeze({
  id: 'ellipse',
  params: Object.freeze([
    { name: 'rx', type: 'float' as const, default: 0.02 },
    { name: 'ry', type: 'float' as const, default: 0.02 },
    { name: 'rotation', type: 'float' as const, default: 0 },
  ]),
  render: (ctx: CanvasRenderingContext2D, p: Record<string, number>) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, p.rx, p.ry, p.rotation, 0, Math.PI * 2);
    ctx.fill();
  },
});

/**
 * TOPOLOGY_RECT - Rectangle topology
 *
 * Parameters:
 * - width: Rectangle width
 * - height: Rectangle height
 * - rotation: Rotation in radians
 * - cornerRadius: Corner radius for rounded rectangles
 *
 * Renders using ctx.fillRect() or ctx.roundRect() centered at origin.
 */
export const TOPOLOGY_RECT: TopologyDef = Object.freeze({
  id: 'rect',
  params: Object.freeze([
    { name: 'width', type: 'float' as const, default: 0.04 },
    { name: 'height', type: 'float' as const, default: 0.02 },
    { name: 'rotation', type: 'float' as const, default: 0 },
    { name: 'cornerRadius', type: 'float' as const, default: 0 },
  ]),
  render: (ctx: CanvasRenderingContext2D, p: Record<string, number>) => {
    ctx.save();
    ctx.rotate(p.rotation);
    if (p.cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(-p.width / 2, -p.height / 2, p.width, p.height, p.cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    }
    ctx.restore();
  },
});
