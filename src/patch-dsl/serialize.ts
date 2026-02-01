/**
 * Patch → HCL Serializer
 *
 * Converts a Patch object to HCL text representation.
 * This is the simpler direction (no reference resolution needed).
 *
 * Key features:
 * - Deterministic output (sorted blocks, edges, params)
 * - Block name collision handling (append _2, _3 suffixes)
 * - Skip derived edges (only emit user edges)
 * - Pretty-printed with 2-space indentation
 */

import type { Patch, Block, Edge, InputPort, LensAttachment, VarargConnection } from '../graph/Patch';
import type { BlockId } from '../types';
import { normalizeCanonicalName } from '../core/canonical-name';

/**
 * Options for serialization.
 */
export interface SerializeOptions {
  /** Patch name (appears in `patch "Name" {}` header) */
  readonly name?: string;
}

/**
 * Serialize a Patch to HCL text.
 *
 * @param patch - The patch to serialize
 * @param options - Serialization options
 * @returns HCL text representation
 */
export function serializePatchToHCL(patch: Patch, options?: SerializeOptions): string {
  const patchName = options?.name ?? 'Untitled';
  const nameMap = buildBlockNameMap(patch);

  let output = `patch "${patchName}" {\n`;

  // Emit blocks (sorted by canonical name for determinism)
  const sortedBlocks = Array.from(patch.blocks.values())
    .sort((a, b) => {
      const nameA = normalizeCanonicalName(nameMap.get(a.id)!);
      const nameB = normalizeCanonicalName(nameMap.get(b.id)!);
      return nameA.localeCompare(nameB);
    });

  for (const block of sortedBlocks) {
    output += emitBlock(block, nameMap, 1);
  }

  // Emit edges (only user edges, sorted by sortKey)
  const userEdges = patch.edges.filter(e => e.role.kind === 'user');
  const sortedEdges = [...userEdges].sort((a, b) => a.sortKey - b.sortKey);

  for (const edge of sortedEdges) {
    output += emitEdge(edge, nameMap, 1);
  }

  output += '}\n';
  return output;
}

/**
 * Build a map from BlockId to display name, handling collisions.
 *
 * If multiple blocks have the same canonical name, append _2, _3, etc.
 * to make them unique.
 *
 * @param patch - The patch
 * @returns Map from BlockId to unique display name
 */
function buildBlockNameMap(patch: Patch): Map<BlockId, string> {
  const nameMap = new Map<BlockId, string>();
  const usedNames = new Set<string>();

  // Sort blocks by display name for deterministic collision handling
  const sortedBlocks = Array.from(patch.blocks.values())
    .sort((a, b) => normalizeCanonicalName(a.displayName).localeCompare(normalizeCanonicalName(b.displayName)));

  for (const block of sortedBlocks) {
    let candidate = block.displayName;
    let suffix = 2;

    // Check for canonical name collisions
    while (usedNames.has(normalizeCanonicalName(candidate))) {
      candidate = `${block.displayName}_${suffix}`;
      suffix++;
    }

    nameMap.set(block.id, candidate);
    usedNames.add(normalizeCanonicalName(candidate));
  }

  return nameMap;
}

/**
 * Convert a display name to a valid HCL identifier.
 *
 * Applies canonical normalization first, then strips any remaining non-ASCII
 * or non-identifier characters (only allows a-z, 0-9, _, -).
 *
 * @param displayName - The display name
 * @returns Valid HCL identifier (ASCII only, no special chars)
 */
function toIdentifier(displayName: string): string {
  // First apply canonical normalization (lowercase, strip special chars, replace spaces)
  const canonical = normalizeCanonicalName(displayName);

  // Then strip any remaining non-identifier characters (only allow a-z, 0-9, _, -)
  // This handles Unicode characters and any other edge cases
  return canonical.replace(/[^a-z0-9_-]/g, '');
}

/**
 * Emit a single block.
 *
 * @param block - The block to emit
 * @param nameMap - Map from BlockId to display name
 * @param indent - Indentation level
 * @returns HCL text for this block
 */
function emitBlock(block: Block, nameMap: Map<BlockId, string>, indent: number): string {
  const ind = '  '.repeat(indent);
  const blockName = nameMap.get(block.id)!;

  let output = `${ind}block "${block.type}" "${blockName}" {\n`;

  // Emit params (sorted by key, excluding reserved fields)
  const paramKeys = Object.keys(block.params).sort();
  for (const key of paramKeys) {
    output += `${ind}  ${key} = ${emitValue(block.params[key])}\n`;
  }

  // Emit role (if not default 'user')
  if (block.role.kind !== 'user') {
    output += `${ind}  role = "${block.role.kind}"\n`;
  }

  // Emit domain (if non-null)
  if (block.domainId !== null) {
    output += `${ind}  domain = "${block.domainId}"\n`;
  }

  // Emit port overrides (combineMode, defaultSource)
  const sortedInputPorts = Array.from(block.inputPorts.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [portId, port] of sortedInputPorts) {
    // Emit port block if combineMode is not default or defaultSource is set
    if (port.combineMode !== 'last' || port.defaultSource) {
      output += emitPortOverride(portId, port, indent + 1);
    }

    // Emit varargs if present
    if (port.varargConnections && port.varargConnections.length > 0) {
      output += emitVarargConnections(portId, port.varargConnections, indent + 1);
    }

    // Emit lenses if present
    if (port.lenses && port.lenses.length > 0) {
      output += emitLenses(portId, port.lenses, indent + 1);
    }
  }

  output += `${ind}}\n\n`;
  return output;
}

