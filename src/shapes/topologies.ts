/**
 * Built-in Topology Definitions
 *
 * Contains the predefined topologies (ellipse, rect) with their render functions.
 * These are registered at module load time by the registry, which assigns
 * numeric IDs (TOPOLOGY_ID_ELLIPSE = 0, TOPOLOGY_ID_RECT = 1).
 *
 * These definitions omit the `id` field — the registry assigns it during initialization.
 */

import type { AbstractTopologyDef, RenderSpace2D } from './types';

/**
 * TOPOLOGY_ELLIPSE - Ellipse topology
 *
 * Parameters (normalized world coordinates):
 * - rx: X-axis radius (0..1 relative to viewport width)
 * - ry: Y-axis radius (0..1 relative to viewport height)
 * - rotation: Rotation in radians
 *
 * Renders using ctx.ellipse() centered at origin (after translate).
 */
export const TOPOLOGY_ELLIPSE: AbstractTopologyDef = Object.freeze({
  params: Object.freeze([
    { name: 'rx', type: 'float' as const, default: 0.02 },
    { name: 'ry', type: 'float' as const, default: 0.02 },
    { name: 'rotation', type: 'float' as const, default: 0 },
  ]),
  render: (ctx: CanvasRenderingContext2D, p: Record<string, number>, space: RenderSpace2D) => {
    // Convert normalized radii to device pixels, applying scale multiplier
    const rxPx = p.rx * space.width * space.scale;
    const ryPx = p.ry * space.height * space.scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, rxPx, ryPx, p.rotation ?? 0, 0, Math.PI * 2);
    ctx.fill();
  },
});

/**
 * TOPOLOGY_RECT - Rectangle topology
 *
 * Parameters (normalized world coordinates):
 * - width: Rectangle width (0..1 relative to viewport width)
 * - height: Rectangle height (0..1 relative to viewport height)
 * - rotation: Rotation in radians
 * - cornerRadius: Corner radius (0..1, scaled by min dimension)
 *
 * Renders using ctx.fillRect() or ctx.roundRect() centered at origin.
 */
export const TOPOLOGY_RECT: AbstractTopologyDef = Object.freeze({
  params: Object.freeze([
    { name: 'width', type: 'float' as const, default: 0.04 },
    { name: 'height', type: 'float' as const, default: 0.02 },
    { name: 'rotation', type: 'float' as const, default: 0 },
    { name: 'cornerRadius', type: 'float' as const, default: 0 },
  ]),
  render: (ctx: CanvasRenderingContext2D, p: Record<string, number>, space: RenderSpace2D) => {
    // Convert normalized dimensions to device pixels, applying scale multiplier
    const wPx = p.width * space.width * space.scale;
    const hPx = p.height * space.height * space.scale;
    const crPx = p.cornerRadius * Math.min(space.width, space.height) * space.scale;

    ctx.save();
    ctx.rotate(p.rotation ?? 0);
    if (crPx > 0) {
      ctx.beginPath();
      ctx.roundRect(-wPx / 2, -hPx / 2, wPx, hPx, crPx);
      ctx.fill();
    } else {
      ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
    }
    ctx.restore();
  },
});
