/**
 * Canvas 2D Renderer - Unified Shape Model
 *
 * Uses canvas API with topology-based shape dispatch.
 * No more hardcoded shape switches - dispatches to topology.render().
 */

import type { RenderFrameIR, RenderPassIR, ShapeDescriptor } from '../runtime/ScheduleExecutor';
import { getTopology } from '../shapes/registry';

/**
 * Render a frame to a 2D canvas context
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrameIR,
  width: number,
  height: number
): void {
  // Clear canvas once
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Render each pass
  for (const pass of frame.passes) {
    renderPass(ctx, pass, width, height);
  }
}

/**
 * Render a single pass
 */
function renderPass(
  ctx: CanvasRenderingContext2D,
  pass: RenderPassIR,
  width: number,
  height: number
): void {
  if (pass.kind === 'instances2d') {
    renderInstances2D(ctx, pass, width, height);
  } else {
    throw new Error(`Unknown pass kind: ${(pass as any).kind}`);
  }
}

/**
 * Render 2D instances with unified shape model
 *
 * Shape can be:
 * - ShapeDescriptor: Topology + params (uniform for all particles)
 * - ArrayBufferView: Per-particle shape buffer (Field<shape>)
 * - number: Legacy encoding (0=circle, 1=square, 2=triangle) - deprecated
 */
function renderInstances2D(
  ctx: CanvasRenderingContext2D,
  pass: RenderPassIR,
  width: number,
  height: number
): void {
  const position = pass.position as Float32Array;
  const color = pass.color as Uint8ClampedArray;
  const sizes = typeof pass.size === 'number' ? null : pass.size as Float32Array;
  const uniformSize = typeof pass.size === 'number' ? pass.size : 3;

  // Determine shape mode
  const shapeMode = determineShapeMode(pass.shape);

  for (let i = 0; i < pass.count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;
    const size = sizes ? sizes[i] : uniformSize;

    ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;

    // Render shape based on mode
    ctx.save();
    ctx.translate(x, y);

    switch (shapeMode.kind) {
      case 'topology': {
        // Unified shape model - use topology render function
        const { topology, params } = shapeMode;
        topology.render(ctx, params);
        break;
      }

      case 'perParticle': {
        // Per-particle shapes (Field<shape>) - not yet implemented
        // For now, fall back to default circle
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'legacy': {
        // Legacy numeric encoding - deprecated, kept for compatibility
        renderLegacyShape(ctx, shapeMode.encoding, size);
        break;
      }

      default: {
        const _exhaustive: never = shapeMode;
        throw new Error(`Unknown shape mode: ${(_exhaustive as any).kind}`);
      }
    }

    ctx.restore();
  }
}

/**
 * Shape rendering mode
 */
type ShapeMode =
  | { kind: 'topology'; topology: ReturnType<typeof getTopology>; params: Record<string, number> }
  | { kind: 'perParticle'; buffer: ArrayBufferView }
  | { kind: 'legacy'; encoding: number };

/**
 * Determine shape rendering mode from pass.shape
 */
function determineShapeMode(shape: ShapeDescriptor | ArrayBufferView | number): ShapeMode {
  if (typeof shape === 'number') {
    // Legacy encoding
    return { kind: 'legacy', encoding: shape };
  }

  if (isShapeDescriptor(shape)) {
    // Unified shape model with topology
    const topology = getTopology(shape.topologyId);

    // Map param indices to param names from topology definition
    const params: Record<string, number> = {};
    topology.params.forEach((paramDef, i) => {
      const value = shape.params[`param${i}`];
      if (value !== undefined) {
        params[paramDef.name] = value;
      } else {
        // Use default if param not provided
        params[paramDef.name] = paramDef.default;
      }
    });

    return { kind: 'topology', topology, params };
  }

  // Per-particle buffer (Field<shape>)
  return { kind: 'perParticle', buffer: shape };
}

/**
 * Type guard for ShapeDescriptor
 */
function isShapeDescriptor(shape: ShapeDescriptor | ArrayBufferView | number): shape is ShapeDescriptor {
  return typeof shape === 'object' && 'topologyId' in shape && 'params' in shape;
}

/**
 * Render legacy shape encoding (deprecated)
 *
 * Legacy encoding:
 *   0 = circle
 *   1 = square
 *   2 = triangle
 */
function renderLegacyShape(ctx: CanvasRenderingContext2D, encoding: number, size: number): void {
  switch (encoding) {
    case 0: // circle
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 1: // square
      ctx.fillRect(-size / 2, -size / 2, size, size);
      break;
    case 2: // triangle
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      // fallback to circle
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
  }
}