/**
 * Emit port override block (combineMode, defaultSource).
 *
 * @param portId - The port ID
 * @param port - The input port
 * @param indent - Indentation level
 * @returns HCL text for port override
 */
function emitPortOverride(portId: string, port: InputPort, indent: number): string {
  const ind = '  '.repeat(indent);
  let output = `${ind}port "${portId}" {\n`;

  if (port.combineMode !== 'last') {
    output += `${ind}  combineMode = "${port.combineMode}"\n`;
  }

  if (port.defaultSource) {
    // DefaultSource can be a reference or a constant value
    if (typeof port.defaultSource === 'object' && 'kind' in port.defaultSource) {
      // It's a structured default source (e.g., { kind: 'const', value: ... })
      output += `${ind}  defaultSource = ${emitValue(port.defaultSource)}\n`;
    } else {
      // It's a simple value
      output += `${ind}  defaultSource = ${emitValue(port.defaultSource)}\n`;
    }
  }

  output += `${ind}}\n`;
  return output;
}

/**
 * Emit vararg connections for a port.
 *
 * @param portId - The port ID
 * @param connections - Array of vararg connections
 * @param indent - Indentation level
 * @returns HCL text for vararg connections
 */
function emitVarargConnections(
  portId: string,
  connections: readonly VarargConnection[],
  indent: number
): string {
  const ind = '  '.repeat(indent);

  // Sort connections by sortKey
  const sorted = [...connections].sort((a, b) => a.sortKey - b.sortKey);

  let output = `${ind}vararg "${portId}" {\n`;
  for (const conn of sorted) {
    output += `${ind}  connect {\n`;
    output += `${ind}    sourceAddress = "${conn.sourceAddress}"\n`;
    if (conn.alias) {
      output += `${ind}    alias = "${conn.alias}"\n`;
    }
    output += `${ind}    sortKey = ${conn.sortKey}\n`;
    output += `${ind}  }\n`;
  }
  output += `${ind}}\n`;
  return output;
}

/**
 * Emit lens attachments for a port.
 *
 * @param portId - The port ID
 * @param lenses - Array of lens attachments
 * @param indent - Indentation level
 * @returns HCL text for lens attachments
 */
function emitLenses(_portId: string, lenses: readonly LensAttachment[], indent: number): string {
  const ind = '  '.repeat(indent);

  // Sort lenses by sortKey
  const sorted = [...lenses].sort((a, b) => a.sortKey - b.sortKey);

  let output = '';
  for (const lens of sorted) {
    output += `${ind}lens "${lens.lensType}" {\n`;
    output += `${ind}  sourceAddress = "${lens.sourceAddress}"\n`;

    // Emit lens params if present
    if (lens.params) {
      const paramKeys = Object.keys(lens.params).sort();
      for (const key of paramKeys) {
        output += `${ind}  ${key} = ${emitValue(lens.params[key])}\n`;
      }
    }

    output += `${ind}}\n`;
  }

  return output;
}

/**
 * Emit an edge (connection).
 *
 * NOTE: Uses identifier-safe names (canonical + ASCII-only) for references, not display names.
 * This ensures references work in the lexer even with Unicode/special chars in display names.
 *
 * @param edge - The edge to emit
 * @param nameMap - Map from BlockId to display name
 * @param indent - Indentation level
 * @returns HCL text for this edge
 */
function emitEdge(edge: Edge, nameMap: Map<BlockId, string>, indent: number): string {
  const ind = '  '.repeat(indent);
  const fromBlockName = nameMap.get(edge.from.blockId as BlockId)!;
  const toBlockName = nameMap.get(edge.to.blockId as BlockId)!;

  // Convert display names to identifiers (canonical + ASCII-only, safe for lexer)
  const fromIdent = toIdentifier(fromBlockName);
  const toIdent = toIdentifier(toBlockName);

  let output = `${ind}connect {\n`;
  output += `${ind}  from = ${fromIdent}.${edge.from.slotId}\n`;
  output += `${ind}  to = ${toIdent}.${edge.to.slotId}\n`;

  if (!edge.enabled) {
    output += `${ind}  enabled = false\n`;
  }

  output += `${ind}}\n\n`;
  return output;
}

/**
 * Emit a value (HCL literal).
 *
 * Handles: number, string, boolean, null, arrays, objects.
 *
 * @param value - The value to emit
 * @returns HCL text representation
 */
function emitValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    // Escape double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(emitValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k} = ${emitValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  // Fallback for unknown types
  return 'null';
}
