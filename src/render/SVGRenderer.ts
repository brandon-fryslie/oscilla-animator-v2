/**
 * SVG Renderer - Geometry Reuse via <defs>/<use>
 *
 * Consumes DrawPathInstancesOp from RenderAssembler v2 and outputs SVG.
 * Key optimization: <defs>/<use> pattern for shared geometry templates.
 *
 * Architecture:
 * - Each unique (topologyId, points buffer) → one <path> in <defs>
 * - Each instance → one <use> with transform attribute
 * - GeometryCache tracks buffer identity via WeakMap for efficiency
 *
 * Coordinate spaces (same as Canvas2D):
 * - LOCAL SPACE: Control points centered at (0,0), |p| ≈ O(1)
 * - WORLD SPACE: Instance positions normalized [0,1]
 * - VIEWPORT SPACE: Final SVG coordinates
 *
 * Usage:
 *   const renderer = new SVGRenderer(container, 800, 600);
 *   renderer.render(frame);
 *   // ...later...
 *   renderer.dispose();
 */

import type { RenderFrameIR, DrawPathInstancesOp, DrawPrimitiveInstancesOp, PathGeometry, PrimitiveGeometry, PathStyle } from './types';
import { isPathTopology } from '../runtime/RenderAssembler';
import { getTopology } from '../shapes/registry';
import type { PathTopologyDef, TopologyDef } from '../shapes/types';

/**
 * Cache for geometry d-strings.
 * Uses WeakMap for buffer identity tracking to avoid content hashing.
 */
class GeometryCache {
  private cache = new Map<string, string>();
  private bufferKeys = new WeakMap<Float32Array, string>();
  private nextBufferId = 0;

  /**
   * Get or create a cached d-string for a geometry.
   *
   * @param topologyId - Topology identifier
   * @param points - Points buffer (identity used for cache key)
   * @param factory - Factory to create d-string if not cached
   * @returns Cached or newly created d-string
   */
  get(
    topologyId: number,
    points: Float32Array,
    factory: () => string
  ): string {
    const key = this.computeKey(topologyId, points);
    if (!this.cache.has(key)) {
      this.cache.set(key, factory());
    }
    return this.cache.get(key)!;
  }

  private computeKey(topologyId: number, points: Float32Array): string {
    let bufferKey = this.bufferKeys.get(points);
    if (!bufferKey) {
      bufferKey = `buf_${this.nextBufferId++}`;
      this.bufferKeys.set(points, bufferKey);
    }
    return `${topologyId}:${bufferKey}`;
  }

