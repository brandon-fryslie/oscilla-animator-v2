/**
 * Canonical Addressing System
 *
 * Provides stable, human-readable addresses for graph elements based on canonical names.
 * Addresses use versioned format: `v1:blocks.{canonical_name}.outputs.{port_id}`
 *
 * This is the SINGLE SOURCE OF TRUTH for address format and parsing.
 * All addressing logic MUST use these types and functions.
 */

import type { BlockId, PortId } from './index';

/**
 * Canonical address discriminated union.
 * Each address variant includes BOTH blockId (for fast lookup) AND canonicalName (for readability).
 *
 * Design rationale:
 * - canonicalName: Human-readable, stable across renames (until next normalization)
 * - blockId: Fast O(1) lookup in patch.blocks map
 * - Discriminated union: Type-safe, exhaustive pattern matching
 */
export type CanonicalAddress =
  | BlockAddress
  | OutputAddress
  | InputAddress
  | ParamAddress
  | LensAddress;

/**
 * Address to a block.
 * Format: `v1:blocks.{canonical_name}`
 */
export interface BlockAddress {
  readonly kind: 'block';
  readonly blockId: BlockId;
  readonly canonicalName: string;
}

/**
 * Address to an output port.
 * Format: `v1:blocks.{canonical_name}.outputs.{port_id}`
 */
export interface OutputAddress {
  readonly kind: 'output';
  readonly blockId: BlockId;
  readonly canonicalName: string;
  readonly portId: PortId;
}

/**
 * Address to an input port.
 * Format: `v1:blocks.{canonical_name}.inputs.{port_id}`
 */
export interface InputAddress {
  readonly kind: 'input';
  readonly blockId: BlockId;
  readonly canonicalName: string;
  readonly portId: PortId;
}

/**
 * Address to a block parameter.
 * Format: `v1:blocks.{canonical_name}.params.{param_id}`
 */
export interface ParamAddress {
  readonly kind: 'param';
  readonly blockId: BlockId;
  readonly canonicalName: string;
  readonly paramId: string;
}

/**
 * Address to a lens on an input port.
 * Format: `v1:blocks.{canonical_name}.inputs.{port_id}.lenses.{lens_id}`
 *
 * Lenses are per-port-per-connection signal transformations. Each lens has a unique ID
 * within its port, generated deterministically from the source address it transforms.
 *
 * Sprint 2 Redesign (2026-01-27):
 * - Renamed from AdapterAddress to LensAddress
 * - Path changed from `.adapters.` to `.lenses.`
 * - Lenses are user-controlled transformations, independent of type checking
 * - Future: Output port lenses will use `.outputs.{port_id}.lenses.{lens_id}`
 */
