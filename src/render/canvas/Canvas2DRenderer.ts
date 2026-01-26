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

// ============================================================================
// EXTRUDELITE: 2.5D Relief Rendering (Experimental)
// Import for dispatch - delete when real mesh3d arrives.
// ============================================================================

import { drawExtrudeLite } from './canvas2dDrawExtrudeLite';
import type { ExtrudeLiteInput, ExtrudeLiteParams, RGBA01 } from './ExtrudeLite';

// ============================================================================
// END EXTRUDELITE IMPORTS
// ============================================================================

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
  // ============================================================================
  // EXTRUDELITE DISPATCH (Experimental - delete when real mesh3d arrives)
  // ============================================================================
  if (op.style.depthStyle === 'extrudeLite') {
    renderExtrudeLiteOp(ctx, op, width, height);
    return;
  }
  // ============================================================================
  // END EXTRUDELITE DISPATCH
  // ============================================================================

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
      const dashPx = style.dashPattern.map((d: number) => d * D);
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

// ============================================================================
// EXTRUDELITE: 2.5D Relief Rendering (Experimental)
// Isolate all extrude logic here. Delete this section when real mesh3d arrives.
// ============================================================================

const DEFAULT_EXTRUDE_PARAMS: ExtrudeLiteParams = {
  extrudeHeight: 0.01,
  lightDir: [-0.6, -0.8] as const,
  shadeStrength: 0.25,
  sideAlpha: 0.9,
};

/**
 * Render a DrawPathInstancesOp with ExtrudeLite 2.5D effect.
 *
 * This function bridges the DrawPathInstancesOp format to ExtrudeLiteInput format,
 * then delegates to drawExtrudeLite() for the actual rendering.
 */
function renderExtrudeLiteOp(
  ctx: CanvasRenderingContext2D,
  op: DrawPathInstancesOp,
  width: number,
  height: number
): void {
  const { geometry, instances, style } = op;
  const { count, position, size, rotation, scale2 } = instances;

  // Early exit if no fill color
  if (!style.fillColor || style.fillColor.length === 0) {
    console.warn('ExtrudeLite requires fillColor, skipping');
    return;
  }

  const uniformFillColor = style.fillColor.length === 4;

  // Convert DrawPathInstancesOp instances to ExtrudeLiteInput format
  const extrudeInstances: ExtrudeLiteInput[] = [];

  for (let i = 0; i < count; i++) {
    // Transform geometry points to screen space for this instance
    const screenPoints = transformGeometryToScreenSpace(
      geometry,
      instances,
      i,
      width,
      height
    );

    // Extract fill color (RGBA in [0,1] range)
    const fillOffset = uniformFillColor ? 0 : i * 4;
    const fill: RGBA01 = [
      style.fillColor[fillOffset] / 255,
      style.fillColor[fillOffset + 1] / 255,
      style.fillColor[fillOffset + 2] / 255,
      style.fillColor[fillOffset + 3] / 255,
    ];

    extrudeInstances.push({
      pointsXY: screenPoints,
      fill,
    });
  }

  // Call drawExtrudeLite with converted inputs
  drawExtrudeLite({
    ctx,
    widthPx: width,
    heightPx: height,
    instances: extrudeInstances,
    params: style.extrudeLiteParams ?? DEFAULT_EXTRUDE_PARAMS,
  });
}

/**
 * Transform local-space geometry points to normalized screen-space [0,1] for a specific instance.
 *
 * Applies instance transforms (position, size, rotation, scale2) to convert
 * local-space control points into screen-space polygon points.
 *
 * @returns Float32Array of screen-space points in normalized [0,1] coordinates
 */
