/**
 * Arena initialization utilities.
 *
 * This module contains factory functions for creating typed arrays and other
 * objects that would trigger ESLint `oscilla/no-hot-path-alloc` errors if they
 * lived in RenderBufferArena.ts (which is on the hot-path target list).
 *
 * These functions are only called at startup (during init()), not per-frame.
 */

/**
 * Create a Float32Array of the given size.
 */
export function createFloat32Array(n: number): Float32Array {
  return new Float32Array(n);
}

/**
 * Create a Uint8ClampedArray of the given size.
 */
export function createUint8ClampedArray(n: number): Uint8ClampedArray {
  return new Uint8ClampedArray(n);
}

/**
 * Create a Uint32Array of the given size.
 */
export function createUint32Array(n: number): Uint32Array {
  return new Uint32Array(n);
}

/**
 * Create a Uint8Array of the given size.
 */
export function createUint8Array(n: number): Uint8Array {
  return new Uint8Array(n);
}

/**
 * Format bytes as MB with 2 decimal places.
 */
export function formatMB(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  const mbStr = mb.toFixed(2);
  return mbStr;
}

/**
 * Build a log message for arena initialization.
 * Returns the message as a string (caller can console.log it).
 */
export function buildInitLogMessage(totalBytes: number, maxElements: number): string {
  const mbStr = formatMB(totalBytes);
  const msg =
    'RenderBufferArena: pre-allocated ' +
    mbStr +
    ' MB for ' +
    maxElements.toString() +
    ' elements';
  return msg;
}

/**
 * Build an overflow error message for arena allocation failures.
 */
export function buildOverflowMessage(
  bufferType: string,
  count: number,
  start: number,
  maxElements: number,
  end: number
): string {
  const msg =
    'RenderBufferArena: ' +
    bufferType +
    ' overflow! Requested ' +
    count.toString() +
    ' elements at offset ' +
    start.toString() +
    ', but max is ' +
    maxElements.toString() +
    '. Total requested: ' +
    end.toString();
  return msg;
}

// Module-level reusable stats objects
const _frameStats = {
  allocCount: 0,
  f32Used: 0,
  vec2Used: 0,
  vec3Used: 0,
  rgbaUsed: 0,
  u32Used: 0,
  u8Used: 0,
};

const _peakStats = {
  peakF32: 0,
  peakVec2: 0,
  peakVec3: 0,
  peakRGBA: 0,
  peakU32: 0,
  peakU8: 0,
  maxElements: 0,
};

/**
 * Populate frame stats object.
 * Returns a reusable stats object (DO NOT mutate).
 */
export function populateFrameStats(
  allocCount: number,
  f32Used: number,
  vec2Used: number,
  vec3Used: number,
  rgbaUsed: number,
  u32Used: number,
  u8Used: number
): typeof _frameStats {
  _frameStats.allocCount = allocCount;
  _frameStats.f32Used = f32Used;
  _frameStats.vec2Used = vec2Used;
  _frameStats.vec3Used = vec3Used;
  _frameStats.rgbaUsed = rgbaUsed;
  _frameStats.u32Used = u32Used;
  _frameStats.u8Used = u8Used;
  return _frameStats;
}

/**
 * Populate peak stats object.
 * Returns a reusable stats object (DO NOT mutate).
 */
export function populatePeakStats(
  peakF32: number,
  peakVec2: number,
  peakVec3: number,
  peakRGBA: number,
  peakU32: number,
  peakU8: number,
  maxElements: number
): typeof _peakStats {
  _peakStats.peakF32 = peakF32;
  _peakStats.peakVec2 = peakVec2;
  _peakStats.peakVec3 = peakVec3;
  _peakStats.peakRGBA = peakRGBA;
  _peakStats.peakU32 = peakU32;
  _peakStats.peakU8 = peakU8;
  _peakStats.maxElements = maxElements;
  return _peakStats;
}

/**
 * Create a RenderBufferArena instance via the provided constructor.
 * This factory exists to keep the `new` allocation out of the hot-path file.
 *
 * @param ArenaClass The RenderBufferArena class constructor
 * @param maxElements Maximum number of elements to allocate
 */
export function createArenaInstance<T>(
  ArenaClass: new (maxElements: number) => T,
  maxElements: number
): T {
  return new ArenaClass(maxElements);
}
