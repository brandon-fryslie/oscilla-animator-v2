/**
 * Shared hashing helpers.
 * // [LAW:one-source-of-truth] Hash behavior lives in one reusable utility.
 */
export class HashUtils {
  private static readonly FNV1A_OFFSET_BASIS = 0x811c9dc5;
  private static readonly FNV1A_PRIME = 0x01000193;

  private constructor() {}

  static hashU8(values: Uint8Array, count: number): number {
    let hash = HashUtils.FNV1A_OFFSET_BASIS;
    for (let i = 0; i < count; i++) {
      hash ^= values[i]!;
      hash = Math.imul(hash, HashUtils.FNV1A_PRIME);
    }
    return hash >>> 0;
  }

  static hashF32Bits(values: Float32Array, count: number): number {
    let hash = HashUtils.FNV1A_OFFSET_BASIS;
    const words = new Uint32Array(values.buffer, values.byteOffset, count);
    for (let i = 0; i < count; i++) {
      const word = words[i]!;
      hash ^= word & 0xff;
      hash = Math.imul(hash, HashUtils.FNV1A_PRIME);
      hash ^= (word >>> 8) & 0xff;
      hash = Math.imul(hash, HashUtils.FNV1A_PRIME);
      hash ^= (word >>> 16) & 0xff;
      hash = Math.imul(hash, HashUtils.FNV1A_PRIME);
      hash ^= (word >>> 24) & 0xff;
      hash = Math.imul(hash, HashUtils.FNV1A_PRIME);
    }
    return hash >>> 0;
  }
}
