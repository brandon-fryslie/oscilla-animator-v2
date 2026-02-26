import earcut from 'earcut';
import { Bezier } from 'bezier-js';
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
 * Triangulation via earcut (Mapbox). Curve flattening via bezier-js.
 * Unsupported verb/topology patterns fail fast by throwing.
 */
export class PathTessellator {
  private readonly meshCache = new Map<string, TessellatedPathMesh>();

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
    const pointValueCount = Math.max(0, Math.min(geometry.points.length, geometry.pointsCount * 2));
    // [LAW:one-source-of-truth] Tessellation cache identity must derive from
    // geometry content, not mutable buffer object identity.
    const verbsHash = hashU8(geometry.verbs, geometry.verbs.length);
    const pointsHash = hashF32Bits(geometry.points, pointValueCount);
    return `${geometry.topologyId}:${geometry.flags ?? 0}:${geometry.pointsCount}:${verbsHash.toString(16)}:${pointsHash.toString(16)}`;
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
        contours.push({
          points: deduped,
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

  private appendQuadratic(
    out: number[],
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
  ): void {
    const curve = new Bezier(x0, y0, cx, cy, x1, y1);
    const segments = this.estimateCurveSubdivisions(curve.length());
    const lut = curve.getLUT(segments);
    // Skip first point (already in contour as start point)
    for (let i = 1; i < lut.length; i++) {
      out.push(lut[i].x, lut[i].y);
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
    const curve = new Bezier(x0, y0, cx1, cy1, cx2, cy2, x1, y1);
    const segments = this.estimateCurveSubdivisions(curve.length());
    const lut = curve.getLUT(segments);
    // Skip first point (already in contour as start point)
    for (let i = 1; i < lut.length; i++) {
      out.push(lut[i].x, lut[i].y);
    }
  }

  private estimateCurveSubdivisions(arcLength: number): number {
    const subdivisions = Math.ceil(arcLength * 8);
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
      return { vertexData: contour.points, indexData: [] };
    }

    const indices = earcut(Array.from(contour.points));
    if (indices.length === 0 && vertexCount >= 3) {
      console.warn('PathTessellator: earcut produced no triangles for contour, skipping');
    }

    return { vertexData: contour.points, indexData: indices };
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

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

function hashU8(values: Uint8Array, count: number): number {
  let hash = FNV1A_OFFSET_BASIS;
  for (let i = 0; i < count; i++) {
    hash ^= values[i]!;
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return hash >>> 0;
}

function hashF32Bits(values: Float32Array, count: number): number {
  let hash = FNV1A_OFFSET_BASIS;
  const words = new Uint32Array(values.buffer, values.byteOffset, count);
  for (let i = 0; i < count; i++) {
    const word = words[i]!;
    hash ^= word & 0xff;
    hash = Math.imul(hash, FNV1A_PRIME);
    hash ^= (word >>> 8) & 0xff;
    hash = Math.imul(hash, FNV1A_PRIME);
    hash ^= (word >>> 16) & 0xff;
    hash = Math.imul(hash, FNV1A_PRIME);
    hash ^= (word >>> 24) & 0xff;
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return hash >>> 0;
}
