/**
 * HCL → CompositeBlockDef Deserializer
 *
 * Converts HCL text with `composite "Type" {}` header to CompositeBlockDef.
 *
 * Two-phase algorithm:
 * 1. Process blocks → build internal block map + collect deferred edges
 * 2. Resolve deferred edges → assemble InternalEdge array
 * 3. Process expose_input/expose_output blocks → build exposed port arrays
 *
 * Error handling:
 * - Collect errors, don't throw (allows partial results)
 * - Unresolvable references → skip edge/port, add error
 * - Missing required metadata → add error
 */

import type {
  CompositeBlockDef,
  InternalBlockId,
  InternalBlockDef,
  InternalEdge,
  ExposedInputPort,
  ExposedOutputPort,
} from '../blocks/composite-types';
import { internalBlockId } from '../blocks/composite-types';
import type { HclDocument, HclBlock, HclValue } from './ast';
import { PatchDslError, PatchDslWarning } from './errors';
import { tokenize } from './lexer';
import { parse } from './parser';
import { getBlockDefinition } from '../blocks/registry';
import type { Capability } from '../blocks/registry';
import { toIdentifier } from './serialize';

/**
 * A deferred internal edge collected during Phase 1 block processing.
 * Resolved in Phase 2 after all internal blocks are registered.
 */
interface DeferredInternalEdge {
  readonly fromBlockId: InternalBlockId;
  readonly fromPort: string;
  readonly remoteRef: HclValue;
  readonly pos: { start: number; end: number };
}

/**
 * Result of HCL deserialization to CompositeBlockDef.
 */
