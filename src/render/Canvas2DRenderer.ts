/**
 * Canvas 2D Renderer - Unified Shape Model with Path Support
 *
 * Uses canvas API with topology-based shape dispatch.
 * No more hardcoded shape switches - dispatches to topology.render() or path rendering.
 */

import type { RenderFrameIR, RenderPassIR, ShapeDescriptor } from '../runtime/ScheduleExecutor';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, PathVerb, TopologyDef } from '../shapes/types';

/**
 * Type guard to check if a topology is a PathTopologyDef
 */
function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}

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
 * Render 2D instances with unified shape model and path support
 *
 * Shape can be:
 * - ShapeDescriptor: Topology + params (uniform for all particles)
 * - ArrayBufferView: Per-particle shape buffer (Field<shape>)
 * - number: Legacy encoding (0=circle, 1=square, 2=triangle) - deprecated
 *
 * For path shapes:
 * - Control points define the shape template (e.g., 5 vertices for pentagon)
 * - Each particle renders the same shape at its position
 * - Control points are relative offsets, scaled by the particle size
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

  // Get control points for path shapes (used as shape template)
  const controlPoints = pass.controlPoints as Float32Array | undefined;

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
        const { topology, params } = shapeMode;

        if (isPathTopology(topology)) {
          // Path topology - render using control points as shape template
          if (!controlPoints) {
            throw new Error(
              `Path topology '${topology.id}' requires control points buffer. ` +
              `Ensure the shape signal includes a control point field.`
            );
          }
          renderPathAtParticle(ctx, topology, controlPoints, size, width, height);
        } else {
          // Regular topology (ellipse, rect) - use topology render function
          topology.render(ctx, params);
        }
        break;
      }

      case 'perParticle': {
        // Per-particle shapes (Field<shape>) - not implemented
        throw new Error(
          'Per-particle shapes (Field<shape>) are not yet implemented. ' +
          'Use a uniform shape signal instead.'
        );
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
 * Render a path shape at a particle position.
 *
 * Control points define the shape template (relative offsets from center).
 * The shape is scaled by particle size and drawn at the current transform origin.
 *
 * Control points from polygonVertex kernel are in normalized space centered at (0,0)
 * with radius defined by radiusX/radiusY. We scale them to canvas pixels.
 */
function renderPathAtParticle(
  ctx: CanvasRenderingContext2D,
  topology: PathTopologyDef,
  controlPoints: Float32Array,
  _size: number, // Currently unused - control points already include radius
  width: number,
  height: number
): void {
  ctx.beginPath();

  let pointIndex = 0;

  for (let i = 0; i < topology.verbs.length; i++) {
    const verb = topology.verbs[i];

    switch (verb) {
      case 0: { // PathVerb.MOVE
        // Control points are in normalized space (-radiusX to +radiusX, -radiusY to +radiusY)
        // Scale to canvas pixels (multiply by canvas size since they're normalized fractions)
        const px = controlPoints[pointIndex * 2] * width;
        const py = controlPoints[pointIndex * 2 + 1] * height;
        ctx.moveTo(px, py);
        pointIndex++;
        break;
      }

      case 1: { // PathVerb.LINE
        const px = controlPoints[pointIndex * 2] * width;
        const py = controlPoints[pointIndex * 2 + 1] * height;
        ctx.lineTo(px, py);
        pointIndex++;
        break;
      }

      case 2: { // PathVerb.CUBIC
        // Cubic bezier: control1, control2, end
        const cp1x = controlPoints[pointIndex * 2] * width;
        const cp1y = controlPoints[pointIndex * 2 + 1] * height;
        pointIndex++;

        const cp2x = controlPoints[pointIndex * 2] * width;
        const cp2y = controlPoints[pointIndex * 2 + 1] * height;
        pointIndex++;

        const endx = controlPoints[pointIndex * 2] * width;
        const endy = controlPoints[pointIndex * 2 + 1] * height;
        pointIndex++;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
        break;
      }

      case 3: { // PathVerb.QUAD
        // Quadratic bezier: control, end
        const cpx = controlPoints[pointIndex * 2] * width;
        const cpy = controlPoints[pointIndex * 2 + 1] * height;
        pointIndex++;

        const endx = controlPoints[pointIndex * 2] * width;
        const endy = controlPoints[pointIndex * 2 + 1] * height;
        pointIndex++;

        ctx.quadraticCurveTo(cpx, cpy, endx, endy);
        break;
      }

      case 4: { // PathVerb.CLOSE
        ctx.closePath();
        break;
      }

      default: {
        throw new Error(`Unknown path verb: ${verb}. Valid verbs are 0-4 (MOVE, LINE, CUBIC, QUAD, CLOSE).`);
      }
    }
  }

  // Fill the path
  ctx.fill();
}

/**
 * Shape rendering mode
 */
type ShapeMode =
  | { kind: 'topology'; topology: TopologyDef; params: Record<string, number> }
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
