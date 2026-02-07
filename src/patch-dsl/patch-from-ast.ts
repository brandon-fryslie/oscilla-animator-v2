/**
 * AST → Patch Converter
 *
 * Converts a parsed HCL AST to a Patch object.
 * Two-phase algorithm:
 * 1. Process block entries → build block map + collect deferred inline edges
 * 2. Resolve deferred inline edges → assemble edges
 *
 * Standalone connect {} blocks are NOT supported.
 * Edges are declared inline via outputs {} / inputs {} inside block definitions.
 *
 * Error handling:
 * - Collect errors, don't throw (allows partial patches)
 * - Unresolvable references → skip edge, add error
 * - Duplicate names → rename with suffix, add warning
 */

import type { Patch, Block, Edge, Endpoint, InputPort, OutputPort, LensAttachment } from '../graph/Patch';
import type { HclDocument, HclBlock, HclValue, Position } from './ast';
import { PatchDslError, PatchDslWarning } from './errors';
import { normalizeCanonicalName } from '../core/canonical-name';
import { getBlockDefinition } from '../blocks/registry';
import { toIdentifier } from './serialize';
import type { BlockId } from '../types';

/**
 * A deferred inline edge collected during Phase 1 block processing.
 * Resolved in Phase 2 after all blocks are registered.
 */
