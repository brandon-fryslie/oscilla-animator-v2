/**
 * Address Registry Index
 *
 * Provides O(1) lookups for canonical addresses in a patch.
 * This is a performance optimization - builds an index once, queries many times.
 */

import { CanonicalAddress, addressToString } from '../types/canonical-address';
import type { InputPort, OutputPort, Patch } from './Patch';
import { getBlockAddress, getOutputAddress, getInputAddress, getAllAddresses, getShorthandForOutput } from './addressing';
import { resolveAddress, ResolvedAddress } from './address-resolution';
import { normalizeCanonicalName } from '../core/canonical-name';
import type { BlockId, PortId } from '../types';
import { portId as toPortId } from '../types';

/**
 * Normalize the canonical name portion of an address string.
 * Converts 'v1:blocks.MyBlock.outputs.out' → 'v1:blocks.myblock.outputs.out'
 */
function normalizeAddressCanonicalName(address: string): string {
  // Parse: v1:blocks.{canonicalName}.{rest...}
  const match = address.match(/^(v\d+:blocks\.)([^.]+)(.*)$/);
  if (!match) return address;
  const [, prefix, canonicalName, suffix] = match;
  return `${prefix}${normalizeCanonicalName(canonicalName)}${suffix}`;
}

function strictPortId(
  rawPortId: unknown,
  port: InputPort | OutputPort,
  blockId: BlockId,
  direction: 'input' | 'output'
): PortId {
  if (typeof rawPortId !== 'string') {
    throw new Error(
      `AddressRegistry invariant violation: ${direction} port key is not a string on block "${blockId}" (${String(rawPortId)})`
    );
  }
  const trimmedPortId = rawPortId.trim();
  if (rawPortId !== trimmedPortId) {
    throw new Error(
      `AddressRegistry invariant violation: ${direction} port key has leading or trailing whitespace on block "${blockId}" ("${rawPortId}")`
    );
  }
  if (rawPortId.length === 0) {
    throw new Error(`AddressRegistry invariant violation: ${direction} port id is empty on block "${blockId}"`);
  }
  if (port.id !== rawPortId) {
    throw new Error(
      `AddressRegistry invariant violation: ${direction} port key/id mismatch on block "${blockId}" (${rawPortId} !== ${port.id})`
    );
  }
  return toPortId(rawPortId);
}

function assertPortMap(
  ports: unknown,
  blockId: BlockId,
  direction: 'input' | 'output',
): asserts ports is ReadonlyMap<unknown, unknown> {
  if (!(ports instanceof Map)) {
    throw new Error(
      `AddressRegistry invariant violation: ${direction}Ports is not a Map on block "${blockId}"`
    );
  }
}

function assertPortShape(
  port: unknown,
  blockId: BlockId,
  direction: 'input' | 'output',
): asserts port is InputPort | OutputPort {
  if (typeof port !== 'object' || port === null) {
    throw new Error(
      `AddressRegistry invariant violation: ${direction} port entry is not an object on block "${blockId}"`
    );
  }
  const rawId = Object.getOwnPropertyDescriptor(port, 'id')?.value;
  if (typeof rawId !== 'string') {
    throw new Error(
      `AddressRegistry invariant violation: ${direction} port entry is missing string id on block "${blockId}"`
    );
  }
}

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

      assertPortMap(block.outputPorts, block.id, 'output');
      // Output ports
      for (const [portId, port] of block.outputPorts) {
        assertPortShape(port, block.id, 'output');
        const typedPortId = strictPortId(portId, port, block.id, 'output');
        const outAddr = getOutputAddress(block, typedPortId);
        const resolved = resolveAddress(patch, addressToString(outAddr));
        if (resolved) {
          const addrStr = addressToString(outAddr);
          byCanonical.set(addrStr, resolved);

          // Add shorthand
          const shorthand = getShorthandForOutput(block, typedPortId);
          byShorthand.set(shorthand, outAddr);
        }
      }

      assertPortMap(block.inputPorts, block.id, 'input');
      // Input ports
      for (const [portId, port] of block.inputPorts) {
        assertPortShape(port, block.id, 'input');
        const typedPortId = strictPortId(portId, port, block.id, 'input');
        const inAddr = getInputAddress(block, typedPortId);
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
   * Normalizes the canonical name portion for case-insensitive lookup.
   *
   * @param address - Canonical address string (e.g., "v1:blocks.my_block.outputs.out")
   * @returns Resolved address or null if not found
   */
  resolve(address: string): ResolvedAddress | null {
    // Normalize the canonical name portion for case-insensitive lookup
    const normalized = normalizeAddressCanonicalName(address);
    return this.byCanonical.get(normalized) || null;
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
