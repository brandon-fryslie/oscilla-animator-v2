import { describe, expect, it } from 'vitest';
import { ShapeBankAllocator } from '../ShapeBankAllocator';

describe('ShapeBankAllocator', () => {
  it('allocates static zone linearly and tracks dirty write ranges', () => {
    const allocator = new ShapeBankAllocator(64, { staticWords: 16 });
    const first = allocator.allocStatic(8);
    expect(first).toEqual({ wordOffset: 0, wordLength: 8, wrapped: false });

    allocator.writeWords(first.wordOffset, Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    const dirty = allocator.consumeDirtyRanges();
    expect(dirty).toEqual([
      {
        wordOffset: 0,
        wordLength: 8,
        byteOffset: 0,
        byteLength: 8 * Uint32Array.BYTES_PER_ELEMENT,
      },
    ]);
  });

  it('allocates dynamic ring and wraps at dynamic boundary', () => {
    const allocator = new ShapeBankAllocator(24, { staticWords: 8 });
    const a = allocator.allocDynamic(10);
    expect(a).toEqual({ wordOffset: 8, wordLength: 10, wrapped: false });
    const b = allocator.allocDynamic(10);
    expect(b).toEqual({ wordOffset: 8, wordLength: 10, wrapped: true });
  });

  it('merges overlapping and adjacent dirty ranges', () => {
    const allocator = new ShapeBankAllocator(64, { staticWords: 0 });
    allocator.writeWords(4, Uint32Array.from([1, 1, 1, 1]));
    allocator.writeWords(8, Uint32Array.from([2, 2]));
    allocator.writeWords(10, Uint32Array.from([3, 3, 3]));

    const dirty = allocator.consumeDirtyRanges();
    expect(dirty).toEqual([
      {
        wordOffset: 4,
        wordLength: 9,
        byteOffset: 4 * Uint32Array.BYTES_PER_ELEMENT,
        byteLength: 9 * Uint32Array.BYTES_PER_ELEMENT,
      },
    ]);
  });

  it('resetDynamic rewinds ring cursor to static boundary', () => {
    const allocator = new ShapeBankAllocator(32, { staticWords: 12 });
    allocator.allocDynamic(6);
    allocator.allocDynamic(6);
    allocator.resetDynamic();
    const alloc = allocator.allocDynamic(6);
    expect(alloc).toEqual({ wordOffset: 12, wordLength: 6, wrapped: false });
  });
});

