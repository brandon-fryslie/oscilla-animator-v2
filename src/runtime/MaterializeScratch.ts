/**
 * Scratch allocator for ValueExpr materialization.
 * // [LAW:one-source-of-truth] Runtime materialization reuses buffers through this
 * // single allocator rather than split pool implementations.
 */

export interface MaterializeScratch {
  allocF32(length: number): Float32Array;
  reset(): void;
}

export function createMaterializeScratch(): MaterializeScratch {
  const buffers: Float32Array[] = [];
  let cursor = 0;

  return {
    allocF32(length: number): Float32Array {
      if (length <= 0) {
        return new Float32Array(0);
      }

      const index = cursor++;
      const existing = buffers[index];
      if (!existing || existing.length < length) {
        const next = new Float32Array(length);
        buffers[index] = next;
        return next;
      }
      return existing;
    },

    reset(): void {
      cursor = 0;
    },
  };
}
