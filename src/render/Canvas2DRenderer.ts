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
import type { DrawPathInstancesOp, PathStyle, RenderFrameIR_Future } from './future-types';

/**
 * Calculate stroke width in pixels from world units.
 * 
 * Uses D = min(width, height) for isotropic scaling.
 * This ensures strokes maintain consistent apparent thickness regardless of aspect ratio.
 * 
 * @param strokeWidth - Stroke width in world units (0-1 range)
 * @param width - Viewport width in pixels
 * @param height - Viewport height in pixels
 * @returns Stroke width in pixels
 */
export function calculateStrokeWidthPx(
  strokeWidth: number,
  width: number,
  height: number
): number {
  const D = Math.min(width, height);
  return strokeWidth * D;
}

/**
 * Convert RGBA values to CSS color string.
 * 
 * @param color - Color buffer (Uint8ClampedArray)
 * @param offset - Offset into buffer (index * 4 for per-instance)
 * @returns CSS rgba() string
 */
function rgbaToCSS(color: Uint8ClampedArray, offset: number): string {
  return `rgba(${color[offset]},${color[offset + 1]},${color[offset + 2]},${color[offset + 3] / 255})`;
}

/**
 * Render a frame to a 2D canvas context.
 * 
 * Supports both v1 (RenderFrameIR) and v2 (RenderFrameIR_Future) formats.
 * Dispatches to appropriate render path based on frame structure.
 * 
 * @param ctx - Canvas rendering context
 * @param frame - Frame to render (v1 or v2 format)
 * @param width - Viewport width in pixels
 * @param height - Viewport height in pixels
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrameIR | RenderFrameIR_Future,
  width: number,
  height: number
): void {
  // Check for v2 format (has 'ops' array and version: 2)
  if ('ops' in frame && 'version' in frame && frame.version === 2) {
    renderFrameV2(ctx, frame as RenderFrameIR_Future, width, height);
    return;
  }

  // V1 format: has 'passes' array
  renderFrameV1(ctx, frame as RenderFrameIR, width, height);
}

/**
 * Render a v1 frame (RenderPassIR passes)
 */
