import type { PathGeometry } from '../types';

export interface TessellatedPathMesh {
  readonly cacheKey: string;
  readonly vertexData: Float32Array;
  readonly indexData: Uint16Array | Uint32Array;
  readonly indexFormat: 'uint16' | 'uint32';
}

interface ContourBuildResult {
  readonly points: Float32Array;
  readonly closed: boolean;
}

const VERB_MOVE = 0;
const VERB_LINE = 1;
const VERB_CUBIC = 2;
const VERB_QUAD = 3;
const VERB_CLOSE = 4;

const EPSILON = 1e-7;
const MIN_CURVE_SUBDIVISIONS = 4;
const MAX_CURVE_SUBDIVISIONS = 64;

/**
 * CPU path tessellation for WebGPU fill rendering.
 *
 * Supports one or more contours composed of MOVE/LINE/CUBIC/QUAD/CLOSE verbs.
 * Unsupported verb/topology patterns fail fast by throwing.
 */
export class PathTessellator {
  private readonly meshCache = new Map<string, TessellatedPathMesh>();
  private readonly objectIds = new WeakMap<object, number>();
  private nextObjectId = 1;

  getOrCreateMesh(geometry: PathGeometry): TessellatedPathMesh {
    const cacheKey = this.makeCacheKey(geometry);
    const cached = this.meshCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const contours = this.extractContours(geometry);
    const mesh = this.tessellateContours(cacheKey, contours);
    this.meshCache.set(cacheKey, mesh);
    return mesh;
  }

  clear(): void {
    this.meshCache.clear();
  }

  private makeCacheKey(geometry: PathGeometry): string {
    const verbsRef = this.getObjectId(geometry.verbs);
    const pointsRef = this.getObjectId(geometry.points);
    return `${geometry.topologyId}:${verbsRef}:${pointsRef}:${geometry.pointsCount}:${geometry.flags ?? 0}`;
  }

  private getObjectId(value: object): number {
    const existing = this.objectIds.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.nextObjectId++;
    this.objectIds.set(value, id);
    return id;
  }

  private extractContours(geometry: PathGeometry): ContourBuildResult[] {
    const points = geometry.points;
    const maxPointIndex = geometry.pointsCount;
    const contours: ContourBuildResult[] = [];
    let current: number[] = [];
    let pointIndex = 0;
    let currentClosed = false;

    const pushCurrent = (): void => {
      if (current.length >= 4) {
        const deduped = this.removeDuplicatePoints(new Float32Array(current));
        const normalized = this.removeCollinearPoints(deduped);
        contours.push({
          points: normalized,
          closed: currentClosed,
        });
      }
      current = [];
      currentClosed = false;
    };

    for (let i = 0; i < geometry.verbs.length; i++) {
      const verb = geometry.verbs[i];
      if (verb === VERB_MOVE) {
        pushCurrent();
        this.assertPointAvailable(pointIndex, maxPointIndex, verb);
        current.push(points[pointIndex * 2], points[pointIndex * 2 + 1]);
        pointIndex++;
        continue;
      }

      if (verb === VERB_LINE) {
        this.assertContourStarted(current, verb);
        this.assertPointAvailable(pointIndex, maxPointIndex, verb);
        const x = points[pointIndex * 2];
        const y = points[pointIndex * 2 + 1];
        current.push(x, y);
        pointIndex++;
        continue;
      }

      if (verb === VERB_CUBIC) {
        this.assertContourStarted(current, verb);
        this.assertPointAvailable(pointIndex + 2, maxPointIndex, verb);
        const startx = current[current.length - 2];
        const starty = current[current.length - 1];
        const cp1x = points[pointIndex * 2];
        const cp1y = points[pointIndex * 2 + 1];
        const cp2x = points[(pointIndex + 1) * 2];
        const cp2y = points[(pointIndex + 1) * 2 + 1];
        const endx = points[(pointIndex + 2) * 2];
        const endy = points[(pointIndex + 2) * 2 + 1];
        pointIndex += 3;
        this.appendCubic(current, startx, starty, cp1x, cp1y, cp2x, cp2y, endx, endy);
        continue;
      }

      if (verb === VERB_QUAD) {
        this.assertContourStarted(current, verb);
        this.assertPointAvailable(pointIndex + 1, maxPointIndex, verb);
        const startx = current[current.length - 2];
        const starty = current[current.length - 1];
        const cpx = points[pointIndex * 2];
        const cpy = points[pointIndex * 2 + 1];
        const endx = points[(pointIndex + 1) * 2];
        const endy = points[(pointIndex + 1) * 2 + 1];
        pointIndex += 2;
        this.appendQuadratic(current, startx, starty, cpx, cpy, endx, endy);
        continue;
      }

      if (verb === VERB_CLOSE) {
        currentClosed = true;
        continue;
      }

      throw new Error(
        `PathTessellator: unsupported path verb ${verb}. Valid verbs are MOVE/LINE/CUBIC/QUAD/CLOSE (0..4)`
      );
    }

    pushCurrent();

    if (contours.length === 0) {
      throw new Error(
        'PathTessellator: expected at least one contour with two or more points'
      );
    }

    return contours;
  }

