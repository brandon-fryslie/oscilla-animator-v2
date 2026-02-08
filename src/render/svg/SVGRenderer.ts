/**
 * SVG Renderer - Geometry Reuse via <defs>/<use>
 *
 * Consumes DrawPathInstancesOp from RenderAssembler v2 and outputs SVG.
 *
 * Key invariants:
 * - Geometry definitions in <defs> persist across frames.
 * - Per-frame work clears only instance nodes (<use> / primitive elements).
 * - Geometry reuse is keyed by (topologyId, points-buffer identity), not by content hashing.
 * - Color buffers may be Uint8ClampedArray RGBA (0..255) or Float32Array RGBA (0..1); both are rendered correctly.
 */

import type {
  RenderFrameIR,
  DrawPathInstancesOp,
  DrawPrimitiveInstancesOp,
  PathGeometry
} from '../types';
import { getTopology } from '../../shapes/registry';
import type { PathTopologyDef } from '../../shapes/types';

/**
 * Convert path geometry to SVG d-string.
 *
 * Supports verbs: MOVE (0), LINE (1), CUBIC (2), QUAD (3), CLOSE (4).
 * Points are in local space.
 */
export function pathToSvgD(
    verbs: Uint8Array,
    points: Float32Array,
    pointsCount: number
): string {
  const parts: string[] = [];
  let pi = 0;

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

  if (pi !== pointsCount) {
    console.warn(`pathToSvgD: Expected ${pointsCount} points, consumed ${pi}`);
  }

  return parts.join(' ');
}

/**
 * Geometry definition cache:
 * - Keyed by (topologyId, points Float32Array identity).
 * - Stores an actual <defs> element id that persists across frames.
 */
class GeometryDefCache {
  private defIdByKey = new Map<string, string>();
  private bufferIds = new WeakMap<Float32Array, number>();
  private nextBufferId = 1;
  private nextDefId = 1;

  clear(): void {
    this.defIdByKey.clear();
    // WeakMap auto-clears with GC; do not reset bufferIds.
  }

  getOrCreatePathDefId(
      defs: SVGDefsElement,
      geometry: PathGeometry
  ): string {
    const key = this.computeKey(geometry.topologyId, geometry.points);
    const existingId = this.defIdByKey.get(key);
    if (existingId) return existingId;

    const id = `geom_${this.nextDefId++}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', id);
    path.setAttribute('d', pathToSvgD(geometry.verbs, geometry.points, geometry.pointsCount));
    defs.appendChild(path);

    this.defIdByKey.set(key, id);
    return id;
  }

  private computeKey(topologyId: number, points: Float32Array): string {
    let bid = this.bufferIds.get(points);
    if (!bid) {
      bid = this.nextBufferId++;
      this.bufferIds.set(points, bid);
    }
    return `${topologyId}:buf${bid}`;
  }
}

/**
 * Convert RGBA buffer (either bytes 0..255 or floats 0..1) to CSS rgba().
 * This is deterministic:
 * - Uint8ClampedArray => bytes
 * - Float32Array      => floats in [0,1] (clamped)
 */
function rgbaToCSS(color: ArrayBufferView, offset: number): string {
  if (color instanceof Uint8ClampedArray) {
    const r = color[offset];
    const g = color[offset + 1];
    const b = color[offset + 2];
    const a = color[offset + 3] / 255;
    return `rgba(${r},${g},${b},${clamp01(a)})`;
  }

  if (color instanceof Float32Array) {
    const r = Math.round(clamp01(color[offset]) * 255);
    const g = Math.round(clamp01(color[offset + 1]) * 255);
    const b = Math.round(clamp01(color[offset + 2]) * 255);
    const a = clamp01(color[offset + 3]);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Fallback: treat as bytes using a Uint8 view over underlying buffer.
  const u8 = new Uint8ClampedArray(color.buffer, color.byteOffset, color.byteLength);
  const r = u8[offset];
  const g = u8[offset + 1];
  const b = u8[offset + 2];
  const a = u8[offset + 3] / 255;
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * SVG Renderer using <defs>/<use> for efficient geometry reuse across instances AND frames.
 */
export class SVGRenderer {
  private svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private renderGroup: SVGGElement;

  private width: number;
  private height: number;

  private geomDefs = new GeometryDefCache();

  constructor(container: HTMLElement, width: number, height: number) {
    this.width = width;
    this.height = height;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.style.backgroundColor = '#000';

    this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.svg.appendChild(this.defs);

    this.renderGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.renderGroup);

    container.appendChild(this.svg);
  }

  render(frame: RenderFrameIR): void {
    this.clearFrameInstances();

    for (const op of frame.ops) {
      if (op.kind === 'drawPathInstances') {
        this.renderDrawPathInstancesOp(op);
      } else if (op.kind === 'drawPrimitiveInstances') {
        this.renderDrawPrimitiveInstancesOp(op);
      }
    }
  }

  private renderDrawPathInstancesOp(op: DrawPathInstancesOp): void {
    const { geometry, instances, style } = op;
    const { count, position, size, rotation, scale2 } = instances;

    const defId = this.geomDefs.getOrCreatePathDefId(this.defs, geometry);
    const D = Math.min(this.width, this.height);

    // [LAW:dataflow-not-control-flow] exception: SVG fill/stroke attributes with 'none' still
    // create DOM overhead. No identity value exists — the only neutral action is omitting the
    // attribute. This is an SVG API boundary constraint.
    const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;
    const hasStroke = style.strokeColor !== undefined && style.strokeColor.length > 0;

    const uniformFill = hasFill && style.fillColor!.length === 4;
    const uniformStroke = hasStroke && style.strokeColor!.length === 4;

    // Pre-compute dash string outside the per-instance loop (style & D are uniform)
    const dashStr = style.dashPattern && style.dashPattern.length > 0
      ? style.dashPattern.map(d => d * D).join(' ')
      : null;
    const dashOffsetStr = dashStr && style.dashOffset ? String(style.dashOffset * D) : null;

    for (let i = 0; i < count; i++) {
      const x = position[i * 2] * this.width;
      const y = position[i * 2 + 1] * this.height;

      const instanceSize = typeof size === 'number' ? size : size[i];
      const sizePx = instanceSize * D;

      // [LAW:dataflow-not-control-flow] rotation and scale2 are always present
      const rotDeg = rotation[i] * (180 / Math.PI);
      const transform = `translate(${x} ${y}) rotate(${rotDeg}) scale(${sizePx * scale2[i * 2]} ${sizePx * scale2[i * 2 + 1]})`;

      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${defId}`);
      use.setAttribute('transform', transform);

