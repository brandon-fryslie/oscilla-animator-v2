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
/**
 * Buffer format types
 */
export type BufferFormat = 'f32' | 'vec2f32' | 'rgba8';
/**
 * Get buffer format for a payload type
 */
export declare function getBufferFormat(payload: PayloadType): BufferFormat;
/**
 * BufferPool manages typed array allocation and reuse
 *
 * Includes automatic cleanup to prevent memory leaks when domain sizes change.
 */
export declare class BufferPool {
    /** Available buffers by key (format:count) */
    private pools;
    /** Currently allocated buffers by key */
    private inUse;
    /** Maximum number of different pool keys before triggering cleanup */
    private maxPoolSize;
    /**
     * Allocate a buffer of the specified format and count.
     * Reuses an existing buffer from the pool if available.
     *
     * @param format - Buffer format
     * @param count - Number of elements (NOT bytes)
     * @returns Typed array buffer
     */
    alloc(format: BufferFormat, count: number): ArrayBufferView;
    /**
     * Release all in-use buffers back to the pool.
     * Call this at the end of each frame.
     */
    releaseAll(): void;
    /**
     * Track a buffer as in-use
     */
    private trackInUse;
    /**
     * Get pool statistics (for debugging)
     */
    getStats(): {
        pooled: number;
        inUse: number;
        poolKeys: number;
    };
    /**
     * Remove least recently used pools when limit exceeded
     * Keeps only pools with buffers currently in use or recently allocated
     */
    private trimPools;
    /**
     * Manual cleanup for domain size changes
     * Removes all pools that don't have buffers currently in use
     */
    clearUnusedPools(): void;
}