interface DeferredInlineEdge {
  readonly ownerBlockId: BlockId;
  readonly direction: 'outputs' | 'inputs';
  readonly localPort: string;
  readonly remoteRef: HclValue;
  readonly pos: Position;
}

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
 * Process the contents of a patch (blocks and inline edges).
 *
 * Phase 1: Process block entries, collect deferred inline edges from outputs/inputs children.
 * Phase 2: Resolve deferred inline edges into Edge objects.
 *
 * Standalone connect {} blocks produce an error.
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
  // Phase 1: Extract blocks + collect deferred inline edges
  const blockMap = new Map<string, BlockId>();  // canonical name → BlockId
  const patchBlocks = new Map<BlockId, Block>();
  const deferredEdges: DeferredInlineEdge[] = [];

  for (const hclBlock of blocks.filter(b => b.type === 'block')) {
    const result = processBlock(hclBlock, blockMap, errors, warnings);
    if (result) {
      patchBlocks.set(result.id, result);

      // Collect inline edges from outputs/inputs children
      for (const child of hclBlock.children) {
        if (child.type === 'outputs' || child.type === 'inputs') {
          for (const [localPort, remoteRef] of Object.entries(child.attributes)) {
            if (remoteRef.kind === 'list') {
              // Fan-out: multiple targets as list
              for (const item of remoteRef.items) {
                deferredEdges.push({
                  ownerBlockId: result.id,
                  direction: child.type as 'outputs' | 'inputs',
                  localPort,
                  remoteRef: item,
                  pos: child.pos,
                });
              }
            } else {
              deferredEdges.push({
                ownerBlockId: result.id,
                direction: child.type as 'outputs' | 'inputs',
                localPort,
                remoteRef,
                pos: child.pos,
              });
            }
          }
        }
      }
    }
  }

  // Reject standalone connect {} blocks
  for (const hclBlock of blocks.filter(b => b.type === 'connect')) {
    errors.push(new PatchDslError(
      'Standalone connect blocks are not supported; use outputs/inputs inside block definitions',
      hclBlock.pos
    ));
  }

  // Phase 2: Resolve deferred inline edges
  const edges: Edge[] = [];
  const seenEdgeKeys = new Set<string>();
  let sortKey = 0;

  for (const deferred of deferredEdges) {
    const remote = resolveReference(deferred.remoteRef, blockMap);
    if (!remote) {
      errors.push(new PatchDslError(
        `Unresolved reference in ${deferred.direction}: ${formatHclValue(deferred.remoteRef)}`,
        deferred.pos
      ));
      continue;
    }

    // Determine from/to based on direction
    let from: Endpoint;
    let to: Endpoint;
    if (deferred.direction === 'outputs') {
      from = { kind: 'port', blockId: deferred.ownerBlockId, slotId: deferred.localPort };
      to = remote;
    } else {
      to = { kind: 'port', blockId: deferred.ownerBlockId, slotId: deferred.localPort };
      from = remote;
    }

    // Deduplicate: same from+to endpoints → keep first
    const edgeKey = `${from.blockId}:${from.slotId}→${to.blockId}:${to.slotId}`;
    if (seenEdgeKeys.has(edgeKey)) {
      continue;
    }
    seenEdgeKeys.add(edgeKey);

    edges.push({
      id: generateId(),
      from,
      to,
      enabled: true,
      sortKey,
      role: { kind: 'user', meta: {} as Record<string, never> },
    });
    sortKey++;
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

  // Process nested blocks for port overrides, lenses
  for (const child of hclBlock.children) {
    if (child.type === 'port' && child.labels.length === 1) {
      // Port override block
      const portId = child.labels[0];
      const port = inputPorts.get(portId);
      if (port) {
        // Create new port object with overrides (readonly fields require replacement)
        const combineModeAttr = child.attributes.combineMode;
        const defaultSourceAttr = child.attributes.defaultSource;

        const newPort: InputPort = {
          ...port,
          ...(combineModeAttr ? { combineMode: convertHclValue(combineModeAttr) as 'last' | 'sum' } : {}),
          ...(defaultSourceAttr ? { defaultSource: convertHclValue(defaultSourceAttr) as any } : {}),
        };
        inputPorts.set(portId, newPort);
      } else {
        warnings.push(new PatchDslWarning(`Port override for unknown port "${portId}"`, child.pos));
      }
    } else if (child.type === 'vararg' && child.labels.length === 1) {
      // Legacy vararg block — ignored (collect edges replace varargs)
      warnings.push(new PatchDslWarning(`Vararg block ignored (deprecated): "${child.labels[0]}"`, child.pos));
    } else if (child.type === 'lens' && child.labels.length === 1) {
      // Lens attachment block
      const lensType = child.labels[0];
      const portAttr = child.attributes.port;
      const sourceAddressAttr = child.attributes.sourceAddress;

      if (!portAttr) {
        warnings.push(new PatchDslWarning(`Lens block missing port attribute: "${lensType}"`, child.pos));
      } else if (!sourceAddressAttr) {
        warnings.push(new PatchDslWarning(`Lens block missing sourceAddress: "${lensType}"`, child.pos));
      } else {
        const portId = convertHclValue(portAttr) as string;
        const sourceAddress = convertHclValue(sourceAddressAttr) as string;

        // Extract lens params (exclude reserved attributes)
        const lensParams: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(child.attributes)) {
          if (key !== 'port' && key !== 'sourceAddress') {
            lensParams[key] = convertHclValue(value);
          }
        }

        const port = inputPorts.get(portId);
        if (port) {
          const lens: LensAttachment = {
            id: `lens_${lensType}_${sourceAddress}`,
            lensType,
            sourceAddress,
            params: Object.keys(lensParams).length > 0 ? lensParams : undefined,
            sortKey: (port.lenses?.length ?? 0),
          };
          const existingLenses = port.lenses ?? [];
          const newPort: InputPort = {
            ...port,
            lenses: [...existingLenses, lens],
          };
          inputPorts.set(portId, newPort);
        } else {
          warnings.push(new PatchDslWarning(`Lens for unknown port "${portId}"`, child.pos));
        }
      }
    }
  }

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
 * Format HclValue for error messages.
 * Returns user-friendly string representation.
 *
 * @param value - HCL value node
 * @returns Formatted string
 */
function formatHclValue(value: HclValue): string {
  switch (value.kind) {
    case 'number': return value.value.toString();
    case 'string': return `"${value.value}"`;
    case 'bool': return value.value.toString();
    case 'null': return 'null';
    case 'reference': return value.parts.join('.');
    case 'object': return '{...}';
    case 'list': return '[...]';
  }
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
    case 'null': return null;
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