      // Fill
      if (hasFill) {
        use.setAttribute(
            'fill',
            uniformFill ? rgbaToCSS(style.fillColor!, 0) : rgbaToCSS(style.fillColor!, i * 4)
        );
      } else {
        use.setAttribute('fill', 'none');
      }

      // Stroke
      if (hasStroke) {
        use.setAttribute(
            'stroke',
            uniformStroke ? rgbaToCSS(style.strokeColor!, 0) : rgbaToCSS(style.strokeColor!, i * 4)
        );

        const strokeWidthLocal = typeof style.strokeWidth === 'number'
            ? style.strokeWidth
            : style.strokeWidth
                ? (style.strokeWidth as Float32Array)[i]
                : 0.01;

        // Stroke width in viewport units. Keeps stroke visually stable across scaling.
        // (If you want stroke to scale with object size instead, remove vector-effect and use local width.)
        use.setAttribute('vector-effect', 'non-scaling-stroke');
        use.setAttribute('stroke-width', String(strokeWidthLocal * D));

        if (style.lineJoin) use.setAttribute('stroke-linejoin', style.lineJoin);
        if (style.lineCap) use.setAttribute('stroke-linecap', style.lineCap);

        if (dashStr) {
          use.setAttribute('stroke-dasharray', dashStr);
          if (dashOffsetStr) {
            use.setAttribute('stroke-dashoffset', dashOffsetStr);
          }
        }
      }

