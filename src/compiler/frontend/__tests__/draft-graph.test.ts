/**
 * Tests for DraftGraph and buildDraftGraph.
 */
import { describe, it, expect } from 'vitest';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';

describe('buildDraftGraph', () => {
  it('produces deterministic obligation IDs for unconnected inputs', () => {
    const patch = buildPatch((b) => {
      const add = b.addBlock('Add');
      // Add block has inputs 'a' and 'b' — both unconnected
    });

    const g1 = buildDraftGraph(patch);
    const g2 = buildDraftGraph(patch);

    // Same input → same obligation IDs
    const ids1 = g1.obligations.map((o) => o.id).sort();
    const ids2 = g2.obligations.map((o) => o.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('creates obligations for unconnected inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);

    // Add has inputs 'a' and 'b'
    const missingInputObls = g.obligations.filter((o) => o.kind === 'missingInputSource');
    expect(missingInputObls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not create obligations for connected inputs', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
      // 'b' is still unconnected
    });

    const g = buildDraftGraph(patch);
    const missingInputObls = g.obligations.filter((o) => o.kind === 'missingInputSource');

    // Should have obligation for 'b' but not for 'a'
    const oblForA = missingInputObls.find((o) => o.anchor.port?.port === 'a');
    const oblForB = missingInputObls.find((o) => o.anchor.port?.port === 'b');
    expect(oblForA).toBeUndefined();
    expect(oblForB).toBeDefined();
  });

  it('blocks and edges are sorted by id', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
      b.addBlock('Add');
      b.addBlock('Multiply');
    });

    const g = buildDraftGraph(patch);

    // Blocks should be sorted
    for (let i = 1; i < g.blocks.length; i++) {
      expect(g.blocks[i].id.localeCompare(g.blocks[i - 1].id)).toBeGreaterThanOrEqual(0);
    }

    // Obligations should be sorted
    for (let i = 1; i < g.obligations.length; i++) {
      expect(g.obligations[i].id.localeCompare(g.obligations[i - 1].id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('tracks block origin as user', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });

    const g = buildDraftGraph(patch);

    expect(g.blocks.length).toBe(1);
    expect(g.blocks[0].origin).toBe('user');
  });

  it('converts edges with correct port refs', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const g = buildDraftGraph(patch);

    expect(g.edges.length).toBe(1);
    expect(g.edges[0].from.dir).toBe('out');
    expect(g.edges[0].to.dir).toBe('in');
    expect(g.edges[0].role).toBe('userWire');
  });

  it('starts with revision 0', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });

    const g = buildDraftGraph(patch);
    expect(g.meta.revision).toBe(0);
  });

  it('empty patch produces empty graph with no obligations', () => {
    const patch = buildPatch(() => {
      // empty
    });

    const g = buildDraftGraph(patch);
    expect(g.blocks).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.obligations).toEqual([]);
  });

  it('obligation deps reference the correct port', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);

    for (const obl of g.obligations) {
      expect(obl.deps.length).toBe(1);
      expect(obl.deps[0].kind).toBe('portCanonicalizable');
      // Port should match obligation anchor
      expect(obl.deps[0].port).toEqual(obl.anchor.port);
    }
  });
});