export interface LensAddress {
  readonly kind: 'lens';
  readonly blockId: BlockId;
  readonly canonicalName: string;
  readonly portId: PortId;
  readonly lensId: string;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for BlockAddress.
 */
export function isBlockAddress(addr: CanonicalAddress): addr is BlockAddress {
  return addr.kind === 'block';
}

/**
 * Type guard for OutputAddress.
 */
export function isOutputAddress(addr: CanonicalAddress): addr is OutputAddress {
  return addr.kind === 'output';
}

/**
 * Type guard for InputAddress.
 */
export function isInputAddress(addr: CanonicalAddress): addr is InputAddress {
  return addr.kind === 'input';
}

/**
 * Type guard for ParamAddress.
 */
export function isParamAddress(addr: CanonicalAddress): addr is ParamAddress {
  return addr.kind === 'param';
}

/**
 * Type guard for LensAddress.
 */
export function isLensAddress(addr: CanonicalAddress): addr is LensAddress {
  return addr.kind === 'lens';
}

// =============================================================================
// String Conversion
// =============================================================================

/**
 * Current address format version.
 * Bump this when the format changes (e.g., v1 -> v2).
 */
const CURRENT_VERSION = 'v1';

/**
 * Convert CanonicalAddress to versioned string format.
 *
 * Format examples:
 * - Block: `v1:blocks.my_circle`
 * - Output: `v1:blocks.my_circle.outputs.radius`
 * - Input: `v1:blocks.my_circle.inputs.x`
 * - Param: `v1:blocks.my_circle.params.size`
 * - Lens: `v1:blocks.my_circle.inputs.x.lenses.lens_0`
 *
 * SINGLE SOURCE OF TRUTH for address string format.
 *
 * @param addr - The canonical address to serialize
 * @returns Versioned address string
 */
export function addressToString(addr: CanonicalAddress): string {
  const base = `${CURRENT_VERSION}:blocks.${addr.canonicalName}`;

  switch (addr.kind) {
    case 'block':
      return base;
    case 'output':
      return `${base}.outputs.${addr.portId}`;
    case 'input':
      return `${base}.inputs.${addr.portId}`;
    case 'param':
      return `${base}.params.${addr.paramId}`;
    case 'lens':
      return `${base}.inputs.${addr.portId}.lenses.${addr.lensId}`;
  }
}

/**
 * Parse versioned address string to CanonicalAddress.
 *
 * Supports formats:
 * - `v1:blocks.{canonical_name}` (block)
 * - `v1:blocks.{canonical_name}.{category}.{id}` (output, input, param)
 * - `v1:blocks.{canonical_name}.inputs.{port_id}.lenses.{lens_id}` (lens)
 *
 * Returns null for:
 * - Invalid syntax
 * - Unsupported version
 * - Malformed paths
 *
 * @param str - Versioned address string
 * @returns Parsed address or null if invalid
 */
export function parseAddress(str: string): CanonicalAddress | null {
  // Extract version
  const versionMatch = str.match(/^(v\d+):/);
  if (!versionMatch) return null;

  const version = versionMatch[1];
  if (version !== CURRENT_VERSION) return null; // Unsupported version

  // Remove version prefix
  const path = str.slice(version.length + 1);

  // Must start with "blocks."
  if (!path.startsWith('blocks.')) return null;

  const remainder = path.slice('blocks.'.length);
  const parts = remainder.split('.');

  // Block address: "blocks.{canonical_name}"
  if (parts.length === 1) {
    const canonicalName = parts[0];
    if (!canonicalName) return null;

    return {
      kind: 'block',
      blockId: '' as BlockId, // Will be resolved during lookup
      canonicalName,
    };
  }

  // Port/param address: "blocks.{canonical_name}.{category}.{id}"
  if (parts.length === 3) {
    const [canonicalName, category, id] = parts;
    if (!canonicalName || !category || !id) return null;

    switch (category) {
      case 'outputs':
        return {
          kind: 'output',
          blockId: '' as BlockId,
          canonicalName,
          portId: id as PortId,
        };
      case 'inputs':
        return {
          kind: 'input',
          blockId: '' as BlockId,
          canonicalName,
          portId: id as PortId,
        };
      case 'params':
        return {
          kind: 'param',
          blockId: '' as BlockId,
          canonicalName,
          paramId: id,
        };
      default:
        return null; // Unknown category
    }
  }

  // Lens address: "blocks.{canonical_name}.inputs.{port_id}.lenses.{lens_id}"
  if (parts.length === 5) {
    const [canonicalName, category, portId, lensesLiteral, lensId] = parts;
    if (!canonicalName || !category || !portId || !lensesLiteral || !lensId) return null;

    // Must be inputs.{port_id}.lenses.{lens_id}
    if (category !== 'inputs' || lensesLiteral !== 'lenses') return null;

    return {
      kind: 'lens',
      blockId: '' as BlockId,
      canonicalName,
      portId: portId as PortId,
      lensId,
    };
  }

  return null; // Invalid path structure
}

/**
 * Extract the format version from an address string.
 *
 * @param str - Address string
 * @returns Version identifier (e.g., 'v1') or null if invalid
 */
export function getAddressFormatVersion(str: string): 'v1' | null {
  const match = str.match(/^(v\d+):/);
  if (!match) return null;

  const version = match[1];
  return version === 'v1' ? 'v1' : null; // Only v1 supported for now
}