function transformGeometryToScreenSpace(
  geometry: { verbs: Uint8Array; points: Float32Array },
  instances: { position: Float32Array; size: number | Float32Array; rotation?: Float32Array; scale2?: Float32Array },
  instanceIndex: number,
  width: number,
  height: number
): Float32Array {
  // Get instance transforms
  const posX = instances.position[instanceIndex * 2];
  const posY = instances.position[instanceIndex * 2 + 1];
  const instanceSize = typeof instances.size === 'number' ? instances.size : instances.size[instanceIndex];
  const rot = instances.rotation ? instances.rotation[instanceIndex] : 0;
  const sx = instances.scale2 ? instances.scale2[instanceIndex * 2] : 1;
  const sy = instances.scale2 ? instances.scale2[instanceIndex * 2 + 1] : 1;

  // Reference dimension for size scaling
  const D = Math.min(width, height);
  const sizePx = instanceSize * D;

  // Build screen-space polygon by extracting path points
  const screenPoints: number[] = [];
  let pointIndex = 0;

  for (let i = 0; i < geometry.verbs.length; i++) {
    const verb = geometry.verbs[i];

    switch (verb) {
      case 0: { // MOVE
        const [sx_out, sy_out] = transformPoint(
          geometry.points[pointIndex * 2],
          geometry.points[pointIndex * 2 + 1],
          posX, posY, sizePx, rot, sx, sy, width, height
        );
        screenPoints.push(sx_out, sy_out);
        pointIndex++;
        break;
      }

      case 1: { // LINE
        const [sx_out, sy_out] = transformPoint(
          geometry.points[pointIndex * 2],
          geometry.points[pointIndex * 2 + 1],
          posX, posY, sizePx, rot, sx, sy, width, height
        );
        screenPoints.push(sx_out, sy_out);
        pointIndex++;
        break;
      }

      case 2: { // CUBIC
        // Skip control points, only use endpoint
        pointIndex += 2;
        const [sx_out, sy_out] = transformPoint(
          geometry.points[pointIndex * 2],
          geometry.points[pointIndex * 2 + 1],
          posX, posY, sizePx, rot, sx, sy, width, height
        );
        screenPoints.push(sx_out, sy_out);
        pointIndex++;
        break;
      }

      case 3: { // QUAD
        // Skip control point, only use endpoint
        pointIndex++;
        const [sx_out, sy_out] = transformPoint(
          geometry.points[pointIndex * 2],
          geometry.points[pointIndex * 2 + 1],
          posX, posY, sizePx, rot, sx, sy, width, height
        );
        screenPoints.push(sx_out, sy_out);
        pointIndex++;
        break;
      }

      case 4: { // CLOSE
        // No-op: polygon is closed by nature
        break;
      }
    }
  }

  return new Float32Array(screenPoints);
}

/**
 * Transform a single local-space point to normalized screen-space.
 *
 * @returns [x, y] in normalized [0,1] screen coordinates
 */
function transformPoint(
  localX: number,
  localY: number,
  posX: number,
  posY: number,
  sizePx: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  width: number,
  height: number
): [number, number] {
  // Apply local scale
  let x = localX * scaleX;
  let y = localY * scaleY;

  // Apply rotation
  if (rotation !== 0) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const xRot = x * cos - y * sin;
    const yRot = x * sin + y * cos;
    x = xRot;
    y = yRot;
  }

  // Apply size scaling
  x *= sizePx;
  y *= sizePx;

  // Translate to world position (in pixels)
  x += posX * width;
  y += posY * height;

  // Convert back to normalized [0,1] coordinates
  return [x / width, y / height];
}

/**
 * Render a DrawPrimitiveInstancesOp with ExtrudeLite 2.5D effect.
 *
 * Converts primitives (ellipse, rect) to polygon approximations,
 * then delegates to drawExtrudeLite() for the actual rendering.
 *
 * - Ellipse → N-sided regular polygon (default 24 sides)
 * - Rect → 4-corner polygon
 */
function renderExtrudeLitePrimitiveOp(
  ctx: CanvasRenderingContext2D,
  op: DrawPrimitiveInstancesOp,
  width: number,
  height: number
): void {
  const { geometry, instances, style } = op;
  const { count, position, size, rotation, scale2 } = instances;

  // Early exit if no fill color
  if (!style.fillColor || style.fillColor.length === 0) {
    console.warn('ExtrudeLite requires fillColor, skipping');
    return;
  }

  const uniformFillColor = style.fillColor.length === 4;
  const D = Math.min(width, height);

  // Convert DrawPrimitiveInstancesOp instances to ExtrudeLiteInput format
  const extrudeInstances: ExtrudeLiteInput[] = [];

  for (let i = 0; i < count; i++) {
    // Get instance transforms
    const posX = position[i * 2];
    const posY = position[i * 2 + 1];
    const instanceSize = typeof size === 'number' ? size : size[i];
    const rot = rotation ? rotation[i] : 0;
    const sx = scale2 ? scale2[i * 2] : 1;
    const sy = scale2 ? scale2[i * 2 + 1] : 1;

    // Generate polygon points for this primitive
    const screenPoints = generatePrimitivePolygon(
      geometry.topologyId,
      geometry.params,
      posX, posY, instanceSize, rot, sx, sy,
      width, height, D
    );

    // Extract fill color (RGBA in [0,1] range)
    const fillOffset = uniformFillColor ? 0 : i * 4;
    const fill: RGBA01 = [
      style.fillColor[fillOffset] / 255,
      style.fillColor[fillOffset + 1] / 255,
      style.fillColor[fillOffset + 2] / 255,
      style.fillColor[fillOffset + 3] / 255,
    ];

    extrudeInstances.push({
      pointsXY: screenPoints,
      fill,
    });
  }

  // Call drawExtrudeLite with converted inputs
  drawExtrudeLite({
    ctx,
    widthPx: width,
    heightPx: height,
    instances: extrudeInstances,
    params: style.extrudeLiteParams ?? DEFAULT_EXTRUDE_PARAMS,
  });
}

