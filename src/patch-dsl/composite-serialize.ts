/**
 * CompositeBlockDef → HCL Serializer
 *
 * Converts a CompositeBlockDef to HCL text with composite "Type" {} header.
 *
 * Key features:
 * - Deterministic output (sorted blocks, edges, exposed ports, params)
 * - Composite-specific metadata (label, category, description, capability)
 * - Internal blocks with params
 * - Internal edges as inline outputs {} syntax (same as patches)
 * - Exposed ports as expose_input/expose_output blocks
 * - Pretty-printed with 2-space indentation
 */

import type {
  CompositeBlockDef,
  InternalBlockId,
  InternalBlockDef,
  InternalEdge,
  ExposedInputPort,
  ExposedOutputPort,
} from '../blocks/composite-types';
import { emitKey, emitValue } from './hcl-emit-utils';
import { toIdentifier } from './serialize';

/**
 * Serialize a CompositeBlockDef to HCL text.
 *
 * @param def - The composite block definition to serialize
 * @returns HCL text representation
 */
export function serializeCompositeToHCL(def: CompositeBlockDef): string {
  let output = `composite "${def.type}" {\n`;

  // Emit metadata
  output += `  label = ${emitValue(def.label)}\n`;
  output += `  category = ${emitValue(def.category)}\n`;
  if (def.description) {
    output += `  description = ${emitValue(def.description)}\n`;
  }
  output += `  capability = ${emitValue(def.capability)}\n`;
  output += '\n';

  // Build edge map: fromBlockId → InternalEdge[]
  const edgesBySource = new Map<string, InternalEdge[]>();
  for (const edge of def.internalEdges) {
    const key = edge.fromBlock as string;
    if (!edgesBySource.has(key)) edgesBySource.set(key, []);
    edgesBySource.get(key)!.push(edge);
  }

  // Emit internal blocks (sorted by ID for determinism)
  const sortedBlocks = Array.from(def.internalBlocks.entries())
    .sort(([a], [b]) => (a as string).localeCompare(b as string));

  for (const [blockId, blockDef] of sortedBlocks) {
    const blockEdges = edgesBySource.get(blockId as string) ?? [];
    output += emitInternalBlock(blockId, blockDef, blockEdges, 1);
  }

  // Emit expose_input blocks (sorted by externalId)
  const sortedInputs = [...def.exposedInputs].sort((a, b) => a.externalId.localeCompare(b.externalId));
  for (const exposedInput of sortedInputs) {
    output += emitExposeInput(exposedInput, 1);
  }

  // Emit expose_output blocks (sorted by externalId)
  const sortedOutputs = [...def.exposedOutputs].sort((a, b) => a.externalId.localeCompare(b.externalId));
  for (const exposedOutput of sortedOutputs) {
    output += emitExposeOutput(exposedOutput, 1);
  }

  output += '}\n';
  return output;
}

/**
 * Emit an internal block definition.
 *
 * @param blockId - Internal block ID
 * @param blockDef - Internal block definition
 * @param edges - Internal edges sourced from this block
 * @param indent - Indentation level
 * @returns HCL text for this block
 */
function emitInternalBlock(
  blockId: InternalBlockId,
  blockDef: InternalBlockDef,
  edges: InternalEdge[],
  indent: number
): string {
  const ind = '  '.repeat(indent);

  // Use displayName as the HCL block label (fallback to blockId)
  const blockName = blockDef.displayName ?? (blockId as string);

  let output = `${ind}block "${blockDef.type}" "${blockName}" {\n`;

  // Emit params (sorted by key)
  if (blockDef.params) {
    const paramKeys = Object.keys(blockDef.params).sort();
    for (const key of paramKeys) {
      output += `${ind}  ${emitKey(key)} = ${emitValue(blockDef.params[key])}\n`;
    }
  }

  // Emit inline edges as outputs {}
  if (edges.length > 0) {
    output += emitInternalOutputs(edges, indent + 1);
  }

  output += `${ind}}\n\n`;
  return output;
}

/**
 * Emit inline internal edges as an outputs {} block.
 *
 * Groups edges by source port. Single-target ports use direct reference,
 * multi-target ports use list syntax [ref1, ref2].
 *
 * @param edges - Internal edges sourced from this block
 * @param indent - Indentation level
 * @returns HCL text for outputs block
 */
function emitInternalOutputs(edges: InternalEdge[], indent: number): string {
  const ind = '  '.repeat(indent);

  // Group edges by source port
  const byPort = new Map<string, InternalEdge[]>();
  for (const edge of edges) {
    const port = edge.fromPort;
    if (!byPort.has(port)) byPort.set(port, []);
    byPort.get(port)!.push(edge);
  }

  let output = `${ind}outputs {\n`;

  // Sort ports alphabetically for determinism
  const sortedPorts = Array.from(byPort.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [port, portEdges] of sortedPorts) {
    if (portEdges.length === 1) {
      const edge = portEdges[0];
      const toIdent = toIdentifier(edge.toBlock as string);
      output += `${ind}  ${port} = ${toIdent}.${edge.toPort}\n`;
    } else {
      const refs = portEdges.map(edge => {
        const toIdent = toIdentifier(edge.toBlock as string);
        return `${toIdent}.${edge.toPort}`;
      });
      output += `${ind}  ${port} = [${refs.join(', ')}]\n`;
    }
  }

  output += `${ind}}\n`;
  return output;
}

/**
 * Emit an expose_input block.
 *
 * @param exposedInput - Exposed input port definition
 * @param indent - Indentation level
 * @returns HCL text for expose_input block
 */
function emitExposeInput(exposedInput: ExposedInputPort, indent: number): string {
  const ind = '  '.repeat(indent);

  let output = `${ind}expose_input "${exposedInput.externalId}" {\n`;
  output += `${ind}  block = ${emitValue(exposedInput.internalBlockId as string)}\n`;
  output += `${ind}  port = ${emitValue(exposedInput.internalPortId)}\n`;

  if (exposedInput.externalLabel) {
    output += `${ind}  label = ${emitValue(exposedInput.externalLabel)}\n`;
  }

  output += `${ind}}\n\n`;
  return output;
}

/**
 * Emit an expose_output block.
 *
 * @param exposedOutput - Exposed output port definition
 * @param indent - Indentation level
 * @returns HCL text for expose_output block
 */
function emitExposeOutput(exposedOutput: ExposedOutputPort, indent: number): string {
  const ind = '  '.repeat(indent);

  let output = `${ind}expose_output "${exposedOutput.externalId}" {\n`;
  output += `${ind}  block = ${emitValue(exposedOutput.internalBlockId as string)}\n`;
  output += `${ind}  port = ${emitValue(exposedOutput.internalPortId)}\n`;

  if (exposedOutput.externalLabel) {
    output += `${ind}  label = ${emitValue(exposedOutput.externalLabel)}\n`;
  }

  output += `${ind}}\n\n`;
  return output;
}