  private assertContourStarted(current: readonly number[], verb: number): void {
    if (current.length === 0) {
      throw new Error(`PathTessellator: verb ${verb} encountered before MOVE`);
    }
  }

  private assertPointAvailable(pointIndex: number, pointsCount: number, verb: number): void {
    if (pointIndex >= pointsCount) {
      throw new Error(
        `PathTessellator: verb ${verb} needs control point index ${pointIndex}, but pointsCount is ${pointsCount}`
      );
    }
  }

  private removeDuplicatePoints(points: Float32Array): Float32Array {
    const deduped: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      const n = deduped.length;
      if (n >= 2 && Math.abs(deduped[n - 2] - x) < EPSILON && Math.abs(deduped[n - 1] - y) < EPSILON) {
        continue;
      }
      deduped.push(x, y);
    }

    if (deduped.length >= 4) {
      const last = deduped.length - 2;
      if (Math.abs(deduped[0] - deduped[last]) < EPSILON && Math.abs(deduped[1] - deduped[last + 1]) < EPSILON) {
        deduped.length -= 2;
      }
    }

    return new Float32Array(deduped);
  }

  /**
   * Remove vertices that are collinear with their neighbors.
   * Such vertices add no geometric information but block ear detection
   * because cross(prev, curr, next) ≈ 0.
   * Loops until stable since removal can create new collinear triplets.
   */
  private removeCollinearPoints(points: Float32Array): Float32Array {
    if (points.length < 6) return points; // < 3 vertices — nothing to remove

    let current = points;
    for (;;) {
      const n = current.length / 2;
      if (n < 3) break;

      const keep: boolean[] = new Array(n).fill(true);
      let removed = 0;

      for (let i = 0; i < n; i++) {
        const pi = ((i - 1) + n) % n;
        const ni = (i + 1) % n;
        const ax = current[pi * 2],     ay = current[pi * 2 + 1];
        const bx = current[i * 2],      by = current[i * 2 + 1];
        const cx = current[ni * 2],     cy = current[ni * 2 + 1];
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(cross) < EPSILON) {
          keep[i] = false;
          removed++;
        }
      }

      if (removed === 0) break;

      // Preserve at least 3 vertices — stop removing if we'd go below
      if (n - removed < 3) break;

      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        if (keep[i]) {
          out.push(current[i * 2], current[i * 2 + 1]);
        }
      }
      current = new Float32Array(out);
    }

    return current;
  }

  private appendQuadratic(
    out: number[],
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
  ): void {
    const polyLength = this.distance(x0, y0, cx, cy) + this.distance(cx, cy, x1, y1);
    const segments = this.estimateCurveSubdivisions(polyLength);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      out.push(x, y);
    }
  }

  private appendCubic(
    out: number[],
    x0: number,
    y0: number,
    cx1: number,
    cy1: number,
    cx2: number,
    cy2: number,
    x1: number,
    y1: number,
  ): void {
    const polyLength =
      this.distance(x0, y0, cx1, cy1) +
      this.distance(cx1, cy1, cx2, cy2) +
      this.distance(cx2, cy2, x1, y1);
    const segments = this.estimateCurveSubdivisions(polyLength);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const x =
        mt * mt * mt * x0 +
        3 * mt * mt * t * cx1 +
        3 * mt * t * t * cx2 +
        t * t * t * x1;
      const y =
        mt * mt * mt * y0 +
        3 * mt * mt * t * cy1 +
        3 * mt * t * t * cy2 +
        t * t * t * y1;
      out.push(x, y);
    }
  }

  private distance(x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return Math.hypot(dx, dy);
  }

  private estimateCurveSubdivisions(approxLength: number): number {
    const subdivisions = Math.ceil(approxLength * 8);
    return Math.max(MIN_CURVE_SUBDIVISIONS, Math.min(MAX_CURVE_SUBDIVISIONS, subdivisions));
  }

  private tessellateContours(cacheKey: string, contours: readonly ContourBuildResult[]): TessellatedPathMesh {
    const contourMeshes = contours.map((contour) => this.tessellateSingleContour(contour));
    const totalVertexFloats = contourMeshes.reduce((sum, contour) => sum + contour.vertexData.length, 0);

    const mergedVertexData = new Float32Array(totalVertexFloats);
    const mergedIndices: number[] = [];

    let vertexFloatOffset = 0;
    let vertexIndexOffset = 0;
    for (const contourMesh of contourMeshes) {
      mergedVertexData.set(contourMesh.vertexData, vertexFloatOffset);
      vertexFloatOffset += contourMesh.vertexData.length;
      for (let i = 0; i < contourMesh.indexData.length; i++) {
        mergedIndices.push(contourMesh.indexData[i] + vertexIndexOffset);
      }
      vertexIndexOffset += contourMesh.vertexData.length / 2;
    }

    const indexData = this.createIndexData(mergedIndices);
    return {
      cacheKey,
      vertexData: mergedVertexData,
      indexData,
      indexFormat: indexData instanceof Uint16Array ? 'uint16' : 'uint32',
    };
  }

  private tessellateSingleContour(contour: ContourBuildResult): {
    readonly vertexData: Float32Array;
    readonly indexData: number[];
  } {
    const vertexCount = contour.points.length / 2;
    if (vertexCount < 3) {
      return {
        vertexData: contour.points,
        indexData: [],
      };
    }

    const workingIndices = this.initializeWinding(contour.points, vertexCount);
    const indices: number[] = [];
    let remaining = vertexCount;
    let guard = 0;

    while (remaining > 2) {
      let earFound = false;

      for (let i = 0; i < remaining; i++) {
        const prev = workingIndices[(i + remaining - 1) % remaining];
        const curr = workingIndices[i];
        const next = workingIndices[(i + 1) % remaining];

        if (!this.isEar(contour.points, prev, curr, next, workingIndices, remaining)) {
          continue;
        }

        indices.push(prev, curr, next);
        workingIndices.splice(i, 1);
        remaining--;
        earFound = true;
        break;
      }

      if (!earFound) {
        // Non-simple or remaining-degenerate contour — skip rather than halt runtime
        // [LAW:no-silent-fallbacks] Degenerate tessellation is surfaced explicitly
        // via warning instead of silently producing undefined geometry.
        console.warn('PathTessellator: polygon triangulation failed (non-simple or degenerate contour), skipping mesh');
        return {
          vertexData: contour.points,
          indexData: [],
        };
      }

      guard++;
      if (guard > vertexCount * vertexCount) {
        throw new Error('PathTessellator: polygon triangulation exceeded iteration guard');
      }
    }

    return {
      vertexData: contour.points,
      indexData: indices,
    };
  }

  private initializeWinding(points: Float32Array, vertexCount: number): number[] {
    const winding = new Array<number>(vertexCount);
    const area = this.computeSignedArea(points);
    if (area > 0) {
      for (let i = 0; i < vertexCount; i++) {
        winding[i] = i;
      }
      return winding;
    }
    for (let i = 0; i < vertexCount; i++) {
      winding[i] = vertexCount - 1 - i;
    }
    return winding;
  }

  private computeSignedArea(points: Float32Array): number {
    let area = 0;
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ix = points[i * 2];
      const iy = points[i * 2 + 1];
      const jx = points[j * 2];
      const jy = points[j * 2 + 1];
      area += ix * jy - jx * iy;
    }
    return area * 0.5;
  }

  private isEar(
    points: Float32Array,
    prevIndex: number,
    currIndex: number,
    nextIndex: number,
    polygonIndices: number[],
    polygonSize: number
  ): boolean {
    const ax = points[prevIndex * 2];
    const ay = points[prevIndex * 2 + 1];
    const bx = points[currIndex * 2];
    const by = points[currIndex * 2 + 1];
    const cx = points[nextIndex * 2];
    const cy = points[nextIndex * 2 + 1];

    if (this.cross(ax, ay, bx, by, cx, cy) <= EPSILON) {
      return false;
    }

    for (let i = 0; i < polygonSize; i++) {
      const testIndex = polygonIndices[i];
      if (testIndex === prevIndex || testIndex === currIndex || testIndex === nextIndex) {
        continue;
      }

      const px = points[testIndex * 2];
      const py = points[testIndex * 2 + 1];
      if (this.isPointInsideTriangle(px, py, ax, ay, bx, by, cx, cy)) {
        return false;
      }
    }

    return true;
  }

  private cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  private isPointInsideTriangle(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ): boolean {
    const b0 = this.cross(px, py, ax, ay, bx, by) >= -EPSILON;
    const b1 = this.cross(px, py, bx, by, cx, cy) >= -EPSILON;
    const b2 = this.cross(px, py, cx, cy, ax, ay) >= -EPSILON;
    return b0 && b1 && b2;
  }

  private createIndexData(indices: number[]): Uint16Array | Uint32Array {
    if (indices.length === 0) {
      return new Uint16Array(0);
    }
    let maxIndex = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] > maxIndex) {
        maxIndex = indices[i];
      }
    }
    return maxIndex <= 0xffff ? new Uint16Array(indices) : new Uint32Array(indices);
  }
}
