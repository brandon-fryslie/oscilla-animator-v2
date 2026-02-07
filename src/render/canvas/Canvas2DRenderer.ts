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

import { isPathTopology } from '../../runtime/RenderAssembler';
import { getTopology } from '../../shapes/registry';
import type { PathTopologyDef, PathVerb, TopologyDef } from '../../shapes/types';
import type {
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  PathStyle,
  RenderFrameIR,
} from '../types';

/** Singleton empty dash array — avoids per-frame allocation from setLineDash([]) */
const EMPTY_DASH: number[] = [];

/** Reusable dash pattern buffer — avoids .map() allocation per frame */
let _dashBuffer: number[] = [];

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





export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrameIR,
  width: number,
  height: number,
  skipClear = false
): void {
  if (!skipClear) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }

  // Render each operation
  for (const op of frame.ops) {
    if (op.kind === 'drawPathInstances') {
      renderDrawPathInstancesOp(ctx, op, width, height);
    } else if (op.kind === 'drawPrimitiveInstances') {
      renderDrawPrimitiveInstancesOp(ctx, op, width, height);
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
      // Scale dash pattern from world units to pixels (reuse buffer)
      const patLen = style.dashPattern.length;
      _dashBuffer.length = patLen;
      for (let d = 0; d < patLen; d++) {
        _dashBuffer[d] = style.dashPattern[d] * D;
      }
      ctx.setLineDash(_dashBuffer);
      ctx.lineDashOffset = (style.dashOffset ?? 0) * D;
    } else {
      ctx.setLineDash(EMPTY_DASH);
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
    ctx.setLineDash(EMPTY_DASH);
  }
}

/**
 * Render a single DrawPrimitiveInstancesOp.
 *
 * Renders primitive topologies (ellipse, rect) using topology.render().
 * Applies instance transforms (position, size, rotation, scale2) per instance.
 */
export function renderDrawPrimitiveInstancesOp(
  ctx: CanvasRenderingContext2D,
  op: DrawPrimitiveInstancesOp,
  width: number,
  height: number
): void {
  const { geometry, instances, style } = op;
  const { count, position, size, rotation, scale2 } = instances;

  // Get topology for render function
  const topology = getTopology(geometry.topologyId);

  // Determine rendering mode
  const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;

  if (!hasFill) {
    // No-op: nothing to render (primitives only support fill for now)
    console.warn('DrawPrimitiveInstancesOp has no fill color, skipping');
    return;
  }

  const uniformFillColor = style.fillColor!.length === 4;

  // Fast inner loop - no validation checks
  for (let i = 0; i < count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;

    // Set fill color
    if (uniformFillColor) {
      ctx.fillStyle = rgbaToCSS(style.fillColor!, 0);
    } else {
      ctx.fillStyle = rgbaToCSS(style.fillColor!, i * 4);
    }

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

    // Call topology.render() with params and RenderSpace2D
    // The topology will handle its own drawing (ellipse, rect, etc.)
    topology.render(ctx, geometry.params, {
      width,
      height,
      scale: instanceSize,
    });

    ctx.restore();
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
        throw new Error(`Unknown path verb: ${verb}. Valid verbs are 0-4 (MOVE, LINE, CUBIC, QUAD, CLOSE).`);
      }
    }
  }
}
