/**
 * Field Buffer Pool
 *
 * Manages typed array allocation and reuse for field materialization.
 * Buffers are pooled by format:count key for exact match reuse.
 *
 * Pattern:
 * 1. alloc(format, count) - get or create buffer
 * 2. Use buffer during frame
 * 3. releaseAll() - return all buffers to pool at frame end
 */

import { type PayloadType, type ConcretePayloadType } from '../core/canonical-types';

/** Shape2D words per record (must match RuntimeState.SHAPE2D_WORDS) */
const SHAPE2D_WORDS = 8;

/**
 * Buffer format types
 */
export type BufferFormat =
  | 'f32'      // Single float
  | 'vec2f32'  // 2D vector
  | 'vec3f32'  // 3D vector
  | 'rgba8'    // Color (RGBA, clamped uint8)
  | 'shape2d'; // Shape descriptor (8 x u32 words per shape)

/**
 * Get buffer format for a payload type.
 *
 * Note: PayloadType is now always concrete (no vars), so we can use it directly.
 */
export function getBufferFormat(payload: PayloadType): BufferFormat {
  switch (payload.kind) {
    // Numeric types -> f32
    case 'float':
    case 'int':
    case 'bool':
    case 'cameraProjection':
      return 'f32';

    // NOTE: 'shape' removed per Q6 - shapes are resources, not payloads.
    // SHAPE was aliased to FLOAT and handled by the float case above.

    // 2D vectors
    case 'vec2':
      return 'vec2f32';

    // 3D vectors
    case 'vec3':
      return 'vec3f32';

    // Colors
    case 'color':
      return 'rgba8';

    default: {
      const _exhaustive: never = payload;
      throw new Error(`Unknown payload type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Pool frame statistics for memory instrumentation
 */
export interface PoolFrameStats {
  /** Number of allocations in last frame */
  allocs: number;
  /** Number of releases in last frame */
  releases: number;
  /** Total pooled bytes across all pools */
  pooledBytes: number;
  /** Number of distinct pool keys */
  poolKeys: number;
}

/**
 * BufferPool manages typed array allocation and reuse
 *
 * Includes automatic cleanup to prevent memory leaks when domain sizes change.
 */
export class BufferPool {
  /** Available buffers by key (format:count) */
  private pools = new Map<string, ArrayBufferView[]>();

  /** Currently allocated buffers by key */
  private inUse = new Map<string, ArrayBufferView[]>();

  /** Maximum number of different pool keys before triggering cleanup */
  private maxPoolSize = 1000;

  // === Memory Instrumentation (Sprint: memory-instrumentation) ===

  /** Allocations in current frame (reset in releaseAll) */
  private allocsThisFrame = 0;

  /** Stats from last frame (recorded before reset in releaseAll) */
  private lastFrameAllocs = 0;
  private lastFrameReleases = 0;

  /** Cached total bytes (updated incrementally to avoid O(n) iteration) */
  private totalBytes = 0;

  /** Reusable stats object — returned by getFrameStats(), never reallocated */
  private readonly frameStats: PoolFrameStats = {
    allocs: 0,
    releases: 0,
    pooledBytes: 0,
    poolKeys: 0,
  };

  /** Reusable stats object — returned by getStats(), never reallocated */
  private readonly debugStats = { pooled: 0, inUse: 0, poolKeys: 0 };

  /**
   * Two-level key cache: format → (count → interned key string).
   * After warmup, getKey is two Map.get calls — zero allocation.
   */
  private readonly keyCache = new Map<BufferFormat, Map<number, string>>();

  /** All known keys in insertion order, for iterator-free iteration in releaseAll */
  private readonly knownKeys: string[] = [];

  /**
   * Get or create the interned key string for a format:count pair.
   * After warmup (all format:count pairs seen), this is two Map lookups — zero allocation.
   */
  private getKey(format: BufferFormat, count: number): string {
    let countMap = this.keyCache.get(format);
    if (countMap !== undefined) {
      const cached = countMap.get(count);
      if (cached !== undefined) return cached;
    } else {
      countMap = new Map<number, string>();
      this.keyCache.set(format, countMap);
    }
    // Cold path: first encounter of this format:count pair
    const key = format + ':' + count;
    countMap.set(count, key);
    return key;
  }

  /**
   * Ensure both maps have arrays for this key.
   * Cold path only — called on first encounter of a key (graph change, not per-frame).
   */
  private ensureKey(key: string): void {
    if (this.pools.has(key)) return;
    this.pools.set(key, []);
    this.inUse.set(key, []);
    this.knownKeys.push(key);
  }

  /**
   * Allocate a buffer of the specified format and count.
   * Reuses an existing buffer from the pool if available.
   *
   * Hot path — zero allocations after warmup.
   *
   * @param format - Buffer format
   * @param count - Number of elements (NOT bytes)
   * @returns Typed array buffer
   */
  alloc(format: BufferFormat, count: number): ArrayBufferView {
    const key = this.getKey(format, count);

    this.allocsThisFrame++;
    this.ensureKey(key);

    const pool = this.pools.get(key)!;
    const inUseList = this.inUse.get(key)!;

    // Reuse from pool if available
    if (pool.length > 0) {
      const buffer = pool.pop()!;
      inUseList.push(buffer);
      return buffer;
    }

    // Cold path: allocate new buffer (first encounter of this size)
    const buffer = allocateBuffer(format, count);
    this.totalBytes += buffer.byteLength;
    inUseList.push(buffer);
    return buffer;
  }

  /**
   * Release all in-use buffers back to the pool.
   * Call this at the end of each frame.
   *
   * Hot path — zero allocations. Arrays are drained, never discarded.
   * Uses knownKeys array instead of Map iterator to avoid iterator allocation.
   */
  releaseAll(): void {
    let releasedCount = 0;
    const keys = this.knownKeys;

    for (let k = 0; k < keys.length; k++) {
      const inUseList = this.inUse.get(keys[k])!;
      if (inUseList.length === 0) continue;
      releasedCount += inUseList.length;

      const pool = this.pools.get(keys[k])!;
      for (let i = 0; i < inUseList.length; i++) {
        pool.push(inUseList[i]);
      }
      inUseList.length = 0;
    }

    this.lastFrameAllocs = this.allocsThisFrame;
    this.lastFrameReleases = releasedCount;
    this.allocsThisFrame = 0;
  }

  /**
   * Get frame statistics (for memory instrumentation).
   *
   * Returns a shared stats object — do not hold references across frames.
   */
  getFrameStats(): PoolFrameStats {
    const s = this.frameStats;
    s.allocs = this.lastFrameAllocs;
    s.releases = this.lastFrameReleases;
    s.pooledBytes = this.totalBytes;
    s.poolKeys = this.pools.size;
    return s;
  }

  /**
   * Get pool statistics (for debugging).
   *
   * Returns a shared stats object — do not hold references across calls.
   */
  getStats(): { pooled: number; inUse: number; poolKeys: number } {
    const keys = this.knownKeys;
    let pooled = 0;
    let inUse = 0;
    for (let k = 0; k < keys.length; k++) {
      pooled += this.pools.get(keys[k])!.length;
      inUse += this.inUse.get(keys[k])!.length;
    }
    const s = this.debugStats;
    s.pooled = pooled;
    s.inUse = inUse;
    s.poolKeys = keys.length;
    return s;
  }
}

/**
 * Allocate a new typed array buffer
 */
function allocateBuffer(format: BufferFormat, count: number): ArrayBufferView {
  switch (format) {
    case 'f32':
      return new Float32Array(count);

    case 'vec2f32':
      return new Float32Array(count * 2);

    case 'vec3f32':
      return new Float32Array(count * 3);

    case 'rgba8':
      return new Uint8ClampedArray(count * 4);

    case 'shape2d':
      return new Uint32Array(count * SHAPE2D_WORDS);

    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown buffer format: ${String(_exhaustive)}`);
    }
  }
}