export interface CompositeDeserializeResult {
  readonly def: CompositeBlockDef | null;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

/**
 * Deserialize HCL text to CompositeBlockDef.
 *
 * Error handling:
 * - Collects all errors and warnings
 * - Returns null def if critical errors occur (missing required metadata)
 * - Never throws exceptions (catches lexer/parser exceptions)
 *
 * @param hcl - HCL text
 * @returns CompositeBlockDef with errors/warnings
 */
export function deserializeCompositeFromHCL(hcl: string): CompositeDeserializeResult {
  const errors: PatchDslError[] = [];
  const warnings: PatchDslWarning[] = [];

  try {
    // Phase 1: Lex → Parse
    const tokens = tokenize(hcl);
    const parseResult = parse(tokens);
    errors.push(...parseResult.errors);

    // Phase 2: Extract composite header
    const compositeHeader = parseResult.document.blocks.find(b => b.type === 'composite');
    if (!compositeHeader) {
      errors.push(new PatchDslError('No composite header found', { start: 0, end: 0 }));
      return { def: null, errors, warnings };
    }

    // Reject patch headers (wrong document type)
    const patchHeader = parseResult.document.blocks.find(b => b.type === 'patch');
    if (patchHeader) {
      errors.push(new PatchDslError(
        'Cannot deserialize patch as composite (use deserializePatchFromHCL instead)',
        patchHeader.pos
      ));
      return { def: null, errors, warnings };
    }

    // Extract type name from header labels
    if (compositeHeader.labels.length === 0) {
      errors.push(new PatchDslError('Composite header missing type name', compositeHeader.pos));
      return { def: null, errors, warnings };
    }
    const compositeType = compositeHeader.labels[0];

    // Extract metadata from header attributes
    const labelAttr = compositeHeader.attributes.label;
    const categoryAttr = compositeHeader.attributes.category;
    const descriptionAttr = compositeHeader.attributes.description;
    const capabilityAttr = compositeHeader.attributes.capability;

    if (!labelAttr) {
      errors.push(new PatchDslError('Composite missing required "label" attribute', compositeHeader.pos));
      return { def: null, errors, warnings };
    }

    const label = convertHclValue(labelAttr) as string;
    const category = categoryAttr ? convertHclValue(categoryAttr) as string : 'user';
    const description = descriptionAttr ? convertHclValue(descriptionAttr) as string : undefined;
    const capability = (capabilityAttr ? convertHclValue(capabilityAttr) as Capability : 'pure');

    // Phase 3: Process internal blocks + collect deferred edges
    const internalBlocks = new Map<InternalBlockId, InternalBlockDef>();
    const blockNameMap = new Map<string, InternalBlockId>();  // canonical name → InternalBlockId
    const deferredEdges: DeferredInternalEdge[] = [];

    for (const child of compositeHeader.children) {
      if (child.type === 'block') {
        const result = processInternalBlock(child, blockNameMap, errors, warnings);
        if (result) {
          internalBlocks.set(result.id, result.def);

          // Collect inline edges from outputs children
          for (const subChild of child.children) {
            if (subChild.type === 'outputs') {
              for (const [localPort, remoteRef] of Object.entries(subChild.attributes)) {
                if (remoteRef.kind === 'list') {
                  // Fan-out: multiple targets as list
                  for (const item of remoteRef.items) {
                    deferredEdges.push({
                      fromBlockId: result.id,
                      fromPort: localPort,
                      remoteRef: item,
                      pos: subChild.pos,
                    });
                  }
                } else {
                  deferredEdges.push({
                    fromBlockId: result.id,
                    fromPort: localPort,
                    remoteRef,
                    pos: subChild.pos,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Phase 4: Resolve deferred edges
    const internalEdges: InternalEdge[] = [];
    for (const deferred of deferredEdges) {
      const target = resolveInternalReference(deferred.remoteRef, blockNameMap);
      if (!target) {
        errors.push(new PatchDslError(
          `Unresolved internal reference: ${formatHclValue(deferred.remoteRef)}`,
          deferred.pos
        ));
        continue;
      }

      internalEdges.push({
        fromBlock: deferred.fromBlockId,
        fromPort: deferred.fromPort,
        toBlock: target.blockId,
        toPort: target.portId,
      });
    }

    // Phase 5: Process expose_input and expose_output blocks
    const exposedInputs: ExposedInputPort[] = [];
    const exposedOutputs: ExposedOutputPort[] = [];

    for (const child of compositeHeader.children) {
      if (child.type === 'expose_input') {
        const result = processExposeInput(child, blockNameMap, errors);
        if (result) {
          exposedInputs.push(result);
        }
      } else if (child.type === 'expose_output') {
        const result = processExposeOutput(child, blockNameMap, errors);
        if (result) {
          exposedOutputs.push(result);
        }
      }
    }

    // Validate: must have at least one block and one output
    if (internalBlocks.size === 0) {
      errors.push(new PatchDslError('Composite must have at least one internal block', compositeHeader.pos));
    }
    if (exposedOutputs.length === 0) {
      errors.push(new PatchDslError('Composite must have at least one exposed output', compositeHeader.pos));
    }

    // Build CompositeBlockDef (compute inputs/outputs from exposed ports)
    const inputs: Record<string, any> = {};
    for (const exposedInput of exposedInputs) {
      inputs[exposedInput.externalId] = {
        type: exposedInput.type,
        defaultSource: exposedInput.defaultSource,
        uiHint: exposedInput.uiHint,
        label: exposedInput.externalLabel,
      };
    }

    const outputs: Record<string, any> = {};
    for (const exposedOutput of exposedOutputs) {
      outputs[exposedOutput.externalId] = {
        label: exposedOutput.externalLabel,
      };
    }

    const def: CompositeBlockDef = {
      type: compositeType,
      label,
      category,
      description,
      form: 'composite',
      capability,
      internalBlocks,
      internalEdges,
      exposedInputs,
      exposedOutputs,
      inputs,
      outputs,
    };

    return { def, errors, warnings };
  } catch (e) {
    // Lexer or parser threw an exception
    const errorMessage = e instanceof Error ? e.message : String(e);
    errors.push(new PatchDslError(`Parse failed: ${errorMessage}`, { start: 0, end: 0 }));
    return { def: null, errors, warnings };
  }
}

/**
 * Process an internal block from AST.
 *
 * @param hclBlock - HCL block node
 * @param blockMap - Map from canonical name to InternalBlockId
 * @param errors - Error collection
 * @param warnings - Warning collection
 * @returns Internal block or null if failed
 */
function processInternalBlock(
  hclBlock: HclBlock,
  blockMap: Map<string, InternalBlockId>,
  errors: PatchDslError[],
  warnings: PatchDslWarning[]
): { id: InternalBlockId; def: InternalBlockDef } | null {
  // Extract type and displayName from labels
  if (hclBlock.labels.length < 2) {
    errors.push(new PatchDslError('Internal block must have type and name labels', hclBlock.pos));
    return null;
  }

  const type = hclBlock.labels[0];
  const displayName = hclBlock.labels[1];

  // Validate block type exists
  const blockDef = getBlockDefinition(type);
  if (!blockDef) {
    warnings.push(new PatchDslWarning(`Unknown internal block type "${type}"`, hclBlock.pos));
  }

  // Use displayName as InternalBlockId (no collision handling needed — they're scoped)
  const blockId = internalBlockId(displayName);

  // Register in blockMap (using both original and identifier forms)
  blockMap.set(displayName, blockId);
  const ident = toIdentifier(displayName);
  if (ident !== displayName) {
    blockMap.set(ident, blockId);
  }

  // Extract params (exclude reserved: outputs, inputs)
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hclBlock.attributes)) {
    params[key] = convertHclValue(value);
  }

  const internalBlockDef: InternalBlockDef = {
    type,
    params: Object.keys(params).length > 0 ? params : undefined,
    displayName,
  };

  return { id: blockId, def: internalBlockDef };
}

/**
 * Process an expose_input block from AST.
 *
 * @param hclBlock - HCL block node
 * @param blockMap - Map from canonical name to InternalBlockId
 * @param errors - Error collection
 * @returns Exposed input port or null if failed
 */
function processExposeInput(
  hclBlock: HclBlock,
  blockMap: Map<string, InternalBlockId>,
  errors: PatchDslError[]
): ExposedInputPort | null {
  // Extract externalId from label
  if (hclBlock.labels.length === 0) {
    errors.push(new PatchDslError('expose_input missing externalId label', hclBlock.pos));
    return null;
  }
  const externalId = hclBlock.labels[0];

  // Extract block and port attributes
  const blockAttr = hclBlock.attributes.block;
  const portAttr = hclBlock.attributes.port;
  const labelAttr = hclBlock.attributes.label;

  if (!blockAttr) {
    errors.push(new PatchDslError(`expose_input "${externalId}" missing "block" attribute`, hclBlock.pos));
    return null;
  }
  if (!portAttr) {
    errors.push(new PatchDslError(`expose_input "${externalId}" missing "port" attribute`, hclBlock.pos));
    return null;
  }

  const internalBlockIdStr = convertHclValue(blockAttr) as string;
  const internalPortId = convertHclValue(portAttr) as string;
  const externalLabel = labelAttr ? convertHclValue(labelAttr) as string : undefined;

  // Resolve internal block ID
  const resolvedBlockId = blockMap.get(internalBlockIdStr);
  if (!resolvedBlockId) {
    errors.push(new PatchDslError(
      `expose_input "${externalId}" references unknown block "${internalBlockIdStr}"`,
      hclBlock.pos
    ));
    return null;
  }

  return {
    externalId,
    externalLabel,
    internalBlockId: resolvedBlockId,
    internalPortId,
  };
}

/**
 * Process an expose_output block from AST.
 *
 * @param hclBlock - HCL block node
 * @param blockMap - Map from canonical name to InternalBlockId
 * @param errors - Error collection
 * @returns Exposed output port or null if failed
 */
function processExposeOutput(
  hclBlock: HclBlock,
  blockMap: Map<string, InternalBlockId>,
  errors: PatchDslError[]
): ExposedOutputPort | null {
  // Extract externalId from label
  if (hclBlock.labels.length === 0) {
    errors.push(new PatchDslError('expose_output missing externalId label', hclBlock.pos));
    return null;
  }
  const externalId = hclBlock.labels[0];

  // Extract block and port attributes
  const blockAttr = hclBlock.attributes.block;
  const portAttr = hclBlock.attributes.port;
  const labelAttr = hclBlock.attributes.label;

  if (!blockAttr) {
    errors.push(new PatchDslError(`expose_output "${externalId}" missing "block" attribute`, hclBlock.pos));
    return null;
  }
  if (!portAttr) {
    errors.push(new PatchDslError(`expose_output "${externalId}" missing "port" attribute`, hclBlock.pos));
    return null;
  }

  const internalBlockIdStr = convertHclValue(blockAttr) as string;
  const internalPortId = convertHclValue(portAttr) as string;
  const externalLabel = labelAttr ? convertHclValue(labelAttr) as string : undefined;

  // Resolve internal block ID
  const resolvedBlockId = blockMap.get(internalBlockIdStr);
  if (!resolvedBlockId) {
    errors.push(new PatchDslError(
      `expose_output "${externalId}" references unknown block "${internalBlockIdStr}"`,
      hclBlock.pos
    ));
    return null;
  }

  return {
    externalId,
    externalLabel,
    internalBlockId: resolvedBlockId,
    internalPortId,
  };
}

/**
 * Resolve an internal reference value (blockName.portName) to block/port IDs.
 *
 * @param value - HCL value (should be reference)
 * @param blockMap - Map from canonical name to InternalBlockId
 * @returns Resolved block/port IDs or null if unresolvable
 */
function resolveInternalReference(
  value: HclValue,
  blockMap: Map<string, InternalBlockId>
): { blockId: InternalBlockId; portId: string } | null {
  if (value.kind !== 'reference') return null;
  if (value.parts.length !== 2) return null;

  const [blockName, portName] = value.parts;
  const blockId = blockMap.get(blockName);

  if (!blockId) return null;

  return { blockId, portId: portName };
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
