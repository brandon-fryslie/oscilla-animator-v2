/**
 * OscillaNode - Rete Node representing an Oscilla Block
 *
 * Each node maps to a block in PatchStore with proper input/output ports.
 */

import { ClassicPreset } from 'rete';
import { getSocketForSignalType } from './sockets';
import type { Block, BlockId } from '../../types';
import type { BlockDef } from '../../blocks/registry';

/**
 * OscillaNode - Rete node that represents an Oscilla block
 */
export class OscillaNode extends ClassicPreset.Node {
  public readonly blockId: BlockId;
  public readonly blockType: string;

  constructor(blockDef: BlockDef, blockId: BlockId, displayName?: string | null) {
    super(displayName || blockDef.label);
    this.blockId = blockId;
    this.blockType = blockDef.type;

    // Add inputs from BlockDef
    for (const input of blockDef.inputs) {
      const socket = getSocketForSignalType(input.type);
      const control = input.optional ? undefined : undefined; // No controls for now
      this.addInput(
        input.id,
        new ClassicPreset.Input(
          socket,
          input.label,
          !input.optional // multipleConnections = false for required inputs
        )
      );
    }

    // Add outputs from BlockDef
    for (const output of blockDef.outputs) {
      const socket = getSocketForSignalType(output.type);
      this.addOutput(output.id, new ClassicPreset.Output(socket, output.label));
    }
  }
}

/**
 * Factory: Create node from existing Block
 */
export function createNodeFromBlock(
  block: Block,
  blockDef: BlockDef
): OscillaNode {
  return new OscillaNode(blockDef, block.id, block.displayName);
}

/**
 * Factory: Create node from BlockDef (for new blocks)
 */
export function createNodeFromBlockDef(
  blockDef: BlockDef,
  blockId: BlockId
): OscillaNode {
  return new OscillaNode(blockDef, blockId);
}
