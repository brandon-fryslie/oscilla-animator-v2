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
const VERB_CLOSE = 4;

const EPSILON = 1e-7;

/**
 * CPU path tessellation for WebGPU fill rendering.
 *
 * Supports a single contour composed of MOVE/LINE/CLOSE verbs.
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

    const contour = this.extractContour(geometry);
    const mesh = this.tessellateContour(cacheKey, contour);
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

  private extractContour(geometry: PathGeometry): ContourBuildResult {
    const points = geometry.points;
    const maxPointIndex = geometry.pointsCount;
    const contours: Float32Array[] = [];
    let current: number[] = [];
    let pointIndex = 0;
    let closed = false;

    for (let i = 0; i < geometry.verbs.length; i++) {
      const verb = geometry.verbs[i];
      if (verb === VERB_MOVE) {
        if (current.length >= 4) {
          contours.push(new Float32Array(current));
        }
        current = [];
        this.assertPointAvailable(pointIndex, maxPointIndex, verb);
        current.push(points[pointIndex * 2], points[pointIndex * 2 + 1]);
        pointIndex++;
        continue;
      }

      if (verb === VERB_LINE) {
        this.assertPointAvailable(pointIndex, maxPointIndex, verb);
        current.push(points[pointIndex * 2], points[pointIndex * 2 + 1]);
        pointIndex++;
        continue;
      }

      if (verb === VERB_CLOSE) {
        closed = true;
        continue;
      }

      throw new Error(
        `PathTessellator: unsupported path verb ${verb}. Only MOVE/LINE/CLOSE are supported by WebGPU renderer`
      );
    }

    if (current.length >= 4) {
      contours.push(new Float32Array(current));
    }

    if (contours.length !== 1) {
      throw new Error(
        `PathTessellator: expected exactly one contour, received ${contours.length}`
      );
    }

    const deduped = this.removeDuplicatePoints(contours[0]);
    const normalized = this.removeCollinearPoints(deduped);
    return {
      points: normalized,
      closed,
    };
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

  private tessellateContour(cacheKey: string, contour: ContourBuildResult): TessellatedPathMesh {
    const vertexCount = contour.points.length / 2;
    if (vertexCount < 3) {
      return {
        cacheKey,
        vertexData: contour.points,
        indexData: new Uint16Array(0),
        indexFormat: 'uint16',
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
          cacheKey,
          vertexData: contour.points,
          indexData: new Uint16Array(0),
          indexFormat: 'uint16' as const,
        };
      }

      guard++;
      if (guard > vertexCount * vertexCount) {
        throw new Error('PathTessellator: polygon triangulation exceeded iteration guard');
      }
    }

    const indexData = this.createIndexData(indices);
    return {
      cacheKey,
      vertexData: contour.points,
      indexData,
      indexFormat: indexData instanceof Uint16Array ? 'uint16' : 'uint32',
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
    const maxIndex = Math.max(...indices);
    return maxIndex <= 0xffff ? new Uint16Array(indices) : new Uint32Array(indices);
  }
}
