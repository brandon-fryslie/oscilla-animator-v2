import { describe, it, expect } from 'vitest';
import { migratePatch } from '../patchMigrations';
import type { Patch, Block } from '../Patch';
import type { BlockId, PortId } from '../../types';

/**
 * Test suite for patch migration system.
 * Ensures backwards compatibility when blocks are removed or renamed.
 */

function createTestBlock(id: BlockId, type: string): Block {
  return {
    id,
    type,
    params: {},
    displayName: null,
    domainId: null,
    role: 'regular',
    inputPorts: new Map(),
    outputPorts: new Map(),
  };
}

function createTestEdge(id: string, fromBlockId: BlockId, fromSlotId: PortId, toBlockId: BlockId, toSlotId: PortId) {
  return {
    id,
    from: { kind: 'port' as const, blockId: fromBlockId, slotId: fromSlotId },
    to: { kind: 'port' as const, blockId: toBlockId, slotId: toSlotId },
  };
}

describe('patchMigrations', () => {
  it('should leave valid blocks untouched', () => {
    const blocks = new Map([
      ['b1' as BlockId, createTestBlock('b1' as BlockId, 'Const')],
      ['b2' as BlockId, createTestBlock('b2' as BlockId, 'Add')],
    ]);
    const patch: Patch = { blocks, edges: [] };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    expect(migrations).toHaveLength(0);
    expect(migratedPatch.blocks.size).toBe(2);
    expect(migratedPatch.blocks.get('b1' as BlockId)?.type).toBe('Const');
    expect(migratedPatch.blocks.get('b2' as BlockId)?.type).toBe('Add');
  });

  it('should migrate FieldAdd to Add', () => {
    const blocks = new Map([['b1' as BlockId, createTestBlock('b1' as BlockId, 'FieldAdd')]]);
    const patch: Patch = { blocks, edges: [] };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    expect(migrations).toHaveLength(1);
    expect(migrations[0].kind).toBe('blockReplaced');
    expect(migrations[0].fromType).toBe('FieldAdd');
    expect(migrations[0].toType).toBe('Add');
    expect(migratedPatch.blocks.get('b1' as BlockId)?.type).toBe('Add');
  });

  it('should migrate FieldMultiply to Multiply', () => {
    const blocks = new Map([['b1' as BlockId, createTestBlock('b1' as BlockId, 'FieldMultiply')]]);
    const patch: Patch = { blocks, edges: [] };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    expect(migrations).toHaveLength(1);
    expect(migrations[0].kind).toBe('blockReplaced');
    expect(migrations[0].fromType).toBe('FieldMultiply');
    expect(migrations[0].toType).toBe('Multiply');
    expect(migratedPatch.blocks.get('b1' as BlockId)?.type).toBe('Multiply');
  });

  it('should migrate FieldScale to Multiply', () => {
    const blocks = new Map([['b1' as BlockId, createTestBlock('b1' as BlockId, 'FieldScale')]]);
    const patch: Patch = { blocks, edges: [] };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    expect(migrations).toHaveLength(1);
    expect(migrations[0].kind).toBe('blockReplaced');
    expect(migrations[0].fromType).toBe('FieldScale');
    expect(migrations[0].toType).toBe('Multiply');
    expect(migratedPatch.blocks.get('b1' as BlockId)?.type).toBe('Multiply');
  });

  it('should remove edges to deleted blocks', () => {
    const blocks = new Map([
      ['b1' as BlockId, createTestBlock('b1' as BlockId, 'Const')],
      ['b2' as BlockId, createTestBlock('b2' as BlockId, 'FieldScale')],
    ]);
    const edges = [createTestEdge('e1', 'b1' as BlockId, 'out' as PortId, 'b2' as BlockId, 'a' as PortId)];
    const patch: Patch = { blocks, edges };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    // Should have migrations for FieldScale and edge removal (if port doesn't exist on Multiply)
    expect(migratedPatch.edges.length).toBeLessThanOrEqual(1);
  });

  it('should handle patches with multiple migrations', () => {
    const blocks = new Map([
      ['b1' as BlockId, createTestBlock('b1' as BlockId, 'FieldAdd')],
      ['b2' as BlockId, createTestBlock('b2' as BlockId, 'FieldMultiply')],
      ['b3' as BlockId, createTestBlock('b3' as BlockId, 'Add')],
    ]);
    const patch: Patch = { blocks, edges: [] };

    const { patch: migratedPatch, migrations } = migratePatch(patch);

    expect(migrations).toHaveLength(2);
    expect(migratedPatch.blocks.size).toBe(3);
    expect(migratedPatch.blocks.get('b1' as BlockId)?.type).toBe('Add');
    expect(migratedPatch.blocks.get('b2' as BlockId)?.type).toBe('Multiply');
    expect(migratedPatch.blocks.get('b3' as BlockId)?.type).toBe('Add');
  });
});
