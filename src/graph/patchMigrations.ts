/**
 * Patch Migration System
 *
 * Handles backwards compatibility when blocks are removed, renamed, or have their
 * ports changed. This is the SINGLE SOURCE OF TRUTH for all block/port migrations.
 *
 * Each migration entry documents:
 * - What changed and why (rationale)
 * - How to map old patches to new block definitions
 * - When it was removed (for deprecation tracking)
 */

import type { Patch, Block, Edge, BlockId, PortId } from '../types';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Migration metadata for a removed or changed block.
 */
export interface BlockMigration {
  readonly removedInVersion: string;
  readonly replacements?: Record<string, string>; // oldBlockType → newBlockType
  readonly portMappings?: Record<string, string>; // oldPort → newPort for the new block type
  readonly removedPorts?: string[]; // ports that no longer exist
  readonly rationale: string; // explain why the change was made
}

/**
 * Registry of all block migrations.
 * When a block is removed or renamed, add an entry here.
 * This ensures patches created before the change can be migrated forward.
 */
const BLOCK_MIGRATIONS: Record<string, BlockMigration> = {
  /**
   * Field operation blocks that were genericized to cardinality-generic versions.
   * Commit: 4243c1d (2026-01-25)
   *
   * These blocks are now handled by their signal counterparts:
   * - FieldAdd is now Add (cardinalityMode: preserve)
   * - FieldMultiply is now Multiply (cardinalityMode: preserve)
   * - FieldScale is now Multiply (FieldScale was just an alias for Multiply with fixed factor)
   *
   * The signal blocks now work with both Signal and Field inputs via dual paths:
   * - Signal input → use OpCode path
   * - Field input → use kernel path
   */
  'FieldAdd': {
    removedInVersion: '2.5.0',
    replacements: { 'FieldAdd': 'Add' },
    rationale: 'Genericized to cardinality-generic Add block (works with both signals and fields)',
  },

  'FieldMultiply': {
    removedInVersion: '2.5.0',
    replacements: { 'FieldMultiply': 'Multiply' },
    rationale: 'Genericized to cardinality-generic Multiply block (works with both signals and fields)',
  },

  'FieldScale': {
    removedInVersion: '2.5.0',
    replacements: { 'FieldScale': 'Multiply' },
    rationale: 'Removed - FieldScale was equivalent to Multiply with a fixed scale factor',
  },
};

/**
 * Migration record for diagnostics/UI feedback.
 */
export interface Migration {
  readonly kind: 'blockReplaced' | 'blockRemoved' | 'edgeRemoved' | 'portMapped';
  readonly blockId?: BlockId;
  readonly fromType?: string;
  readonly toType?: string;
  readonly portId?: PortId;
  readonly fromPort?: string;
  readonly toPort?: string;
  readonly reason: string;
}

/**
 * Validate that a block type exists in the registry.
 */
