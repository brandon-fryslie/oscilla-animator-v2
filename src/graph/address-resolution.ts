/**
 * Address Resolution Service
 *
 * Resolves canonical address strings to actual graph elements.
 * This is the SINGLE ENFORCER of address lookup logic.
 */

import {
  CanonicalAddress,
  parseAddress,
  isBlockAddress,
  isOutputAddress,
  isInputAddress,
  isParamAddress,
} from '../types/canonical-address';
import type { Patch, Block, OutputPort, InputPort } from './Patch';
import type { PortId } from '../types';
import type { SignalType } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION, signalType } from '../core/canonical-types';
import { BLOCK_DEFS_BY_TYPE } from '../blocks/registry';
import { normalizeCanonicalName } from '../core/canonical-name';

/**
 * Resolved address discriminated union.
 * Each variant contains the parsed address plus the resolved graph element.
 */
export type ResolvedAddress =
  | { kind: 'block'; block: Block; addr: CanonicalAddress }
  | { kind: 'output'; block: Block; port: OutputPort; type: SignalType; addr: CanonicalAddress }
  | { kind: 'input'; block: Block; port: InputPort; type: SignalType; addr: CanonicalAddress }
  | { kind: 'param'; block: Block; paramId: string; value: unknown; addr: CanonicalAddress };

/**
 * Resolve a canonical address string to a graph element.
 *
 * This is the SINGLE SOURCE OF TRUTH for address resolution.
 * Returns null if:
 * - Address string is invalid syntax
 * - Block not found in patch
 * - Port/param not found on block
 *
 * @param patch - The patch to resolve addresses in
 * @param addressStr - Canonical address string (e.g., "v1:blocks.my_block.outputs.out")
 * @returns Resolved address or null if not found
 */
export function resolveAddress(patch: Patch, addressStr: string): ResolvedAddress | null {
  // Parse address string
  const parsed = parseAddress(addressStr);
  if (!parsed) return null;

  // Find the block by canonicalName
  // Note: parseAddress returns empty blockId that needs to be resolved by canonicalName
  let block: Block | undefined;
  for (const b of patch.blocks.values()) {
    const blockCanonicalName = b.displayName ? normalizeCanonicalName(b.displayName) : b.id;

    if (blockCanonicalName === parsed.canonicalName) {
      block = b;
      break;
    }
  }

  if (!block) return null;

  // Update the parsed address with the actual blockId
  const addr = { ...parsed, blockId: block.id };

  if (isBlockAddress(addr)) {
    return { kind: 'block', block, addr };
  }

  if (isOutputAddress(addr)) {
    const port = block.outputPorts.get(addr.portId);
    if (!port) return null;

    // Get type from block definition
    const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
    const outputDef = blockDef?.outputs?.[addr.portId];
    // Use type from definition, or fallback to a default SignalType
    const type = outputDef?.type || signalType(FLOAT);

    return { kind: 'output', block, port, type, addr };
  }

  if (isInputAddress(addr)) {
    const port = block.inputPorts.get(addr.portId);
    if (!port) return null;

    // Get type from block definition
    const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
    const inputDef = blockDef?.inputs?.[addr.portId];
    // Use type from definition, or fallback to a default SignalType
    const type = inputDef?.type || signalType(FLOAT);

    return { kind: 'input', block, port, type, addr };
  }

  if (isParamAddress(addr)) {
    const value = block.params?.[addr.paramId];
    return { kind: 'param', block, paramId: addr.paramId, value, addr };
  }

  return null;
}

/**
 * Resolve an address with diagnostic error messages.
 *
 * Returns both the resolved address (if successful) and a helpful error message (if failed).
 *
 * @param patch - The patch to resolve addresses in
 * @param addressStr - Canonical address string
 * @returns Object with address (or null) and optional error message
 */
export function resolveAddressWithDiagnostic(
  patch: Patch,
  addressStr: string
): { address: ResolvedAddress | null; error?: string } {
  const parsed = parseAddress(addressStr);
  if (!parsed) {
    return { address: null, error: `Invalid address format: "${addressStr}"` };
  }

  // Find the block by canonicalName
  let block: Block | undefined;
  for (const b of patch.blocks.values()) {
    const blockCanonicalName = b.displayName ? normalizeCanonicalName(b.displayName) : b.id;

    if (blockCanonicalName === parsed.canonicalName) {
      block = b;
      break;
    }
  }

  if (!block) {
    return { address: null, error: `Block not found: ${parsed.canonicalName}` };
  }

  const address = resolveAddress(patch, addressStr);
  if (!address) {
    const typeStr =
      parsed.kind === 'output'
        ? 'output port'
        : parsed.kind === 'input'
          ? 'input port'
          : parsed.kind === 'param'
            ? 'parameter'
            : 'element';
    const identifier = 'portId' in parsed ? parsed.portId : 'paramId' in parsed ? parsed.paramId : '';
    return {
      address: null,
      error: `${typeStr} not found on block ${block.type}: ${identifier}`,
    };
  }

  return { address };
}
