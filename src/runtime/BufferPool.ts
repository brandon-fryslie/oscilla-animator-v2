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

import type { PayloadType } from '../core/canonical-types';

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
  switch (payload) {
    // Numeric types -> f32
    case 'float':
    case 'int':
    case 'bool':
      return 'f32';
    // Shape descriptors -> shape2d
    case 'shape':
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
    // Camera projection enum (scalar f32)
    case 'cameraProjection':
      return 'f32';
  }
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
    this.trackInUse(key, buffer);
    return buffer;
  }

  /**
   * Release all in-use buffers back to the pool.
   * Call this at the end of each frame.
   */
  releaseAll(): void {
    for (const [key, buffers] of this.inUse) {
      const pool = this.pools.get(key) ?? [];
      pool.push(...buffers);
      this.pools.set(key, pool);
    }
    this.inUse.clear();
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
