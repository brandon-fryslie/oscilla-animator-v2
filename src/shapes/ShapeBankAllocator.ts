export interface ShapeBankAllocation {
  readonly wordOffset: number;
  readonly wordLength: number;
  readonly wrapped: boolean;
}

export interface ShapeBankDirtyRange {
  readonly wordOffset: number;
  readonly wordLength: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface DirtyRangeInternal {
  start: number;
  end: number;
}

export interface ShapeBankAllocatorOptions {
  readonly staticWords?: number;
}

/**
 * Canonical shape-bank allocator for static + dynamic ring storage.
 *
 * [LAW:single-enforcer] Allocation ownership and dirty-range tracking are
 * enforced at this boundary, not duplicated by runtime/render callsites.
 */
export class ShapeBankAllocator {
  private readonly dataBuffer: Uint32Array;
  private readonly staticBoundaryWords: number;
  private staticCursor = 0;
  private dynamicCursor: number;
  private dirtyRangesInternal: DirtyRangeInternal[] = [];

  constructor(capacityWords: number, options: ShapeBankAllocatorOptions = {}) {
    if (!Number.isInteger(capacityWords) || capacityWords <= 0) {
      throw new Error('ShapeBankAllocator: capacityWords must be a positive integer');
    }
    const staticWords = options.staticWords ?? 0;
    if (!Number.isInteger(staticWords) || staticWords < 0) {
      throw new Error('ShapeBankAllocator: staticWords must be a non-negative integer');
    }
    if (staticWords > capacityWords) {
      throw new Error(
        `ShapeBankAllocator: staticWords ${staticWords} exceeds capacity ${capacityWords}`,
      );
    }
    this.dataBuffer = new Uint32Array(capacityWords);
    this.staticBoundaryWords = staticWords;
    this.dynamicCursor = staticWords;
  }

  get capacityWords(): number {
    return this.dataBuffer.length;
  }

  get staticBoundary(): number {
    return this.staticBoundaryWords;
  }

  data(): Uint32Array {
    return this.dataBuffer;
  }

  resetStatic(): void {
    this.staticCursor = 0;
  }

  resetDynamic(): void {
    this.dynamicCursor = this.staticBoundaryWords;
  }

  allocStatic(wordLength: number): ShapeBankAllocation {
    this.assertPositiveWordLength(wordLength, 'allocStatic');
    const start = this.staticCursor;
    const end = start + wordLength;
    if (end > this.staticBoundaryWords) {
      throw new Error(
        `ShapeBankAllocator.allocStatic: out of static capacity (need ${end}, staticBoundary ${this.staticBoundaryWords})`,
      );
    }
    this.staticCursor = end;
    return { wordOffset: start, wordLength, wrapped: false };
  }

  allocDynamic(wordLength: number): ShapeBankAllocation {
    this.assertPositiveWordLength(wordLength, 'allocDynamic');
    const dynamicStart = this.staticBoundaryWords;
    const dynamicCapacity = this.capacityWords - dynamicStart;
    if (wordLength > dynamicCapacity) {
      throw new Error(
        `ShapeBankAllocator.allocDynamic: allocation ${wordLength} exceeds dynamic capacity ${dynamicCapacity}`,
      );
    }
    const rawStart = this.dynamicCursor;
    const rawEnd = rawStart + wordLength;
    if (rawEnd <= this.capacityWords) {
      this.dynamicCursor = rawEnd;
      return { wordOffset: rawStart, wordLength, wrapped: false };
    }
    // [LAW:dataflow-not-control-flow] Dynamic ring wraps by data position only;
    // allocator API is unconditional regardless of caller mode.
    const wrappedStart = dynamicStart;
    this.dynamicCursor = wrappedStart + wordLength;
    return { wordOffset: wrappedStart, wordLength, wrapped: true };
  }

  writeWords(wordOffset: number, words: ArrayLike<number>): void {
    if (!Number.isInteger(wordOffset) || wordOffset < 0) {
      throw new Error('ShapeBankAllocator.writeWords: wordOffset must be a non-negative integer');
    }
    const wordLength = words.length >>> 0;
    const end = wordOffset + wordLength;
    if (end > this.capacityWords) {
      throw new Error(
        `ShapeBankAllocator.writeWords: write exceeds capacity (end ${end}, capacity ${this.capacityWords})`,
      );
    }
    this.dataBuffer.set(words as ArrayLike<number>, wordOffset);
    this.markDirty(wordOffset, wordLength);
  }

  dirtyRanges(): readonly ShapeBankDirtyRange[] {
    return this.toPublicRanges(this.dirtyRangesInternal);
  }

  consumeDirtyRanges(): readonly ShapeBankDirtyRange[] {
    const snapshot = this.toPublicRanges(this.dirtyRangesInternal);
    this.dirtyRangesInternal = [];
    return snapshot;
  }

  private markDirty(start: number, wordLength: number): void {
    if (wordLength <= 0) return;
    const next: DirtyRangeInternal = { start, end: start + wordLength };
    const merged = [...this.dirtyRangesInternal, next].sort((a, b) => a.start - b.start);
    const compact: DirtyRangeInternal[] = [];
    for (const range of merged) {
      const last = compact[compact.length - 1];
      if (!last || range.start > last.end) {
        compact.push({ ...range });
        continue;
      }
      if (range.end > last.end) {
        last.end = range.end;
      }
    }
    this.dirtyRangesInternal = compact;
  }

  private toPublicRanges(ranges: readonly DirtyRangeInternal[]): readonly ShapeBankDirtyRange[] {
    return ranges.map((range) => ({
      wordOffset: range.start,
      wordLength: range.end - range.start,
      byteOffset: range.start * Uint32Array.BYTES_PER_ELEMENT,
      byteLength: (range.end - range.start) * Uint32Array.BYTES_PER_ELEMENT,
    }));
  }

  private assertPositiveWordLength(wordLength: number, method: string): void {
    if (!Number.isInteger(wordLength) || wordLength <= 0) {
      throw new Error(`ShapeBankAllocator.${method}: wordLength must be a positive integer`);
    }
  }
}

