const MIN_RESOLUTION = 4;
const MAX_RESOLUTION = 2048;
const EPSILON = 1e-6;

export interface Vec2Point {
  readonly x: number;
  readonly y: number;
}

export function clampParametricResolution(value: number): number {
  const finite = Number.isFinite(value) ? value : MIN_RESOLUTION;
  const quantized = Math.trunc(finite);
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, quantized));
}

export function clampParametricThickness(value: number): number {
  const finite = Number.isFinite(value) ? Math.abs(value) : 0.02;
  return Math.max(0.0005, Math.min(2.0, finite));
}

export function generateParametricTemplateTValues(resolution: number): Float32Array {
  const safeResolution = clampParametricResolution(resolution);
  const sampleCount = safeResolution + 1;
  const values = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    values[i] = i / safeResolution;
  }
  return values;
}

export function evaluateCubicBezierPosition(
  p0: Vec2Point,
  p1: Vec2Point,
  p2: Vec2Point,
  p3: Vec2Point,
  t: number,
): Vec2Point {
  const omt = 1 - t;
  const omt2 = omt * omt;
  const t2 = t * t;
  const b0 = omt2 * omt;
  const b1 = 3 * omt2 * t;
  const b2 = 3 * omt * t2;
  const b3 = t2 * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
}

export function evaluateCubicBezierTangent(
  p0: Vec2Point,
  p1: Vec2Point,
  p2: Vec2Point,
  p3: Vec2Point,
  t: number,
): Vec2Point {
  const omt = 1 - t;
  const omt2 = omt * omt;
  const t2 = t * t;
  return {
    x:
      3 * omt2 * (p1.x - p0.x)
      + 6 * omt * t * (p2.x - p1.x)
      + 3 * t2 * (p3.x - p2.x),
    y:
      3 * omt2 * (p1.y - p0.y)
      + 6 * omt * t * (p2.y - p1.y)
      + 3 * t2 * (p3.y - p2.y),
  };
}

function normalizeWithFallback(v: Vec2Point, fallback: Vec2Point): Vec2Point {
  const lenSq = v.x * v.x + v.y * v.y;
  if (lenSq > EPSILON * EPSILON) {
    const invLen = 1 / Math.sqrt(lenSq);
    return { x: v.x * invLen, y: v.y * invLen };
  }
  const fallbackLenSq = fallback.x * fallback.x + fallback.y * fallback.y;
  if (fallbackLenSq > EPSILON * EPSILON) {
    const invLen = 1 / Math.sqrt(fallbackLenSq);
    return { x: fallback.x * invLen, y: fallback.y * invLen };
  }
  return { x: 1, y: 0 };
}

export function buildCubicRibbonContour(
  controlPointScalars: ArrayLike<number>,
  resolution: number,
  thickness: number,
): Float32Array {
  if (controlPointScalars.length < 8) {
    throw new Error(
      `buildCubicRibbonContour: expected at least 8 scalar values for 4 vec2 control points, got ${String(controlPointScalars.length)}`,
    );
  }
  const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);
  const p0 = { x: finiteOrZero(controlPointScalars[0] as number), y: finiteOrZero(controlPointScalars[1] as number) };
  const p1 = { x: finiteOrZero(controlPointScalars[2] as number), y: finiteOrZero(controlPointScalars[3] as number) };
  const p2 = { x: finiteOrZero(controlPointScalars[4] as number), y: finiteOrZero(controlPointScalars[5] as number) };
  const p3 = { x: finiteOrZero(controlPointScalars[6] as number), y: finiteOrZero(controlPointScalars[7] as number) };

  const safeResolution = clampParametricResolution(resolution);
  const safeThickness = clampParametricThickness(thickness);
  const halfThickness = safeThickness * 0.5;
  const tValues = generateParametricTemplateTValues(safeResolution);
  const sampleCount = tValues.length;
  const left = new Float32Array(sampleCount * 2);
  const right = new Float32Array(sampleCount * 2);

  let prevCenter = evaluateCubicBezierPosition(p0, p1, p2, p3, tValues[0] as number);
  for (let i = 0; i < sampleCount; i++) {
    const t = tValues[i] as number;
    const center = evaluateCubicBezierPosition(p0, p1, p2, p3, t);
    const tangentRaw = evaluateCubicBezierTangent(p0, p1, p2, p3, t);
    const tangentFallback = {
      x: center.x - prevCenter.x,
      y: center.y - prevCenter.y,
    };
    const tangent = normalizeWithFallback(tangentRaw, tangentFallback);
    // [LAW:single-enforcer] NaN/zero-tangent handling is normalized here so
    // all Type 2 ribbon callers share one finite-normal policy.
    const normal = { x: -tangent.y, y: tangent.x };
    const li = i * 2;
    left[li] = center.x + normal.x * halfThickness;
    left[li + 1] = center.y + normal.y * halfThickness;
    right[li] = center.x - normal.x * halfThickness;
    right[li + 1] = center.y - normal.y * halfThickness;
    prevCenter = center;
  }

  const contourPointCount = sampleCount * 2;
  const contour = new Float32Array(contourPointCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const li = i * 2;
    contour[li] = left[li];
    contour[li + 1] = left[li + 1];
  }
  for (let i = 0; i < sampleCount; i++) {
    const sourceIndex = sampleCount - 1 - i;
    const src = sourceIndex * 2;
    const dst = (sampleCount + i) * 2;
    contour[dst] = right[src];
    contour[dst + 1] = right[src + 1];
  }
  return contour;
}
