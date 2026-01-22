/**
 * Canvas 2D Renderer - Unified Shape Model with Path Support
 *
 * Uses canvas API with topology-based shape dispatch.
 * No more hardcoded shape switches - dispatches to topology.render() or path rendering.
 *
 * Architecture:
 * - Renderer is a pure sink: receives pre-resolved RenderFrameIR
 * - No shape interpretation - RenderAssembler does all resolution
 * - Pass-level validation - fast inner loops with no checks
 * - Local-space geometry with instance transforms
 *
 * Coordinate spaces:
 * - LOCAL SPACE: Control points centered at (0,0), |p| ≈ O(1)
 * - WORLD SPACE: Instance positions normalized [0,1]
 * - VIEWPORT SPACE: Final pixel coordinates
 *
 * Transform sequence per instance:
 *   ctx.translate(x * width, y * height)  // world → viewport
 *   ctx.scale(sizePx, sizePx)             // local → viewport scale
 *   drawPath(localSpacePoints)            // no additional scaling
 *
 * Future enhancements (see .agent_planning/_future/9-renderer.md):
 * - Numeric topology IDs (array index vs string lookup)
 * - Explicit PathStyle (fill/stroke/width/dash/blend)
 * - Per-instance rotation and anisotropic scale
 */

import type { RenderFrameIR, RenderPassIR, ResolvedShape } from '../runtime/ScheduleExecutor';
import { isPathTopology } from '../runtime/RenderAssembler';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, PathVerb, TopologyDef } from '../shapes/types';

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
  switch (pass.kind) {
    case 'instances2d':
      renderInstances2D(ctx, pass, width, height);
      break;
    // Note: RenderPassIR only has 'instances2d' kind currently
    // Add additional cases here as more pass types are added
  }
}

/**
 * Render 2D instances with unified shape model and path support
 *
 * ResolvedShape from RenderAssembler contains:
 * - topologyId: Identifies shape topology (path verbs or primitive)
 * - params: Shape parameters with defaults applied
 * - mode: 'path' | 'primitive' for dispatch
 * - controlPoints: Float32Array for path shapes (local space)
 *
 * For path shapes:
 * - Control points define shape template in local space
 * - Each instance renders the same shape with instance transforms
 */
function renderInstances2D(
  ctx: CanvasRenderingContext2D,
  pass: RenderPassIR,
  width: number,
  height: number
): void {
  const position = pass.position as Float32Array;
  const color = pass.color as Uint8ClampedArray;
  const scale = pass.scale;

  // Get topology for render function (single lookup per pass)
  const topology = getTopology(pass.resolvedShape.topologyId);
  const params = pass.resolvedShape.params;

  // Get control points for path shapes from resolvedShape
  const controlPoints = pass.resolvedShape.mode === 'path'
    ? pass.resolvedShape.controlPoints as Float32Array | undefined
    : undefined;

  // PASS-LEVEL VALIDATION: Validate once before the loop, not per-instance
  // This follows spec 9-renderer.md: "pass-level validation + no checks inside hot loops"
  if (isPathTopology(topology) && !controlPoints) {
    throw new Error(
      `Path topology '${topology.id}' requires control points buffer. ` +
      `Ensure the shape signal includes a control point field.`
    );
  }

  // Extract optional per-instance transforms
  const rotation = pass.rotation;
  const scale2 = pass.scale2;

  // Fast inner loop - no validation checks
  for (let i = 0; i < pass.count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;

    ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;

    ctx.save();
    ctx.translate(x, y);

    // Apply per-instance rotation if provided
    if (rotation) {
      ctx.rotate(rotation[i]);
    }

    // Apply per-instance anisotropic scale if provided
    if (scale2) {
      ctx.scale(scale2[i * 2], scale2[i * 2 + 1]);
    }

    if (isPathTopology(topology)) {
      // Path topology - control points validated above
      renderPathAtParticle(ctx, topology, controlPoints!, scale, width, height);
    } else {
      // Primitive topology (ellipse, rect) - use topology render function
      topology.render(ctx, params, { width, height, scale });
    }

    ctx.restore();
  }
}

/**
 * Render a path shape at a particle position using local-space geometry.
 *
 * PHASE 6 LOCAL-SPACE MODEL:
 * Control points define the shape template in LOCAL SPACE (centered at origin).
 * Instance transforms (position, size, rotation) are applied via canvas transforms.
 *
 * Coordinate spaces:
 * - LOCAL SPACE: Control points are centered at (0,0) with |p| ≈ O(1)
 *   Example: Regular polygon with radius 1.0, vertices at (cos θ, sin θ)
 * - WORLD SPACE: Instance position is normalized [0,1]
 * - VIEWPORT SPACE: Final pixel coordinates
 *
 * Transform sequence (already inside ctx.save/restore with translate applied):
 * 1. ctx.scale(sizePx, sizePx) - scale local geometry to viewport
 * 2. Draw path with local-space points (no width/height multipliers)
 *
 * Size conversion:
 * - size is in world-normalized units (e.g., 0.05 = 5% of reference dimension)
 * - Reference dimension D = min(width, height) to preserve isotropy
 * - sizePx = size * D
 *
 * This makes all shapes respond uniformly to size modulation.
 */
function renderPathAtParticle(
  ctx: CanvasRenderingContext2D,
  topology: PathTopologyDef,
  controlPoints: Float32Array,
  size: number,
  width: number,
  height: number
): void {
  // Calculate reference dimension for isotropic scaling
  const D = Math.min(width, height);
  const sizePx = size * D;

  // Apply instance scale transform
  // This scales the local-space geometry to viewport pixels
  ctx.scale(sizePx, sizePx);

  ctx.beginPath();

  let pointIndex = 0;

  for (let i = 0; i < topology.verbs.length; i++) {
    const verb = topology.verbs[i];

    switch (verb) {
      case 0: { // PathVerb.MOVE
        // Control points are in LOCAL SPACE - use directly (no width/height scaling)
        const px = controlPoints[pointIndex * 2];
        const py = controlPoints[pointIndex * 2 + 1];
        ctx.moveTo(px, py);
        pointIndex++;
        break;
      }

      case 1: { // PathVerb.LINE
        const px = controlPoints[pointIndex * 2];
        const py = controlPoints[pointIndex * 2 + 1];
        ctx.lineTo(px, py);
        pointIndex++;
        break;
      }

      case 2: { // PathVerb.CUBIC
        // Cubic bezier: control1, control2, end
        const cp1x = controlPoints[pointIndex * 2];
        const cp1y = controlPoints[pointIndex * 2 + 1];
        pointIndex++;

        const cp2x = controlPoints[pointIndex * 2];
        const cp2y = controlPoints[pointIndex * 2 + 1];
        pointIndex++;

        const endx = controlPoints[pointIndex * 2];
        const endy = controlPoints[pointIndex * 2 + 1];
        pointIndex++;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
        break;
      }

      case 3: { // PathVerb.QUAD
        // Quadratic bezier: control, end
        const cpx = controlPoints[pointIndex * 2];
        const cpy = controlPoints[pointIndex * 2 + 1];
        pointIndex++;

        const endx = controlPoints[pointIndex * 2];
        const endy = controlPoints[pointIndex * 2 + 1];
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