function renderFrameV1(
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

// ============================================================================
// V2 Rendering API (DrawPathInstancesOp with full style support)
// ============================================================================

/**
 * Render a v2 frame to a 2D canvas context.
 * 
 * V2 frames contain fully-resolved DrawPathInstancesOp operations.
 * No shape interpretation needed - just apply styles and draw.
 */
export function renderFrameV2(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrameIR_Future,
  width: number,
  height: number
): void {
  // Clear canvas once
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Render each operation
  for (const op of frame.ops) {
    if (op.kind === 'drawPathInstances') {
      renderDrawPathInstancesOp(ctx, op, width, height);
    }
  }
}

/**
 * Render a single DrawPathInstancesOp.
 * 
 * Supports fill-only, stroke-only, or fill+stroke modes based on PathStyle.
 * Applies instance transforms (position, size, rotation, scale2) per instance.
 */
export function renderDrawPathInstancesOp(
  ctx: CanvasRenderingContext2D,
  op: DrawPathInstancesOp,
  width: number,
  height: number
): void {
  const { geometry, instances, style } = op;
  const { count, position, size, rotation, scale2 } = instances;

  // Determine rendering mode
  const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;
  const hasStroke = style.strokeColor !== undefined && style.strokeColor.length > 0;

  if (!hasFill && !hasStroke) {
    // No-op: nothing to render
    console.warn('DrawPathInstancesOp has neither fill nor stroke, skipping');
    return;
  }

  // Pre-calculate reference dimension for stroke width scaling
  const D = Math.min(width, height);

  // Determine if stroke style is uniform or per-instance
  const uniformStrokeColor = hasStroke && style.strokeColor!.length === 4;
  const uniformStrokeWidth = hasStroke && typeof style.strokeWidth === 'number';
  const uniformFillColor = hasFill && style.fillColor!.length === 4;

  // Pre-calculate uniform stroke width if applicable
  const uniformStrokeWidthPx = uniformStrokeWidth
    ? calculateStrokeWidthPx(style.strokeWidth as number, width, height)
    : undefined;

  // Set up line join/cap/dash (these are typically uniform per pass)
  if (hasStroke) {
    ctx.lineJoin = style.lineJoin ?? 'miter';
    ctx.lineCap = style.lineCap ?? 'butt';

    if (style.dashPattern && style.dashPattern.length > 0) {
      // Scale dash pattern from world units to pixels
      const dashPx = style.dashPattern.map(d => d * D);
      ctx.setLineDash(dashPx);
      ctx.lineDashOffset = (style.dashOffset ?? 0) * D;
    } else {
      ctx.setLineDash([]);
    }
  }

  // Fast inner loop - no validation checks
  for (let i = 0; i < count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;

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

    // Calculate instance size
    const instanceSize = typeof size === 'number' ? size : size[i];
    const sizePx = instanceSize * D;

    // Apply instance scale transform
    ctx.scale(sizePx, sizePx);

    // Build path
    ctx.beginPath();
    buildPathFromGeometry(ctx, geometry);

    // Render fill first (if present)
    if (hasFill) {
      if (uniformFillColor) {
        ctx.fillStyle = rgbaToCSS(style.fillColor!, 0);
      } else {
        ctx.fillStyle = rgbaToCSS(style.fillColor!, i * 4);
      }
      ctx.fill(style.fillRule);
    }

    // Render stroke second (on top of fill)
    if (hasStroke) {
      if (uniformStrokeColor) {
        ctx.strokeStyle = rgbaToCSS(style.strokeColor!, 0);
      } else {
        ctx.strokeStyle = rgbaToCSS(style.strokeColor!, i * 4);
      }

      // Set stroke width (accounting for instance scale already applied)
      // Since we've already scaled by sizePx, we need to use unscaled stroke width
      // to get consistent stroke appearance regardless of instance size
      if (uniformStrokeWidthPx !== undefined) {
        ctx.lineWidth = uniformStrokeWidthPx / sizePx;
      } else {
        const instanceStrokeWidth = (style.strokeWidth as Float32Array)[i];
        ctx.lineWidth = calculateStrokeWidthPx(instanceStrokeWidth, width, height) / sizePx;
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  // Reset dash pattern after pass
  if (hasStroke && style.dashPattern && style.dashPattern.length > 0) {
    ctx.setLineDash([]);
  }
}

/**
 * Build a canvas path from PathGeometry.
 * 
 * @param ctx - Canvas context (path already begun with beginPath())
 * @param geometry - Path geometry with verbs and local-space points
 */
function buildPathFromGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: { verbs: Uint8Array; points: Float32Array }
): void {
  let pointIndex = 0;

  for (let i = 0; i < geometry.verbs.length; i++) {
    const verb = geometry.verbs[i];

    switch (verb) {
      case 0: { // MOVE
        const px = geometry.points[pointIndex * 2];
        const py = geometry.points[pointIndex * 2 + 1];
        ctx.moveTo(px, py);
        pointIndex++;
        break;
      }

      case 1: { // LINE
        const px = geometry.points[pointIndex * 2];
        const py = geometry.points[pointIndex * 2 + 1];
        ctx.lineTo(px, py);
        pointIndex++;
        break;
      }

      case 2: { // CUBIC
        const cp1x = geometry.points[pointIndex * 2];
        const cp1y = geometry.points[pointIndex * 2 + 1];
        pointIndex++;
        const cp2x = geometry.points[pointIndex * 2];
        const cp2y = geometry.points[pointIndex * 2 + 1];
        pointIndex++;
        const endx = geometry.points[pointIndex * 2];
        const endy = geometry.points[pointIndex * 2 + 1];
        pointIndex++;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
        break;
      }

      case 3: { // QUAD
        const cpx = geometry.points[pointIndex * 2];
        const cpy = geometry.points[pointIndex * 2 + 1];
        pointIndex++;
        const endx = geometry.points[pointIndex * 2];
        const endy = geometry.points[pointIndex * 2 + 1];
        pointIndex++;
        ctx.quadraticCurveTo(cpx, cpy, endx, endy);
        break;
      }

      case 4: { // CLOSE
        ctx.closePath();
        break;
      }

      default: {
        throw new Error(`Unknown path verb: ${verb}`);
      }
    }
  }
}