function blockTypeExists(blockType: string): boolean {
  try {
    getBlockDefinition(blockType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that a block has a port of the given name and direction.
 */
function blockHasPort(blockType: string, slotId: PortId, direction: 'input' | 'output'): boolean {
  try {
    const def = getBlockDefinition(blockType);
    if (!def) return false;
    if (direction === 'input') {
      return slotId in def.inputs;
    } else {
      return slotId in def.outputs;
    }
  } catch {
    return false;
  }
}

/**
 * Migrate a single block if it has a registered migration.
 *
 * Returns:
 * - The migrated block (if migration applied)
 * - The original block (if no migration needed)
 * - null (if block should be removed entirely)
 */
function migrateBlock(block: Block): { block: Block; migrations: Migration[] } | { removed: true; migrations: Migration[] } {
  const migrations: Migration[] = [];
  let currentBlock = block;
  const originalType = block.type;

  // Check if this block type has a migration
  const migration = BLOCK_MIGRATIONS[originalType];
  if (!migration) {
    // No migration - block still exists
    return { block: currentBlock, migrations };
  }

  // Check if there's a replacement
  if (migration.replacements && migration.replacements[originalType]) {
    const newBlockType = migration.replacements[originalType];
    if (blockTypeExists(newBlockType)) {
      migrations.push({
        kind: 'blockReplaced',
        blockId: block.id,
        fromType: originalType,
        toType: newBlockType,
        reason: migration.rationale,
      });
      currentBlock = { ...currentBlock, type: newBlockType };
    } else {
      // Replacement block doesn't exist - remove the block
      migrations.push({
        kind: 'blockRemoved',
        blockId: block.id,
        fromType: originalType,
        reason: `Block '${originalType}' was removed and replacement '${newBlockType}' does not exist`,
      });
      return { removed: true, migrations };
    }
  } else {
    // No replacement available - block should be removed
    migrations.push({
      kind: 'blockRemoved',
      blockId: block.id,
      fromType: originalType,
      reason: migration.rationale,
    });
    return { removed: true, migrations };
  }

  return { block: currentBlock, migrations };
}

/**
 * Migrate a patch to handle removed/renamed blocks and their ports.
 *
 * This function:
 * 1. Iterates through all blocks
 * 2. Replaces/removes blocks that have migrations
 * 3. Removes edges to non-existent blocks
 * 4. Validates remaining edges point to valid ports
 *
 * Returns the migrated patch and a list of all migrations performed.
 */
export function migratePatch(patch: Patch): {
  patch: Patch;
  migrations: Migration[];
} {
  const migrations: Migration[] = [];
  const removedBlockIds = new Set<BlockId>();
  const migratedBlocks = new Map<BlockId, Block>();

  // Phase 1: Migrate or remove blocks
  for (const [blockId, block] of patch.blocks) {
    const result = migrateBlock(block);
    if ('removed' in result) {
      removedBlockIds.add(blockId);
      migrations.push(...result.migrations);
    } else {
      migrations.push(...result.migrations);
      migratedBlocks.set(blockId, result.block);
    }
  }

  // Phase 2: Remove edges to deleted blocks
  const validEdges = patch.edges.filter(edge => {
    const fromBlockRemoved = removedBlockIds.has(edge.from.blockId as BlockId);
    const toBlockRemoved = removedBlockIds.has(edge.to.blockId as BlockId);

    if (fromBlockRemoved || toBlockRemoved) {
      migrations.push({
        kind: 'edgeRemoved',
        reason: `Edge removed because block '${fromBlockRemoved ? edge.from.blockId : edge.to.blockId}' was removed`,
      });
      return false;
    }

    return true;
  });

  // Phase 3: Validate all remaining edges point to valid ports
  const fullyValidEdges = validEdges.filter(edge => {
    const fromBlock = migratedBlocks.get(edge.from.blockId as BlockId);
    const toBlock = migratedBlocks.get(edge.to.blockId as BlockId);

    if (!fromBlock || !toBlock) {
      // This shouldn't happen due to Phase 2, but be defensive
      migrations.push({
        kind: 'edgeRemoved',
        reason: 'Edge removed because block does not exist',
      });
      return false;
    }

    // Check that the ports still exist
    const hasFromPort = blockHasPort(fromBlock.type, edge.from.slotId as PortId, 'output');
    const hasToPort = blockHasPort(toBlock.type, edge.to.slotId as PortId, 'input');

    if (!hasFromPort) {
      migrations.push({
        kind: 'edgeRemoved',
        reason: `Edge removed because output port '${edge.from.slotId}' does not exist on block '${fromBlock.type}'`,
      });
      return false;
    }

    if (!hasToPort) {
      migrations.push({
        kind: 'edgeRemoved',
        reason: `Edge removed because input port '${edge.to.slotId}' does not exist on block '${toBlock.type}'`,
      });
      return false;
    }

    return true;
  });

  return {
    patch: {
      blocks: migratedBlocks,
      edges: fullyValidEdges,
    },
    migrations,
  };
}
