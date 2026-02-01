/**
 * AST → Patch Converter
 *
 * Converts a parsed HCL AST to a Patch object.
 * Two-phase algorithm:
 * 1. Process block entries → build block map
 * 2. Process connect entries → resolve references → assemble edges
 *
 * Error handling:
 * - Collect errors, don't throw (allows partial patches)
 * - Unresolvable references → skip edge, add error
 * - Duplicate names → rename with suffix, add warning
 */

import type { Patch, Block, Edge, Endpoint, InputPort, OutputPort } from '../graph/Patch';
import type { HclDocument, HclBlock, HclValue } from './ast';
import { PatchDslError, PatchDslWarning } from './errors';
import { normalizeCanonicalName } from '../core/canonical-name';
import { getBlockDefinition } from '../blocks/registry';
import { toIdentifier } from './serialize';
import type { BlockId } from '../types';

/**
 * Result of AST → Patch conversion.
 */
export interface PatchFromAstResult {
  readonly patch: Patch;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

/**
 * Convert HCL AST to Patch.
 *
 * @param document - Parsed HCL document
 * @returns Patch with errors/warnings
 */
export function patchFromAst(document: HclDocument): PatchFromAstResult {
  const errors: PatchDslError[] = [];
  const warnings: PatchDslWarning[] = [];

  // Find the patch header block (should be first top-level block)
  const patchHeader = document.blocks.find(b => b.type === 'patch' || b.type === 'composite');
  if (!patchHeader) {
    // No patch header, treat all top-level blocks as patch contents
    return processPatchContents(document.blocks, errors, warnings);
  }

  // Process children of patch header
  return processPatchContents(patchHeader.children, errors, warnings);
}

/**
 * Process the contents of a patch (blocks and connections).
 *
 * @param blocks - Array of HCL blocks (children of patch header)
 * @param errors - Error collection
 * @param warnings - Warning collection
 * @returns Patch with errors/warnings
 */
function processPatchContents(
  blocks: readonly HclBlock[],
  errors: PatchDslError[],
  warnings: PatchDslWarning[]
): PatchFromAstResult {
  // Phase 1: Extract blocks
  const blockMap = new Map<string, BlockId>();  // canonical name → BlockId
  const patchBlocks = new Map<BlockId, Block>();

  for (const hclBlock of blocks.filter(b => b.type === 'block')) {
    const result = processBlock(hclBlock, blockMap, errors, warnings);
    if (result) {
      patchBlocks.set(result.id, result);
    }
  }

  // Phase 2: Extract edges
  const edges: Edge[] = [];
  let sortKey = 0;
  for (const hclBlock of blocks.filter(b => b.type === 'connect')) {
    const result = processEdge(hclBlock, blockMap, errors, sortKey);
    if (result) {
      edges.push(result);
      sortKey++;
    }
  }

  const patch: Patch = { blocks: patchBlocks, edges };
  return { patch, errors, warnings };
}

/**
 * Process a block entry from AST.
 *
 * @param hclBlock - HCL block node
 * @param blockMap - Map from canonical name to BlockId (for collision detection)
 * @param errors - Error collection
 * @param warnings - Warning collection
 * @returns Block or null if failed
 */
function processBlock(
  hclBlock: HclBlock,
  blockMap: Map<string, BlockId>,
  errors: PatchDslError[],
  warnings: PatchDslWarning[]
): Block | null {
  // Extract type and displayName from labels
  if (hclBlock.labels.length < 2) {
    errors.push(new PatchDslError('Block must have type and displayName labels', hclBlock.pos));
    return null;
  }

  const type = hclBlock.labels[0];
  const displayName = hclBlock.labels[1];

  // Generate BlockId
  const blockId = generateId() as BlockId;

  // Handle name collisions
  const canonicalName = normalizeCanonicalName(displayName);
  let finalDisplayName = displayName;
  if (blockMap.has(canonicalName)) {
    let suffix = 2;
    let candidate = `${displayName}_${suffix}`;
    while (blockMap.has(normalizeCanonicalName(candidate))) {
      suffix++;
      candidate = `${displayName}_${suffix}`;
    }
    finalDisplayName = candidate;
    warnings.push(new PatchDslWarning(`Duplicate block name "${displayName}", renamed to "${candidate}"`, hclBlock.pos));
  }
  const canonicalFinal = normalizeCanonicalName(finalDisplayName);
  blockMap.set(canonicalFinal, blockId);
  // Also register under identifier form (ASCII-only) so serialized references resolve
  const identFinal = toIdentifier(finalDisplayName);
  if (identFinal !== canonicalFinal) {
    blockMap.set(identFinal, blockId);
  }

  // Extract params (exclude reserved: role, domain)
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hclBlock.attributes)) {
    if (key !== 'role' && key !== 'domain') {
      params[key] = convertHclValue(value);
    }
  }

  // Extract role
  const roleAttr = hclBlock.attributes.role;
  const role = roleAttr ? { kind: convertHclValue(roleAttr) as string, meta: {} } : { kind: 'user', meta: {} };

  // Extract domain
  const domainIdAttr = hclBlock.attributes.domain;
  const domainId = domainIdAttr ? convertHclValue(domainIdAttr) as string : null;

  // Build ports from registry defaults
  const blockDef = getBlockDefinition(type);
  if (!blockDef) {
    warnings.push(new PatchDslWarning(`Unknown block type "${type}"`, hclBlock.pos));
  }

  const inputPorts = new Map<string, InputPort>();
  const outputPorts = new Map<string, OutputPort>();

  // Initialize input ports from registry
  if (blockDef) {
    for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort !== false) {
        inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
      }
    }

    // Initialize output ports from registry
    for (const outputId of Object.keys(blockDef.outputs)) {
      outputPorts.set(outputId, { id: outputId });
    }
  }

  // TODO: Process nested blocks for port overrides, varargs, lenses
  // For now, just create basic block structure

  const block: Block = {
    id: blockId,
    type,
    params,
    displayName: finalDisplayName,
    domainId,
    role: role as any,
    inputPorts,
    outputPorts,
  };

  return block;
}

