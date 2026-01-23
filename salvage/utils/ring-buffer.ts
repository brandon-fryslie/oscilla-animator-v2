/**
 * Ring Buffer - Fixed-capacity columnar storage
 *
 * Zero-allocation ring buffer using typed arrays.
 * Columnar layout for cache efficiency.
 * Wraps at capacity (oldest values overwritten).
 */

export const DEFAULT_CAPACITY = 100_000;

/**
 * Generic ring buffer for fixed-size records.
 * Uses columnar storage with typed arrays.
 */
export class RingBuffer<T extends Record<string, number>> {
  private readonly capacity: number;
  private writePtr = 0;
  private readonly columns: Map<keyof T, Uint32Array | Float32Array>;
  private readonly schema: (keyof T)[];

  constructor(schema: (keyof T)[], capacity: number = DEFAULT_CAPACITY, useFloat: Set<keyof T> = new Set()) {
    this.capacity = capacity;
    this.schema = schema;
    this.columns = new Map();

    for (const key of schema) {
      this.columns.set(
        key,
        useFloat.has(key) ? new Float32Array(capacity) : new Uint32Array(capacity)
      );
    }
  }

  /**
   * Write a record. Returns the logical index.
   */
  write(record: T): number {
    const idx = this.writePtr % this.capacity;

    for (const key of this.schema) {
      const col = this.columns.get(key)!;
      col[idx] = record[key] as number;
    }

    return this.writePtr++;
  }

  /**
   * Read a record by logical index. Returns undefined if overwritten/invalid.
   */
  read(logicalIdx: number): T | undefined {
    if (this.writePtr > this.capacity && logicalIdx < this.writePtr - this.capacity) {
      return undefined; // Overwritten
    }
    if (logicalIdx >= this.writePtr) {
      return undefined; // Not written yet
    }

    const physicalIdx = logicalIdx % this.capacity;
    const result = {} as T;

    for (const key of this.schema) {
      const col = this.columns.get(key)!;
      (result as Record<string, number>)[key as string] = col[physicalIdx];
    }

    return result;
  }

  /**
   * Read a range of records.
   */
  readRange(start: number, count: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      const record = this.read(start + i);
      if (record) result.push(record);
    }
    return result;
  }

  getWritePtr(): number { return this.writePtr; }
  getCapacity(): number { return this.capacity; }
  size(): number { return Math.min(this.writePtr, this.capacity); }
  clear(): void { this.writePtr = 0; }
}

/**
 * Simplified numeric ring buffer for single values.
 */
export class NumericRing {
  private readonly capacity: number;
  private readonly buffer: Float64Array;
  private writePtr = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Float64Array(capacity);
  }

  push(value: number): number {
    const idx = this.writePtr % this.capacity;
    this.buffer[idx] = value;
    return this.writePtr++;
  }

  get(logicalIdx: number): number | undefined {
    if (this.writePtr > this.capacity && logicalIdx < this.writePtr - this.capacity) {
      return undefined;
    }
    if (logicalIdx >= this.writePtr) {
      return undefined;
    }
    return this.buffer[logicalIdx % this.capacity];
  }

  getLatest(count: number): number[] {
    const result: number[] = [];
    const start = Math.max(0, this.writePtr - count);
    for (let i = start; i < this.writePtr; i++) {
      const val = this.get(i);
      if (val !== undefined) result.push(val);
    }
    return result;
  }

  size(): number { return Math.min(this.writePtr, this.capacity); }
  clear(): void { this.writePtr = 0; }
}
