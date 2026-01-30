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

import { type PayloadType, isPayloadVar, type ConcretePayloadType } from '../core/canonical-types';

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
 * Get buffer format for a payload type
 */
export function getBufferFormat(payload: PayloadType): BufferFormat {
  if (isPayloadVar(payload)) {
    throw new Error(`Cannot get buffer format for unresolved payload variable: ${payload.id}`);
  }

  // TypeScript now knows payload is ConcretePayloadType
  const concrete = payload as ConcretePayloadType;

  switch (concrete.kind) {
    // Numeric types -> f32
    case 'float':
    case 'int':
    case 'bool':
    case 'cameraProjection':
      return 'f32';

    // Shape descriptors -> shape2d
    // TODO: Q6 case 'shape':
      return 'shape2d';

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
      const _exhaustive: never = concrete;
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
  private maxPoolSize = 100;

  // === Memory Instrumentation (Sprint: memory-instrumentation) ===

  /** Allocations in current frame (reset in releaseAll) */
  private allocsThisFrame = 0;

  /** Stats from last frame (recorded before reset in releaseAll) */
  private lastFrameAllocs = 0;
  private lastFrameReleases = 0;

  /** Cached total bytes (updated incrementally to avoid O(n) iteration) */
  private totalBytes = 0;

  /**
   * Allocate a buffer of the specified format and count.
   * Reuses an existing buffer from the pool if available.
   *
   * @param format - Buffer format
   * @param count - Number of elements (NOT bytes)
   * @returns Typed array buffer
   */
  alloc(format: BufferFormat, count: number): ArrayBufferView {
    const key = `${format}:${count}`;

    // Instrumentation: Track allocation
    this.allocsThisFrame++;

    // Cleanup old pools if we have too many keys
    if (this.pools.size > this.maxPoolSize) {
      this.trimPools();
    }

    const pool = this.pools.get(key) ?? [];

    // Reuse from pool if available
    if (pool.length > 0) {
      const buffer = pool.pop()!;
      this.trackInUse(key, buffer);
      return buffer;
    }

    // Allocate new buffer
    const buffer = allocateBuffer(format, count);
    this.totalBytes += buffer.byteLength; // Track new allocation
    this.trackInUse(key, buffer);
    return buffer;
  }

  /**
   * Release all in-use buffers back to the pool.
   * Call this at the end of each frame.
   */
  releaseAll(): void {
    // Record frame stats BEFORE releasing buffers
    let releasedCount = 0;
    for (const buffers of this.inUse.values()) {
      releasedCount += buffers.length;
    }

    this.lastFrameAllocs = this.allocsThisFrame;
    this.lastFrameReleases = releasedCount;

    // Reset counter for next frame
    this.allocsThisFrame = 0;

    // Release buffers back to pool
    for (const [key, buffers] of this.inUse) {
      const pool = this.pools.get(key) ?? [];
      pool.push(...buffers);
      this.pools.set(key, pool);
    }
    this.inUse.clear();
  }

  /**
   * Get frame statistics (for memory instrumentation)
   *
   * Returns stats from the last completed frame.
   * Call this after releaseAll() to get accurate stats.
   */
  getFrameStats(): PoolFrameStats {
    return {
      allocs: this.lastFrameAllocs,
      releases: this.lastFrameReleases,
      pooledBytes: this.totalBytes, // O(1) cached value
      poolKeys: this.pools.size,
    };
  }

  /**
   * Track a buffer as in-use
   */
  private trackInUse(key: string, buffer: ArrayBufferView): void {
    const list = this.inUse.get(key) ?? [];
    list.push(buffer);
    this.inUse.set(key, list);
  }

  /**
   * Get pool statistics (for debugging)
   */
  getStats(): { pooled: number; inUse: number; poolKeys: number } {
    let pooled = 0;
    for (const buffers of this.pools.values()) {
      pooled += buffers.length;
    }

    let inUse = 0;
    for (const buffers of this.inUse.values()) {
      inUse += buffers.length;
    }

    return { pooled, inUse, poolKeys: this.pools.size };
  }


  /**
   * Remove least recently used pools when limit exceeded
   * Keeps only pools with buffers currently in use or recently allocated
   */
  private trimPools(): void {
    // Keep only pools with buffers in use
    const keysToKeep = new Set(this.inUse.keys());

    for (const [key, buffers] of this.pools) {
      if (!keysToKeep.has(key) && buffers.length > 0) {
        // Decrement totalBytes for removed buffers
        for (const buf of buffers) {
          this.totalBytes -= buf.byteLength;
        }
        this.pools.delete(key);
      }
    }
  }

  /**
   * Manual cleanup for domain size changes
   * Removes all pools that don't have buffers currently in use
   */
  clearUnusedPools(): void {
    for (const [key, buffers] of this.pools) {
      if (!this.inUse.has(key)) {
        // Decrement totalBytes for removed buffers
        for (const buf of buffers) {
          this.totalBytes -= buf.byteLength;
        }
        this.pools.delete(key);
      }
    }
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
