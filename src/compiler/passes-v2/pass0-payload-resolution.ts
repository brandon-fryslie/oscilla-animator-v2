/**
 * Pass 0: Payload Type Resolution
 *
 * Resolves PAYLOAD types (float, int, bool, vec2, color, etc.) for payload-generic
 * blocks by propagating concrete types from edges.
 *
 * This pass runs AFTER graph normalization (so all derived blocks exist) and
 * BEFORE unit constraint solving (pass1-type-constraints).
 *
 * Type inference works in two directions:
 * 1. Forward (output -> target input): For blocks like Const, infer type from what it connects to
 * 2. Backward (source output -> input): For blocks like Broadcast, infer type from source
 *
 * The resolved payload type is stored in the block's params as `payloadType`.
 *
 * IMPORTANT: This pass does NOT resolve units. Unit resolution is handled by
 * pass1-type-constraints.ts which uses constraint solving with per-block-instance
 * unit variables.
 */

import type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../ir/patches';
import type { Block } from '../../graph/Patch';
import { getBlockDefinition, isPayloadGeneric } from '../../blocks/registry';

/**
 * Resolve payload types for payload-generic blocks.
 *
 * @param normalized - Normalized patch (all derived blocks exist)
 * @returns NormalizedPatch with payloadType resolved in block params
 */
export function pass0PayloadResolution(normalized: NormalizedPatch): NormalizedPatch {
  // Create mutable copy of blocks array
  const updatedBlocks = [...normalized.blocks];
  let changed = false;

  for (let i = 0; i < normalized.blocks.length; i++) {
    const blockIndex = i as BlockIndex;
    const block = normalized.blocks[i];
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Already resolved?
    if (block.params.payloadType !== undefined) continue;

    // Only process payload-generic blocks
    if (!blockDef.payload) continue;
    // Check if actually payload-generic (has multiple allowed types on any port)
    const isGeneric = Object.values(blockDef.payload.allowedPayloads).some(a => a.length > 1);
    if (!isGeneric) continue;

    let inferredPayloadType: string | undefined;

    // Strategy 1: Forward resolution - infer output type from what it connects to
    // Only consider GENERIC outputs (those listed in allowedPayloads with multiple types)
    for (const [outputId] of Object.entries(blockDef.outputs)) {
      // Skip non-generic outputs - they have fixed types and shouldn't drive inference
      const allowedPayloads = blockDef.payload?.allowedPayloads[outputId];
      if (!allowedPayloads || allowedPayloads.length <= 1) continue;

      const outgoingEdge = normalized.edges.find(
        e => e.fromBlock === blockIndex && e.fromPort === outputId
      );

      if (!outgoingEdge) continue;

      const targetBlock = normalized.blocks[outgoingEdge.toBlock];
      if (!targetBlock) continue;

      const targetDef = getBlockDefinition(targetBlock.type);
      if (!targetDef) continue;

      const targetInput = targetDef.inputs[outgoingEdge.toPort];
      if (!targetInput || !targetInput.type) continue;

      // Use the target's definition type payload
      inferredPayloadType = targetInput.type.payload;
      break;
    }

    // Strategy 2: Backward resolution - infer input type from source
    // Only consider GENERIC inputs (those listed in allowedPayloads with multiple types)
    if (!inferredPayloadType) {
      for (const [inputId, input] of Object.entries(blockDef.inputs)) {
        // Skip config-only inputs (exposedAsPort: false)
        // These are NOT ports and cannot have incoming edges for type inference
        if (input.exposedAsPort === false) continue;

        // Skip non-generic inputs - they have fixed types and shouldn't drive inference
        const allowedPayloads = blockDef.payload?.allowedPayloads[inputId];
        if (!allowedPayloads || allowedPayloads.length <= 1) continue;

        const incomingEdge = normalized.edges.find(
          e => e.toBlock === blockIndex && e.toPort === inputId
        );

        if (!incomingEdge) continue;

        const sourceBlock = normalized.blocks[incomingEdge.fromBlock];
        if (!sourceBlock) continue;

        const sourceDef = getBlockDefinition(sourceBlock.type);
        if (!sourceDef) continue;

        const sourceOutput = sourceDef.outputs[incomingEdge.fromPort];
        if (!sourceOutput) continue;

        // If source output is also generic, check if it was already resolved
        const sourceAllowed = sourceDef.payload?.allowedPayloads[incomingEdge.fromPort];
        if (sourceAllowed && sourceAllowed.length > 1) {
          // Source is generic - check if already resolved
          const resolvedPayload = sourceBlock.params.payloadType ||
            updatedBlocks[incomingEdge.fromBlock]?.params.payloadType;
          if (resolvedPayload) {
            inferredPayloadType = resolvedPayload as string;
            break;
          }
          continue; // Can't infer from unresolved generic
        }

        // Source is non-generic - use its concrete type
        inferredPayloadType = sourceOutput.type.payload;
        break;
      }
    }

    // Update block params with inferred payload type
    if (inferredPayloadType) {
      const updatedBlock: Block = {
        ...block,
        params: {
          ...block.params,
          payloadType: inferredPayloadType,
        },
      };
      updatedBlocks[i] = updatedBlock;
      changed = true;
    }
  }

  if (!changed) {
    return normalized;
  }

  return {
    ...normalized,
    blocks: updatedBlocks,
  };
}
