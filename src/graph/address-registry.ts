/**
 * Address Registry Index
 *
 * Provides O(1) lookups for canonical addresses in a patch.
 * This is a performance optimization - builds an index once, queries many times.
 */

import { CanonicalAddress, addressToString } from '../types/canonical-address';
import type { Patch } from './Patch';
import { getBlockAddress, getOutputAddress, getInputAddress, getAllAddresses, getShorthandForOutput } from './addressing';
import { resolveAddress, ResolvedAddress } from './address-resolution';

/**
 * AddressRegistry provides fast O(1) lookup of addresses.
 *
 * Design:
 * - Built once from a Patch
 * - Immutable after construction
 * - Indexes both canonical addresses and shorthand strings
 * - All queries are O(1) Map lookups
 *
 * Use when:
 * - Many address lookups on same patch
 * - Performance-critical paths (e.g., runtime, large patches)
 *
 * Don't use when:
 * - Single lookup (use resolveAddress directly)
 * - Patch changes frequently (rebuild cost > lookup savings)
 */
export class AddressRegistry {
  private readonly byCanonical: Map<string, ResolvedAddress>;
  private readonly byShorthand: Map<string, CanonicalAddress>;

  private constructor(
    byCanonical: Map<string, ResolvedAddress>,
    byShorthand: Map<string, CanonicalAddress>
  ) {
    this.byCanonical = byCanonical;
    this.byShorthand = byShorthand;
  }

  /**
   * Build an address registry from a patch.
   *
   * Indexes all addressable elements:
   * - Blocks
   * - Output ports
   * - Input ports
   *
   * Note: Params are NOT indexed (they don't have predictable IDs).
   *
   * @param patch - The patch to index
   * @returns Immutable registry
   */
  static buildFromPatch(patch: Patch): AddressRegistry {
    const byCanonical = new Map<string, ResolvedAddress>();
    const byShorthand = new Map<string, CanonicalAddress>();

    // Index all addressable elements
    for (const block of patch.blocks.values()) {
      // Block address
      const blockAddr = getBlockAddress(block);
      const resolved = resolveAddress(patch, addressToString(blockAddr));
      if (resolved) {
        byCanonical.set(addressToString(blockAddr), resolved);
      }

      // Output ports
      for (const [portId, port] of block.outputPorts || []) {
        const outAddr = getOutputAddress(block, portId as any);
        const resolved = resolveAddress(patch, addressToString(outAddr));
        if (resolved) {
          const addrStr = addressToString(outAddr);
          byCanonical.set(addrStr, resolved);

          // Add shorthand
          const shorthand = getShorthandForOutput(block, portId as any);
          byShorthand.set(shorthand, outAddr);
        }
      }

      // Input ports
      for (const [portId, port] of block.inputPorts || []) {
        const inAddr = getInputAddress(block, portId as any);
        const resolved = resolveAddress(patch, addressToString(inAddr));
        if (resolved) {
          const addrStr = addressToString(inAddr);
          byCanonical.set(addrStr, resolved);

          // Note: We don't add input shorthand to avoid conflicts with outputs
          // resolveShorthand() handles inputs as fallback
        }
      }
    }

    return new AddressRegistry(byCanonical, byShorthand);
  }

  /**
   * Resolve a canonical address string.
   *
   * @param address - Canonical address string (e.g., "v1:blocks.my_block.outputs.out")
   * @returns Resolved address or null if not found
   */
  resolve(address: string): ResolvedAddress | null {
    return this.byCanonical.get(address) || null;
  }

  /**
   * Resolve a shorthand string.
   *
   * @param shorthand - Shorthand string (e.g., "my_block.out")
   * @returns Canonical address or null if not found
   */
  resolveShorthand(shorthand: string): CanonicalAddress | null {
    return this.byShorthand.get(shorthand) || null;
  }

  /**
   * Get the number of indexed addresses.
   * Useful for debugging and testing.
   */
  get size(): number {
    return this.byCanonical.size;
  }

  /**
   * Get the number of indexed shorthands.
   * Useful for debugging and testing.
   */
  get shorthandCount(): number {
    return this.byShorthand.size;
  }
}