/**
 * Process a connect entry from AST.
 *
 * @param hclBlock - HCL connect block
 * @param blockMap - Map from canonical name to BlockId
 * @param errors - Error collection
 * @param sortKey - Edge sort key
 * @returns Edge or null if failed
 */
function processEdge(
  hclBlock: HclBlock,
  blockMap: Map<string, BlockId>,
  errors: PatchDslError[],
  sortKey: number
): Edge | null {
  const fromAttr = hclBlock.attributes.from;
  const toAttr = hclBlock.attributes.to;

  if (!fromAttr || !toAttr) {
    errors.push(new PatchDslError('connect block must have from and to attributes', hclBlock.pos));
    return null;
  }

  const from = resolveReference(fromAttr, blockMap);
  const to = resolveReference(toAttr, blockMap);

  if (!from) {
    errors.push(new PatchDslError(`Unresolved from reference: ${JSON.stringify(fromAttr)}`, hclBlock.pos));
    return null;
  }

  if (!to) {
    errors.push(new PatchDslError(`Unresolved to reference: ${JSON.stringify(toAttr)}`, hclBlock.pos));
    return null;
  }

  const enabled = hclBlock.attributes.enabled ? convertHclValue(hclBlock.attributes.enabled) as boolean : true;

  const edge: Edge = {
    id: generateId(),
    from,
    to,
    enabled,
    sortKey,
    role: { kind: 'user', meta: {} as Record<string, never> },
  };

  return edge;
}

/**
 * Resolve a reference value (blockName.portName) to an Endpoint.
 *
 * @param value - HCL value (should be reference)
 * @param blockMap - Map from canonical name to BlockId
 * @returns Endpoint or null if unresolvable
 */
function resolveReference(value: HclValue, blockMap: Map<string, BlockId>): Endpoint | null {
  if (value.kind !== 'reference') return null;
  if (value.parts.length !== 2) return null;

  const [blockName, portName] = value.parts;
  const blockId = blockMap.get(normalizeCanonicalName(blockName));

  if (!blockId) return null;

  return {
    kind: 'port',
    blockId,
    slotId: portName,
  };
}

/**
 * Convert HCL value to JavaScript value.
 *
 * @param value - HCL value node
 * @returns JavaScript value
 */
function convertHclValue(value: HclValue): unknown {
  switch (value.kind) {
    case 'number': return value.value;
    case 'string': return value.value;
    case 'bool': return value.value;
    case 'reference': return value.parts.join('.');  // Convert to string
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.entries)) {
        obj[k] = convertHclValue(v);
      }
      return obj;
    }
    case 'list': return value.items.map(convertHclValue);
  }
}

/**
 * Generate a unique ID.
 * Simple counter-based ID generator for deserialization.
 */
let idCounter = 0;
function generateId(): string {
  return `id_${Date.now()}_${idCounter++}`;
}