/**
 * Generate polygon approximation for a primitive topology.
 *
 * @returns Float32Array of screen-space points in normalized [0,1] coordinates
 */
function generatePrimitivePolygon(
  topologyId: number,
  params: Record<string, number>,
  posX: number,
  posY: number,
  instanceSize: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  width: number,
  height: number,
  D: number
): Float32Array {
  const sizePx = instanceSize * D;

  // TOPOLOGY_ID_ELLIPSE = 0
  if (topologyId === 0) {
    // Ellipse → N-sided polygon approximation
    const ELLIPSE_SEGMENTS = 24;
    const rx = (params.rx ?? 0.02) * width * instanceSize;
    const ry = (params.ry ?? 0.02) * height * instanceSize;
    const ellipseRotation = params.rotation ?? 0;
    const totalRotation = rotation + ellipseRotation;

    const points: number[] = [];
    for (let j = 0; j < ELLIPSE_SEGMENTS; j++) {
      const angle = (j / ELLIPSE_SEGMENTS) * Math.PI * 2;

      // Local ellipse point
      let lx = Math.cos(angle) * rx * scaleX;
      let ly = Math.sin(angle) * ry * scaleY;

      // Apply rotation
      if (totalRotation !== 0) {
        const cos = Math.cos(totalRotation);
        const sin = Math.sin(totalRotation);
        const xRot = lx * cos - ly * sin;
        const yRot = lx * sin + ly * cos;
        lx = xRot;
        ly = yRot;
      }

      // Translate to world position and normalize
      const screenX = (posX * width + lx) / width;
      const screenY = (posY * height + ly) / height;
      points.push(screenX, screenY);
    }
    return new Float32Array(points);
  }

  // TOPOLOGY_ID_RECT = 1
  if (topologyId === 1) {
    // Rectangle → 4-corner polygon
    const w = (params.width ?? 0.04) * width * instanceSize;
    const h = (params.height ?? 0.02) * height * instanceSize;
    const rectRotation = params.rotation ?? 0;
    const totalRotation = rotation + rectRotation;

    // Half dimensions
    const hw = (w / 2) * scaleX;
    const hh = (h / 2) * scaleY;

    // Local corners (counterclockwise from top-left)
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];

    const points: number[] = [];
    for (const [lx, ly] of corners) {
      let x = lx;
      let y = ly;

      // Apply rotation
      if (totalRotation !== 0) {
        const cos = Math.cos(totalRotation);
        const sin = Math.sin(totalRotation);
        x = lx * cos - ly * sin;
        y = lx * sin + ly * cos;
      }

      // Translate to world position and normalize
      const screenX = (posX * width + x) / width;
      const screenY = (posY * height + y) / height;
      points.push(screenX, screenY);
    }
    return new Float32Array(points);
  }

  // Fallback: unknown topology - return empty (will be skipped)
  console.warn(`ExtrudeLite: Unknown topology ${topologyId}, skipping`);
  return new Float32Array(0);
}

// ============================================================================
// END EXTRUDELITE SECTION
// ============================================================================

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
  // ============================================================================
  // EXTRUDELITE DISPATCH (Experimental - delete when real mesh3d arrives)
  // ============================================================================
  if (op.style.depthStyle === 'extrudeLite') {
    renderExtrudeLitePrimitiveOp(ctx, op, width, height);
    return;
  }
  // ============================================================================
  // END EXTRUDELITE DISPATCH
  // ============================================================================

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
