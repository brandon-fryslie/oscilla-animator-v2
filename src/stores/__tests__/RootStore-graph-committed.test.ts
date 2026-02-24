import { beforeEach, describe, expect, it } from 'vitest';
import { RootStore } from '../RootStore';
import { registerAllBlocks } from '../../blocks/all';

registerAllBlocks();

describe('RootStore GraphCommitted diff summary', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  it('emits block/edge diffSummary and affectedBlockIds for graph edits', () => {
    const committed: Array<{
      diffSummary: { blocksAdded: number; blocksRemoved: number; edgesChanged: number };
      affectedBlockIds?: readonly string[];
    }> = [];

    root.events.on('GraphCommitted', (event) => {
      committed.push({
        diffSummary: event.diffSummary,
        affectedBlockIds: event.affectedBlockIds,
      });
    });

    const a = root.patch.addBlock('Add', {});
    const b = root.patch.addBlock('Add', {});
    const edgeId = root.patch.addEdge(
      { kind: 'port', blockId: a, slotId: 'out' },
      { kind: 'port', blockId: b, slotId: 'a' },
    );
    root.patch.removeEdge(edgeId);
    root.patch.removeBlock(b);

    expect(committed).toHaveLength(5);

    expect(committed[0].diffSummary).toEqual({
      blocksAdded: 1,
      blocksRemoved: 0,
      edgesChanged: 0,
    });
    expect(committed[0].affectedBlockIds).toContain(a);

    expect(committed[1].diffSummary).toEqual({
      blocksAdded: 1,
      blocksRemoved: 0,
      edgesChanged: 0,
    });
    expect(committed[1].affectedBlockIds).toContain(b);

    expect(committed[2].diffSummary).toEqual({
      blocksAdded: 0,
      blocksRemoved: 0,
      edgesChanged: 1,
    });
    expect(committed[2].affectedBlockIds).toEqual(expect.arrayContaining([a, b]));

    expect(committed[3].diffSummary).toEqual({
      blocksAdded: 0,
      blocksRemoved: 0,
      edgesChanged: 1,
    });
    expect(committed[3].affectedBlockIds).toEqual(expect.arrayContaining([a, b]));

    expect(committed[4].diffSummary.blocksRemoved).toBe(1);
    expect(committed[4].affectedBlockIds).toContain(b);
  });
});
