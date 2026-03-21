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
import { deriveEdgeAlias } from '../graph/edge-alias';
import { getBlockDefinition } from '../blocks/registry';
import { toIdentifier } from './serialize';
import type { BlockId, BlockRole, CombineMode, DefaultSource } from '../types';
import {
  canonicalizeCombineMode,
  defaultSourceConst,
  userRole,
  timeRootRole,
  busRole,
  domainRole,
  rendererRole,
} from '../types';

type HclNullValue = { readonly kind: 'hclNull' };
interface HclObjectValue {
  readonly [key: string]: HclJsValue;
}
type HclJsValue =
  | string
  | number
  | boolean
  | HclNullValue
  | HclObjectValue
  | readonly HclJsValue[];

const HCL_NULL_VALUE: HclNullValue = { kind: 'hclNull' };

function isHclNullValue(value: HclJsValue): value is HclNullValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Reflect.get(value, 'kind') === 'hclNull';
}

function isHclObject(value: HclJsValue): value is HclObjectValue {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && !isHclNullValue(value);
}

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

    let alias: string;
    try {
      alias = deriveEdgeAlias(from, patchBlocks);
    } catch (err) {
      errors.push(new PatchDslError(
        err instanceof Error ? err.message : `Cannot derive edge alias for ${from.blockId}.${from.slotId}`,
        deferred.pos
      ));
      continue;
    }

    edges.push({
      id: generateId(),
      from,
      to,
      enabled: true,
      sortKey,
      // [LAW:one-source-of-truth] Derive edge alias from source block/port once at parse boundary.
      // Expression collect refs use this alias as a stable shorthand (e.g., "osc.out").
      alias,
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
  const role = parseBlockRole(roleAttr ? convertHclValue(roleAttr) : 'user', warnings, hclBlock.pos);

  // Extract domain
  const domainIdAttr = hclBlock.attributes.domain;
  const domainId = domainIdAttr ? parseStringValue(convertHclValue(domainIdAttr), '') : null;

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
          ...(combineModeAttr
            ? {
                // [LAW:single-enforcer] Patch DSL normalizes combine aliases at parse boundary.
                combineMode: canonicalizeCombineMode(convertHclValue(combineModeAttr) as CombineMode),
              }
            : {}),
          ...(defaultSourceAttr
            ? {
                defaultSource: parseDefaultSource(convertHclValue(defaultSourceAttr), warnings, child.pos),
              }
            : {}),
        };
        inputPorts.set(portId, newPort);
      } else {
        warnings.push(new PatchDslWarning(`Port override for unknown port "${portId}"`, child.pos));
      }
    } else if (child.type === 'vararg' && child.labels.length === 1) {
      // [LAW:no-silent-fallbacks] Legacy vararg blocks are no longer accepted.
      // Callers must migrate to explicit outputs/inputs edge declarations.
      errors.push(new PatchDslError(`Unsupported legacy vararg block "${child.labels[0]}"`, child.pos));
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
        const portId = parseStringValue(convertHclValue(portAttr), '');
        const sourceAddress = parseStringValue(convertHclValue(sourceAddressAttr), '');

        // Extract lens params (exclude reserved attributes)
        const lensParams: Record<string, HclJsValue> = {};
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
    role,
    inputPorts,
    outputPorts,
  };

  return block;
}

function parseStringValue(value: HclJsValue, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function parseDefaultSource(
  value: HclJsValue,
  warnings: PatchDslWarning[],
  pos: Position,
): DefaultSource {
  if (!isHclObject(value)) {
    return defaultSourceConst(value);
  }
  const blockTypeValue = Reflect.get(value, 'blockType');
  const outputValue = Reflect.get(value, 'output');
  const paramsValue = Reflect.get(value, 'params');
  if (typeof blockTypeValue !== 'string' || typeof outputValue !== 'string') {
    warnings.push(
      new PatchDslWarning(
        'Invalid defaultSource object; expected { blockType: string, output: string, params?: object }',
        pos,
      ),
    );
    return defaultSourceConst(value);
  }
  if (paramsValue === undefined) {
    return {
      blockType: blockTypeValue,
      output: outputValue,
    };
  }
  if (!isHclObject(paramsValue)) {
    warnings.push(
      new PatchDslWarning(
        'Invalid defaultSource.params; expected object when provided',
        pos,
      ),
    );
    return defaultSourceConst(value);
  }
  return {
    blockType: blockTypeValue,
    output: outputValue,
    params: { ...paramsValue },
  };
}

function parseBlockRole(value: HclJsValue, warnings: PatchDslWarning[], pos: Position): BlockRole {
  if (typeof value !== 'string') {
    warnings.push(new PatchDslWarning(`Invalid role value "${String(value)}", using "user"`, pos));
    return userRole();
  }
  switch (value) {
    case 'user':
      return userRole();
    case 'timeRoot':
      return timeRootRole();
    case 'bus':
      return busRole();
    case 'domain':
      return domainRole();
    case 'renderer':
      return rendererRole();
    default:
      warnings.push(new PatchDslWarning(`Unknown role "${value}", using "user"`, pos));
      return userRole();
  }
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
function convertHclValue(value: HclValue): HclJsValue {
  switch (value.kind) {
    case 'number': return value.value;
    case 'string': return value.value;
    case 'bool': return value.value;
    case 'null': return HCL_NULL_VALUE;
    case 'reference': return value.parts.join('.');  // Convert to string
    case 'object': {
      const obj: Record<string, HclJsValue> = {};
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