  /** Clear all cached entries */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Convert path geometry to SVG d-string.
 *
 * Supports all path verbs: MOVE (0), LINE (1), CUBIC (2), QUAD (3), CLOSE (4).
 * Points are in local space and used directly without scaling.
 *
 * @param verbs - Path verbs array
 * @param points - Control points (x,y interleaved)
 * @param pointsCount - Number of points (points.length / 2)
 * @returns SVG path d-string
 */
export function pathToSvgD(
  verbs: Uint8Array,
  points: Float32Array,
  pointsCount: number
): string {
  const parts: string[] = [];
  let pi = 0; // Point index

  for (let vi = 0; vi < verbs.length; vi++) {
    const verb = verbs[vi];

    switch (verb) {
      case 0: { // MOVE
        const x = points[pi * 2];
        const y = points[pi * 2 + 1];
        parts.push(`M ${x} ${y}`);
        pi++;
        break;
      }
      case 1: { // LINE
        const x = points[pi * 2];
        const y = points[pi * 2 + 1];
        parts.push(`L ${x} ${y}`);
        pi++;
        break;
      }
      case 2: { // CUBIC
        const cp1x = points[pi * 2];
        const cp1y = points[pi * 2 + 1];
        pi++;
        const cp2x = points[pi * 2];
        const cp2y = points[pi * 2 + 1];
        pi++;
        const endx = points[pi * 2];
        const endy = points[pi * 2 + 1];
        pi++;
        parts.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${endx} ${endy}`);
        break;
      }
      case 3: { // QUAD
        const cpx = points[pi * 2];
        const cpy = points[pi * 2 + 1];
        pi++;
        const endx = points[pi * 2];
        const endy = points[pi * 2 + 1];
        pi++;
        parts.push(`Q ${cpx} ${cpy} ${endx} ${endy}`);
        break;
      }
      case 4: { // CLOSE
        parts.push('Z');
        break;
      }
      default:
        throw new Error(`Unknown path verb: ${verb}`);
    }
  }

  // Validate we consumed expected number of points
  if (pi !== pointsCount) {
    console.warn(`pathToSvgD: Expected ${pointsCount} points, consumed ${pi}`);
  }

  return parts.join(' ');
}

/**
 * Convert RGBA buffer to CSS color string.
 */
function rgbaToCSS(color: Uint8ClampedArray | ArrayBufferView, offset: number): string {
  const colorArray = color as Uint8ClampedArray;
  const r = colorArray[offset];
  const g = colorArray[offset + 1];
  const b = colorArray[offset + 2];
  const a = colorArray[offset + 3] / 255;
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * SVG Renderer using <defs>/<use> pattern for efficient geometry reuse.
 */
export class SVGRenderer {
  private svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private renderGroup: SVGGElement;
  private geometryCache = new GeometryCache();
  private defIdCounter = 0;
  private width: number;
  private height: number;

  constructor(container: HTMLElement, width: number, height: number) {
    this.width = width;
    this.height = height;

    // Create SVG element
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.style.backgroundColor = '#000';

    // Create defs for geometry templates
    this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.svg.appendChild(this.defs);

    // Create render group for instances
    this.renderGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.renderGroup);

    container.appendChild(this.svg);
  }

  /**
   * Render a v2 frame to SVG.
   *
   * @param frame - Frame containing DrawOps
   */
  render(frame: RenderFrameIR): void {
    this.clear();

    for (const op of frame.ops) {
      if (op.kind === 'drawPathInstances') {
        this.renderDrawPathInstancesOp(op);
      } else if (op.kind === 'drawPrimitiveInstances') {
        this.renderDrawPrimitiveInstancesOp(op);
      }
    }
  }



  /**
   * Get or create a path geometry definition in <defs>.
   */
  private getOrCreatePathDef(topology: PathTopologyDef, controlPoints: Float32Array): string {
    const cacheKey = this.geometryCache.get(
      topology.id,
      controlPoints,
      () => pathToSvgD(new Uint8Array(topology.verbs), controlPoints, controlPoints.length / 2)
    );

    // Check if we already have this def
    const existingId = `geom_${topology.id}_${this.geometryCache['bufferKeys'].get(controlPoints)}`;
    const existing = this.defs.querySelector(`#${CSS.escape(existingId)}`);
    if (existing) {
      return existingId;
    }

    // Create new definition
    const id = `geom_${this.defIdCounter++}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', id);
    path.setAttribute('d', cacheKey);
    this.defs.appendChild(path);

    return id;
  }

  /**
   * Get or create a circle definition (for primitive topologies).
   */
  private getOrCreateCircleDef(): string {
    const id = 'circle_prim';
    const existing = this.defs.querySelector(`#${id}`);
    if (existing) {
      return id;
    }

    // Create circle centered at origin with radius 1 (will be scaled by instance transform)
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('id', id);
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '1');
    this.defs.appendChild(circle);

    return id;
  }

  /**
   * Render a single DrawPathInstancesOp (v2 path).
   */
  private renderDrawPathInstancesOp(op: DrawPathInstancesOp): void {
    const { geometry, instances, style } = op;
    const { count, position, size, rotation, scale2 } = instances;

    // Get or create geometry template in defs
    const defId = this.getOrCreateGeometryDef(geometry);

    // Reference dimension for scaling
    const D = Math.min(this.width, this.height);

    // Determine fill/stroke modes
    const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;
    const hasStroke = style.strokeColor !== undefined && style.strokeColor.length > 0;
    const uniformFillColor = hasFill && style.fillColor!.length === 4;
    const uniformStrokeColor = hasStroke && style.strokeColor!.length === 4;

    // Create <use> element for each instance
    for (let i = 0; i < count; i++) {
      const x = position[i * 2] * this.width;
      const y = position[i * 2 + 1] * this.height;
      const instanceSize = typeof size === 'number' ? size : size[i];
      const sizePx = instanceSize * D;

      // Build transform string
      let transform = `translate(${x} ${y})`;

      if (rotation) {
        const rot = rotation[i] * (180 / Math.PI); // Convert radians to degrees
        transform += ` rotate(${rot})`;
      }

      if (scale2) {
        transform += ` scale(${sizePx * scale2[i * 2]} ${sizePx * scale2[i * 2 + 1]})`;
      } else {
        transform += ` scale(${sizePx} ${sizePx})`;
      }

      // Create <use> element
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${defId}`);
      use.setAttribute('transform', transform);

      // Apply fill
      if (hasFill) {
        use.setAttribute('fill', uniformFillColor
          ? rgbaToCSS(style.fillColor!, 0)
          : rgbaToCSS(style.fillColor!, i * 4)
        );
      } else {
        use.setAttribute('fill', 'none');
      }

      // Apply stroke
      if (hasStroke) {
        use.setAttribute('stroke', uniformStrokeColor
          ? rgbaToCSS(style.strokeColor!, 0)
          : rgbaToCSS(style.strokeColor!, i * 4)
        );

        // Stroke width (in local space, scaled by instance transform)
        const strokeWidth = typeof style.strokeWidth === 'number'
          ? style.strokeWidth
          : style.strokeWidth
            ? (style.strokeWidth as Float32Array)[i]
            : 0.01; // Default stroke width

        // Convert to SVG units (account for instance scale)
        use.setAttribute('stroke-width', String(strokeWidth * D / sizePx));

        if (style.lineJoin) {
          use.setAttribute('stroke-linejoin', style.lineJoin);
        }
        if (style.lineCap) {
          use.setAttribute('stroke-linecap', style.lineCap);
        }
        if (style.dashPattern && style.dashPattern.length > 0) {
          const dashPx = style.dashPattern.map(d => d * D / sizePx).join(' ');
          use.setAttribute('stroke-dasharray', dashPx);
          if (style.dashOffset) {
            use.setAttribute('stroke-dashoffset', String(style.dashOffset * D / sizePx));
          }
        }
      }

      this.renderGroup.appendChild(use);
    }
  }

  /**
   * Render a single DrawPrimitiveInstancesOp (v2 primitives).
   * 
   * For primitives (ellipse, rect), we create inline SVG elements instead of using <defs>/<use>
   * since primitives are simple enough and don't need geometry sharing optimization.
   */
  private renderDrawPrimitiveInstancesOp(op: DrawPrimitiveInstancesOp): void {
    const { geometry, instances, style } = op;
    const { count, position, size, rotation, scale2 } = instances;

    // Get topology for parameter interpretation
    const topology = getTopology(geometry.topologyId);
    
    // Reference dimension for scaling
    const D = Math.min(this.width, this.height);

    // Determine fill mode
    const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;
    const uniformFillColor = hasFill && style.fillColor!.length === 4;

    // Render each instance
    for (let i = 0; i < count; i++) {
      const x = position[i * 2] * this.width;
      const y = position[i * 2 + 1] * this.height;
      const instanceSize = typeof size === 'number' ? size : size[i];
      const sizePx = instanceSize * D;

      // Create SVG element based on topology
      let element: SVGElement;
      
      if (topology.id === 0) { // TOPOLOGY_ID_ELLIPSE
        // Ellipse primitive
        const rx = geometry.params.rx ?? 0.5;
        const ry = geometry.params.ry ?? 0.5;
        
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', String(x));
        ellipse.setAttribute('cy', String(y));
        
        // Apply size and scale2 to radii
        const sx = scale2 ? scale2[i * 2] : 1;
        const sy = scale2 ? scale2[i * 2 + 1] : 1;
        ellipse.setAttribute('rx', String(rx * sizePx * sx));
        ellipse.setAttribute('ry', String(ry * sizePx * sy));
        
        element = ellipse;
      } else if (topology.id === 1) { // TOPOLOGY_ID_RECT {
        // Rectangle primitive
        const width = geometry.params.width ?? 1.0;
        const height = geometry.params.height ?? 1.0;
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        
        // Apply size and scale2 to dimensions
        const sx = scale2 ? scale2[i * 2] : 1;
        const sy = scale2 ? scale2[i * 2 + 1] : 1;
        const w = width * sizePx * sx;
        const h = height * sizePx * sy;
        
        // Center the rect at (x, y)
        rect.setAttribute('x', String(x - w / 2));
        rect.setAttribute('y', String(y - h / 2));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        
        element = rect;
      } else {
        // Fallback: render as circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', String(sizePx));
        element = circle;
      }

      // Apply rotation if present
      if (rotation) {
        const rot = rotation[i] * (180 / Math.PI); // Convert radians to degrees
        element.setAttribute('transform', `rotate(${rot} ${x} ${y})`);
      }

      // Apply fill
      if (hasFill) {
        element.setAttribute('fill', uniformFillColor
          ? rgbaToCSS(style.fillColor!, 0)
          : rgbaToCSS(style.fillColor!, i * 4)
        );
      } else {
        element.setAttribute('fill', 'none');
      }

      this.renderGroup.appendChild(element);
    }
  }

  /**
   * Get or create a geometry definition in <defs> (v2 path).
   *
   * @param geometry - Path geometry
   * @returns Definition ID for use in href
   */
  private getOrCreateGeometryDef(geometry: PathGeometry): string {
    const cacheKey = this.geometryCache.get(
      geometry.topologyId,
      geometry.points,
      () => pathToSvgD(geometry.verbs, geometry.points, geometry.pointsCount)
    );

    // Check if we already have this def
    const existingId = `geom_${geometry.topologyId}_${this.geometryCache['bufferKeys'].get(geometry.points)}`;
    const existing = this.defs.querySelector(`#${CSS.escape(existingId)}`);
    if (existing) {
      return existingId;
    }

    // Create new definition
    const id = `geom_${this.defIdCounter++}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', id);
    path.setAttribute('d', cacheKey);
    this.defs.appendChild(path);

    return id;
  }

  /**
   * Clear the render group (removes all <use> elements).
   */
  clear(): void {
    while (this.renderGroup.firstChild) {
      this.renderGroup.removeChild(this.renderGroup.firstChild);
    }
    // Also clear defs for fresh frame (geometry may have changed)
    while (this.defs.firstChild) {
      this.defs.removeChild(this.defs.firstChild);
    }
    this.defIdCounter = 0;
    this.geometryCache.clear();
  }

  /**
   * Update viewport dimensions.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  /**
   * Get the SVG element for export.
   */
  getSVGElement(): SVGSVGElement {
    return this.svg;
  }

  /**
   * Export SVG as string.
   */
  toSVGString(): string {
    return new XMLSerializer().serializeToString(this.svg);
  }

  /**
   * Dispose of the renderer and remove SVG from DOM.
   */
  dispose(): void {
    this.svg.parentElement?.removeChild(this.svg);
    this.geometryCache.clear();
  }
}
