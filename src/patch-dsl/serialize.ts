/**
 * Patch → HCL Serializer
 *
 * Converts a Patch object to HCL text representation.
 * This is the simpler direction (no reference resolution needed).
 *
 * Key features:
 * - Deterministic output (sorted blocks, params, edges)
 * - Block name collision handling (append _2, _3 suffixes)
 * - Inline edge syntax: edges emitted as outputs {} inside source block
 * - Skip derived and disabled edges
 * - Pretty-printed with 2-space indentation
 * - Quote param keys that aren't valid identifiers
 */

import type { Patch, Block, Edge, InputPort, LensAttachment, VarargConnection } from '../graph/Patch';
import type { BlockId } from '../types';
import { normalizeCanonicalName } from '../core/canonical-name';
import { emitKey, emitValue } from './hcl-emit-utils';

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

  // Build map: sourceBlockId → enabled user edges
  const edgesBySource = new Map<string, Edge[]>();
  for (const edge of patch.edges) {
    if (edge.role.kind !== 'user') continue;
    if (!edge.enabled) continue;
    const key = edge.from.blockId as string;
    if (!edgesBySource.has(key)) edgesBySource.set(key, []);
    edgesBySource.get(key)!.push(edge);
  }

  let output = `patch "${patchName}" {\n`;

  // Emit blocks (sorted by canonical name for determinism)
  const sortedBlocks = Array.from(patch.blocks.values())
    .sort((a, b) => {
      const nameA = normalizeCanonicalName(nameMap.get(a.id)!);
      const nameB = normalizeCanonicalName(nameMap.get(b.id)!);
      return nameA.localeCompare(nameB);
    });

  for (const block of sortedBlocks) {
    const blockEdges = edgesBySource.get(block.id as string) ?? [];
    output += emitBlock(block, nameMap, 1, blockEdges);
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
export function toIdentifier(displayName: string): string {
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
 * @param edges - Edges sourced from this block (enabled user edges only)
 * @returns HCL text for this block
 */
function emitBlock(block: Block, nameMap: Map<BlockId, string>, indent: number, edges: Edge[]): string {
  const ind = '  '.repeat(indent);
  const blockName = nameMap.get(block.id)!;

  let output = `${ind}block "${block.type}" "${blockName}" {\n`;

  // Emit params (sorted by key, excluding reserved fields)
  const paramKeys = Object.keys(block.params).sort();
  for (const key of paramKeys) {
    output += `${ind}  ${emitKey(key)} = ${emitValue(block.params[key])}\n`;
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

  // Emit inline edges as outputs {}
  if (edges.length > 0) {
    output += emitOutputs(edges, nameMap, indent + 1);
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
function emitLenses(portId: string, lenses: readonly LensAttachment[], indent: number): string {
  const ind = '  '.repeat(indent);

  // Sort lenses by sortKey
  const sorted = [...lenses].sort((a, b) => a.sortKey - b.sortKey);

  let output = '';
  for (const lens of sorted) {
    output += `${ind}lens "${lens.lensType}" {\n`;
    output += `${ind}  port = "${portId}"\n`;
    output += `${ind}  sourceAddress = "${lens.sourceAddress}"\n`;

    // Emit lens params if present
    if (lens.params) {
      const paramKeys = Object.keys(lens.params).sort();
      for (const key of paramKeys) {
        output += `${ind}  ${emitKey(key)} = ${emitValue(lens.params[key])}\n`;
      }
    }

    output += `${ind}}\n`;
  }

  return output;
}

/**
 * Emit inline edges as an outputs {} block.
 *
 * Groups edges by source port. Single-target ports use direct reference,
 * multi-target ports use list syntax [ref1, ref2].
 *
 * NOTE: Uses identifier-safe names (canonical + ASCII-only) for references.
 *
 * @param edges - Edges sourced from this block (already filtered to enabled user edges)
 * @param nameMap - Map from BlockId to display name
 * @param indent - Indentation level
 * @returns HCL text for outputs block
 */
function emitOutputs(edges: Edge[], nameMap: Map<BlockId, string>, indent: number): string {
  const ind = '  '.repeat(indent);

  // Group edges by source port
  const byPort = new Map<string, Edge[]>();
  const sortedEdges = [...edges].sort((a, b) => a.sortKey - b.sortKey);
  for (const edge of sortedEdges) {
    const port = edge.from.slotId;
    if (!byPort.has(port)) byPort.set(port, []);
    byPort.get(port)!.push(edge);
  }

  let output = `${ind}outputs {\n`;

  // Sort ports alphabetically for determinism
  const sortedPorts = Array.from(byPort.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [port, portEdges] of sortedPorts) {
    if (portEdges.length === 1) {
      const edge = portEdges[0];
      const toBlockName = nameMap.get(edge.to.blockId as BlockId)!;
      const toIdent = toIdentifier(toBlockName);
      output += `${ind}  ${port} = ${toIdent}.${edge.to.slotId}\n`;
    } else {
      const refs = portEdges.map(edge => {
        const toBlockName = nameMap.get(edge.to.blockId as BlockId)!;
        const toIdent = toIdentifier(toBlockName);
        return `${toIdent}.${edge.to.slotId}`;
      });
      output += `${ind}  ${port} = [${refs.join(', ')}]\n`;
    }
  }

  output += `${ind}}\n`;
  return output;
}
