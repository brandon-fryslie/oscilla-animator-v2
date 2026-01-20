/**
 * Pass 0: Polymorphic Type Resolution
 *
 * Resolves '???' (polymorphic) types by propagating concrete types bidirectionally.
 *
 * Type inference works in two directions:
 * 1. Forward (output -> target input): For blocks like Const, infer type from what it connects to
 * 2. Backward (source output -> input): For blocks like FieldBroadcast, infer type from source
 *
 * The resolved type is stored in the block's params as `payloadType`.
 */

import type { BlockId } from '../../types';
import type { Block, Patch } from '../Patch';
import { getBlockDefinition } from '../../blocks/registry';

/**
 * Resolve '???' (polymorphic) types by propagating concrete types.
 *
 * @param patch - Raw patch
 * @returns Patch with resolved payloadType in block params
 */
export function pass0PolymorphicTypes(patch: Patch): Patch {
  const updatedBlocks = new Map(patch.blocks);

  for (const [blockId, block] of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    // Already resolved?
    if (block.params.payloadType !== undefined) continue;

    let inferredPayloadType: string | undefined;

    // Strategy 1: Forward resolution - polymorphic OUTPUT infers from target input
    for (const [outputId, output] of Object.entries(blockDef.outputs)) {
      if (output.type.payload !== '???') continue;

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
      if (!targetInput || targetInput.type?.payload === '???') continue;

      inferredPayloadType = targetInput.type.payload;
      break;
    }

    // Strategy 2: Backward resolution - polymorphic INPUT infers from source output
    if (!inferredPayloadType) {
      for (const [inputId, input] of Object.entries(blockDef.inputs)) {
        if (input.type?.payload !== '???') continue;

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

        // If source output is also polymorphic, check if it was already resolved
        if (sourceOutput.type.payload === '???') {
          const resolvedPayload = sourceBlock.params.payloadType ||
                                  updatedBlocks.get(sourceBlock.id)?.params.payloadType;
          if (resolvedPayload && resolvedPayload !== '???') {
            inferredPayloadType = resolvedPayload as string;
            break;
          }
          continue;
        }

        inferredPayloadType = sourceOutput.type.payload;
        break;
      }
    }

    // Update block params with inferred type
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
