/**
 * Address Generation from Patch
 *
 * Generates canonical addresses for blocks and ports in a patch.
 * Uses normalizeCanonicalName from core/canonical-name.ts for name normalization.
 *
 * SINGLE SOURCE OF TRUTH for address generation logic.
 */

import type { Patch, Block } from './Patch';
import type {
  CanonicalAddress,
  BlockAddress,
  OutputAddress,
  InputAddress,
  BlockId,
  PortId,
} from '../types';
import { normalizeCanonicalName } from '../core/canonical-name';

/**
 * Generate canonical address for a block.
 *
 * Uses block's displayName if present, otherwise falls back to blockId.
 * The canonicalName is normalized via normalizeCanonicalName.
 *
 * @param block - The block to generate an address for
 * @returns BlockAddress with blockId and canonicalName
 */
export function getBlockAddress(block: Block): BlockAddress {
  const canonicalName = block.displayName
    ? normalizeCanonicalName(block.displayName)
    : block.id; // Fallback to blockId if no displayName

  return {
    kind: 'block',
    blockId: block.id,
    canonicalName,
  };
}

/**
 * Generate canonical address for an output port.
 *
 * @param block - The block containing the port
 * @param portId - The port ID
 * @returns OutputAddress with blockId, canonicalName, and portId
 */
export function getOutputAddress(block: Block, portId: PortId): OutputAddress {
  const canonicalName = block.displayName
    ? normalizeCanonicalName(block.displayName)
    : block.id;

  return {
    kind: 'output',
    blockId: block.id,
    canonicalName,
    portId,
  };
}

/**
 * Generate canonical address for an input port.
 *
 * @param block - The block containing the port
 * @param portId - The port ID
 * @returns InputAddress with blockId, canonicalName, and portId
 */
export function getInputAddress(block: Block, portId: PortId): InputAddress {
  const canonicalName = block.displayName
    ? normalizeCanonicalName(block.displayName)
    : block.id;

  return {
    kind: 'input',
    blockId: block.id,
    canonicalName,
    portId,
  };
}

/**
 * Get all addresses in a patch.
 *
 * Generates addresses for:
 * - All blocks
 * - All output ports
 * - All input ports
 *
 * Note: Does NOT include param addresses (those are generated on-demand).
 *
 * @param patch - The patch to generate addresses for
 * @returns Array of all canonical addresses in the patch
 */
export function getAllAddresses(patch: Patch): CanonicalAddress[] {
  const addresses: CanonicalAddress[] = [];

  for (const block of patch.blocks.values()) {
    // Block address
    addresses.push(getBlockAddress(block));

    // Output port addresses
    for (const portId of block.outputPorts.keys()) {
      addresses.push(getOutputAddress(block, portId as PortId));
    }

    // Input port addresses
    for (const portId of block.inputPorts.keys()) {
      addresses.push(getInputAddress(block, portId as PortId));
    }
  }

  return addresses;
}

// =============================================================================
// User-Facing Shorthand Support
// =============================================================================

/**
 * Resolve user-facing shorthand to canonical address.
 *
 * Shorthand format: `blockName.portName`
 * Examples:
 * - "my_circle.radius" → output port "radius" on block "my_circle"
 * - "circle.x" → input or output port "x" on block "circle"
 *
 * Resolution rules:
 * 1. Find block by normalized displayName or blockId
 * 2. Check output ports first, then input ports
 * 3. Return null if block or port not found
 *
 * @param patch - The patch to search
 * @param shorthand - Shorthand string (e.g., "blockName.portName")
 * @returns Canonical address or null if not found
 */
export function resolveShorthand(patch: Patch, shorthand: string): CanonicalAddress | null {
  const [blockPart, portPart] = shorthand.split('.');
  if (!blockPart || !portPart) return null;

  // Find block by normalized displayName or blockId
  const block = Array.from(patch.blocks.values()).find(b => {
    const canonical = b.displayName ? normalizeCanonicalName(b.displayName) : b.id;
    return canonical === blockPart.toLowerCase() || b.id === blockPart;
  });

  if (!block) return null;

  // Try output ports first
  const outputPort = block.outputPorts.get(portPart);
  if (outputPort) {
    return getOutputAddress(block, portPart as PortId);
  }

  // Try input ports
  const inputPort = block.inputPorts.get(portPart);
  if (inputPort) {
    return getInputAddress(block, portPart as PortId);
  }

  return null;
}

/**
 * Generate user-facing shorthand for an output port.
 *
 * Format: `canonicalName.portId`
 * Example: "my_circle.radius"
 *
 * @param block - The block containing the port
 * @param portId - The port ID
 * @returns Shorthand string
 */
export function getShorthandForOutput(block: Block, portId: PortId): string {
  const canonical = block.displayName ? normalizeCanonicalName(block.displayName) : block.id;
  return `${canonical}.${portId}`;
}

/**
 * Generate user-facing shorthand for an input port.
 *
 * Format: `canonicalName.portId`
 * Example: "my_circle.x"
 *
 * @param block - The block containing the port
 * @param portId - The port ID
 * @returns Shorthand string
 */
export function getShorthandForInput(block: Block, portId: PortId): string {
  const canonical = block.displayName ? normalizeCanonicalName(block.displayName) : block.id;
  return `${canonical}.${portId}`;
}
