/**
 * Pass 0: Payload-Generic Type Resolution
 *
 * Resolves PAYLOAD types (not units) for payload-generic blocks by propagating concrete types bidirectionally.
 *
 * Type inference works in two directions:
 * 1. Forward (output -> target input): For blocks like Const, infer type from what it connects to
 * 2. Backward (source output -> input): For blocks like FieldBroadcast, infer type from source
 *
 * The resolved payload type is stored in the block's params as `payloadType`.
 *
 * IMPORTANT: This pass does NOT resolve units. Unit resolution is handled by
 * pass1-type-constraints.ts in the compiler, which uses constraint solving
 * with per-block-instance unit variables.
 */

import type { BlockId } from '../../types';
import type { Block, Patch } from '../Patch';
import { getBlockDefinition, isPayloadGeneric } from '../../blocks/registry';

/**
 * Resolve payload types for payload-generic blocks by propagating concrete types.
 *
 * @param patch - Raw patch
 * @returns Patch with resolved payloadType in block params
 */
export function pass0PayloadResolution(patch: Patch): Patch {
  const updatedBlocks = new Map(patch.blocks);

  for (const [blockId, block] of patch.blocks) {
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
    for (const [outputId] of Object.entries(blockDef.outputs)) {
      const outgoingEdge = patch.edges.find(
        e => e.enabled !== false &&
          e.from.blockId === blockId &&
          e.from.slotId === outputId
      );

      if (!outgoingEdge) continue;

      const targetBlock = patch.blocks.get(outgoingEdge.to.blockId as BlockId);
      if (!targetBlock) continue;

      const targetDef = getBlockDefinition(targetBlock.type);
      if (!targetDef) continue;

      const targetInput = targetDef.inputs[outgoingEdge.to.slotId];
      if (!targetInput || !targetInput.type) continue;

      inferredPayloadType = targetInput.type.payload;
      // Unit resolution is handled by pass1-type-constraints, not here
      break;
    }

    // Strategy 2: Backward resolution - infer input type from source
    if (!inferredPayloadType) {
      for (const [inputId, input] of Object.entries(blockDef.inputs)) {
        // CRITICAL FIX: Skip config-only inputs (exposedAsPort: false)
        // These are NOT ports and cannot have incoming edges for type inference
        if (input.exposedAsPort === false) continue;

        const incomingEdge = patch.edges.find(
          e => e.enabled !== false &&
            e.to.blockId === blockId &&
            e.to.slotId === inputId
        );

        if (!incomingEdge) continue;

        const sourceBlock = patch.blocks.get(incomingEdge.from.blockId as BlockId);
        if (!sourceBlock) continue;

        const sourceDef = getBlockDefinition(sourceBlock.type);
        if (!sourceDef) continue;

        const sourceOutput = sourceDef.outputs[incomingEdge.from.slotId];
        if (!sourceOutput) continue;

        // If source is also payload-generic, check if it was already resolved
        if (isPayloadGeneric(sourceBlock.type)) {
          const resolvedPayload = sourceBlock.params.payloadType ||
            updatedBlocks.get(sourceBlock.id)?.params.payloadType;
          if (resolvedPayload) {
            inferredPayloadType = resolvedPayload as string;
            break;
          }
          continue;
        }

        inferredPayloadType = sourceOutput.type.payload;
        // Unit resolution is handled by pass1-type-constraints, not here
        break;
      }
    }

    // Update block params with inferred payload type only
    // Unit resolution is handled by pass1-type-constraints in the compiler
    if (inferredPayloadType) {
      const updatedBlock: Block = {
        ...block,
        params: {
          ...block.params,
          payloadType: inferredPayloadType,
        },
      };
      updatedBlocks.set(blockId, updatedBlock);
    }
  }

  return {
    blocks: updatedBlocks,
    edges: patch.edges,
  };
}