      this.renderGroup.appendChild(use);
    }
  }

  /**
   * Render primitives (ellipse, rect) as inline SVG elements.
   */
  private renderDrawPrimitiveInstancesOp(op: DrawPrimitiveInstancesOp): void {
    const { geometry, instances, style } = op;
    const { count, position, size, rotation, scale2 } = instances;

    const topology = getTopology(geometry.topologyId);
    const D = Math.min(this.width, this.height);

    // [LAW:dataflow-not-control-flow] exception: same SVG API boundary as path ops above.
    const hasFill = style.fillColor !== undefined && style.fillColor.length > 0;
    const uniformFill = hasFill && style.fillColor!.length === 4;

    const hasStroke = style.strokeColor !== undefined && style.strokeColor.length > 0;
    const uniformStroke = hasStroke && style.strokeColor!.length === 4;

    // Pre-compute dash string outside the per-instance loop (style & D are uniform)
    const primDashStr = style.dashPattern && style.dashPattern.length > 0
      ? style.dashPattern.map(d => d * D).join(' ')
      : null;
    const primDashOffsetStr = primDashStr && style.dashOffset ? String(style.dashOffset * D) : null;

    for (let i = 0; i < count; i++) {
      const x = position[i * 2] * this.width;
      const y = position[i * 2 + 1] * this.height;

      const instanceSize = typeof size === 'number' ? size : size[i];
      const sizePx = instanceSize * D;

      // [LAW:dataflow-not-control-flow] scale2 is always present (identity = [1,1])
      const sx = scale2[i * 2];
      const sy = scale2[i * 2 + 1];

      let element: SVGElement;

      if (topology.id === 0) { // ellipse
        const rx = geometry.params.rx ?? 0.5;
        const ry = geometry.params.ry ?? 0.5;

        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', String(x));
        ellipse.setAttribute('cy', String(y));
        ellipse.setAttribute('rx', String(rx * sizePx * sx));
        ellipse.setAttribute('ry', String(ry * sizePx * sy));
        element = ellipse;
      } else if (topology.id === 1) { // rect
        const w0 = geometry.params.width ?? 1.0;
        const h0 = geometry.params.height ?? 1.0;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const w = w0 * sizePx * sx;
        const h = h0 * sizePx * sy;
        rect.setAttribute('x', String(x - w / 2));
        rect.setAttribute('y', String(y - h / 2));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        element = rect;
      } else {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', String(sizePx));
        element = circle;
      }

      // [LAW:dataflow-not-control-flow] rotation is always present (identity = 0)
      const rotDeg = rotation[i] * (180 / Math.PI);
      element.setAttribute('transform', `rotate(${rotDeg} ${x} ${y})`);

      // Fill
      if (hasFill) {
        element.setAttribute(
            'fill',
            uniformFill ? rgbaToCSS(style.fillColor!, 0) : rgbaToCSS(style.fillColor!, i * 4)
        );
      } else {
        element.setAttribute('fill', 'none');
      }

      // Stroke
      if (hasStroke) {
        element.setAttribute(
            'stroke',
            uniformStroke ? rgbaToCSS(style.strokeColor!, 0) : rgbaToCSS(style.strokeColor!, i * 4)
        );

        const strokeWidthLocal = typeof style.strokeWidth === 'number'
            ? style.strokeWidth
            : style.strokeWidth
                ? (style.strokeWidth as Float32Array)[i]
                : 0.01;

        element.setAttribute('vector-effect', 'non-scaling-stroke');
        element.setAttribute('stroke-width', String(strokeWidthLocal * D));

        if (style.lineJoin) element.setAttribute('stroke-linejoin', style.lineJoin);
        if (style.lineCap) element.setAttribute('stroke-linecap', style.lineCap);

        if (primDashStr) {
          element.setAttribute('stroke-dasharray', primDashStr);
          if (primDashOffsetStr) {
            element.setAttribute('stroke-dashoffset', primDashOffsetStr);
          }
        }
      }

      this.renderGroup.appendChild(element);
    }
  }

  /**
   * Per-frame clear: remove instance nodes only.
   * Geometry defs persist across frames.
   */
  private clearFrameInstances(): void {
    while (this.renderGroup.firstChild) {
      this.renderGroup.removeChild(this.renderGroup.firstChild);
    }
  }

  /**
   * Invalidate geometry cache on program change (hot-swap).
   * New programs produce new Float32Array buffers, so old cache keys are stale.
   */
  invalidateGeometryCache(): void {
    while (this.defs.firstChild) {
      this.defs.removeChild(this.defs.firstChild);
    }
    this.geomDefs.clear();
  }

  /**
   * Full clear (instances + defs + caches).
   * Use only when you know geometry buffers/topologies are invalidated globally.
   */
  clearAll(): void {
    this.clearFrameInstances();

    while (this.defs.firstChild) {
      this.defs.removeChild(this.defs.firstChild);
    }

    this.geomDefs.clear();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  getSVGElement(): SVGSVGElement {
    return this.svg;
  }

  toSVGString(): string {
    return new XMLSerializer().serializeToString(this.svg);
  }

  dispose(): void {
    this.clearAll();
    this.svg.parentElement?.removeChild(this.svg);
  }
}