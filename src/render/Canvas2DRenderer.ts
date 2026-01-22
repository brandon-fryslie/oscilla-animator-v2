/**
 * Canvas 2D Renderer - Unified Shape Model with Path Support
 *
 * Uses canvas API with topology-based shape dispatch.
 * No more hardcoded shape switches - dispatches to topology.render() or path rendering.
 *
 * ROADMAP PHASE 6 - FUTURE DIRECTION:
 *
 * Current state: Renderer interprets heterogeneous shapes and scales control points
 * Target state: Renderer as pure sink for explicit DrawOps
 *
 * Key changes planned:
 * 1. Remove shape interpretation logic
 *    - No more ShapeDescriptor decoding
 *    - No more determineShapeMode branching
 *    - No more param name mapping
 *
 * 2. Local-space geometry + instance transforms
 *    Current: Control points scaled by width/height in renderPathAtParticle
 *    Future: Control points in local space, instance transforms applied:
 *      ctx.translate(x * width, y * height);
 *      ctx.rotate(rotation);
 *      ctx.scale(size, size);
 *      drawPath(localSpacePoints); // No width/height scaling
 *
 * 3. Numeric topology IDs (not strings)
 *    Current: String lookup in topology registry
 *    Future: Array index lookup by numeric topologyId
 *
 * 4. Explicit style controls
 *    Current: Only fillColor implicit via ctx.fillStyle
 *    Future: PathStyle with fill/stroke/width/dash/blend
 *
 * 5. Pass-level validation (not per-instance)
 *    Current: Throws inside particle loop
 *    Future: Validate once per pass, fast loop
 *
 * See: src/render/future-types.ts for target DrawPathInstancesOp
 *      .agent_planning/_future/9-renderer.md
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
  const scale = pass.scale;

  // Use resolvedShape (REQUIRED - always present from RenderAssembler)
  const shapeMode = convertResolvedShapeToMode(pass.resolvedShape);

  // Get control points for path shapes from resolvedShape
  const controlPoints = pass.resolvedShape.mode === 'path'
    ? pass.resolvedShape.controlPoints as Float32Array | undefined
    : undefined;

  for (let i = 0; i < pass.count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;

    ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;

    // Render shape based on mode
    ctx.save();
    ctx.translate(x, y);

    // Render shape - only 'topology' mode (path or primitive)
    const { topology, params } = shapeMode;

    if (isPathTopology(topology)) {
      // Path topology - render using control points as shape template
      if (!controlPoints) {
        throw new Error(
          `Path topology '${topology.id}' requires control points buffer. ` +
          `Ensure the shape signal includes a control point field.`
        );
      }
      renderPathAtParticle(ctx, topology, controlPoints, scale, width, height);
    } else {
      // Primitive topology (ellipse, rect) - use topology render function
      // Pass render-space context for normalized→pixel conversion
      topology.render(ctx, params, { width, height, scale });
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
 *
 * ROADMAP PHASE 6 - COORDINATE SPACE ISSUE:
 * Current: Control points are in normalized [0,1] world space, scaled by width/height
 * Future: Control points in LOCAL SPACE (centered at origin, |p|≈O(1))
 *
 * Current rendering flow:
 *   1. Materializer outputs control points in normalized [0,1] space
 *   2. This function scales by width/height to get viewport pixels
 *   3. Size parameter currently unused (control points include radius)
 *
 * Future rendering flow:
 *   1. Materializer outputs control points in local space (e.g., radius 1.0)
 *   2. Renderer applies instance transform BEFORE drawing:
 *      ctx.translate(x, y);    // Already in pixels
 *      ctx.rotate(rotation);   // Instance rotation
 *      ctx.scale(size, size);  // Instance size
 *   3. Draw path with local-space points (no width/height scaling)
 *
 * This change makes:
 * - Geometry independent of viewport dimensions
 * - Size/rotation modulators work uniformly
 * - Control points reusable across different instance layouts
 *
 * MIGRATION: Will require changes to field kernels (polygonVertex, etc.)
 * to output local-space coordinates instead of normalized world-space.
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
 * Shape rendering mode - topology only (legacy and perParticle removed)
 */
type ShapeMode = { topology: TopologyDef; params: Record<string, number> };

/**
 * Convert ResolvedShape to ShapeMode
 *
 * RenderAssembler provides pre-resolved shapes with:
 * - Topology lookup already done (but we still need to get the render function)
 * - Params resolved with defaults applied
 *
 * This is a simple conversion - no interpretation logic.
 */
function convertResolvedShapeToMode(resolved: ResolvedShape): ShapeMode {
  // Get topology for render function
  const topology = getTopology(resolved.topologyId);
  return {
    topology,
    params: resolved.params,
  };
}
