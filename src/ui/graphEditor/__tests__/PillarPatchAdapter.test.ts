import { describe, expect, it } from 'vitest';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import { PillarPatchAdapter } from '../PillarPatchAdapter';

/**
 * Behavioural coverage for the pillar provider of the neutral GraphDataAdapter.
 * A fuller cross-era conformance suite lands with oscilla-editor-ux-8lsn.15;
 * this locks the pillar projection + mutation surface the spike relies on.
 */
describe('PillarPatchAdapter', () => {
  it('projects every pillar block into a self-describing neutral BlockLike', () => {
    const store = new PillarPatchStore();
    const adapter = new PillarPatchAdapter(store);

    expect(adapter.blocks.size).toBe(store.patch.blocks.length);

    for (const block of store.patch.blocks) {
      const like = adapter.blocks.get(block.id)!;
      expect(like).toBeDefined();
      expect(like.typeLabel.length).toBeGreaterThan(0);
      // Every port carries its own label + type display (self-describing).
      for (const port of [...like.inputPorts.values(), ...like.outputPorts.values()]) {
        expect(port.label.length).toBeGreaterThan(0);
        expect(port.typeDisplay?.color).toMatch(/^#/);
        expect(port.typeDisplay?.compatibilityToken.length).toBeGreaterThan(0);
      }
    }
  });

  it('projects pillar edges, anchoring the source to its sole output port', () => {
    const store = new PillarPatchStore();
    const adapter = new PillarPatchAdapter(store);

    expect(adapter.edges.length).toBe(store.patch.edges.length);

    for (const edge of store.patch.edges) {
      const projected = adapter.edges.find((e) => e.id === edge.id)!;
      expect(projected.sourceBlockId).toBe(edge.source);
      expect(projected.targetBlockId).toBe(edge.target);
      // Target port is the authored input slot; source port is a real output handle.
      expect(projected.targetPortId).toBe(edge.inputSlot);
      const sourceLike = adapter.blocks.get(edge.source)!;
      expect(sourceLike.outputPorts.has(projected.sourcePortId)).toBe(true);
    }
  });

  it('adds/removes blocks and tracks editor positions (which the store does not hold)', () => {
    const store = new PillarPatchStore();
    const adapter = new PillarPatchAdapter(store);
    const before = adapter.blocks.size;

    const id = adapter.addBlock('Constant', { x: 5, y: 6 });
    expect(adapter.blocks.size).toBe(before + 1);
    expect(adapter.getBlockPosition(id)).toEqual({ x: 5, y: 6 });

    const added = adapter.blocks.get(id)!;
    const output = added.outputPorts.get('value')!;
    expect(output.label).toBe('Value');
    expect(output.typeDisplay?.color).toMatch(/^#/);

    adapter.setBlockPosition(id, { x: 9, y: 9 });
    expect(adapter.getBlockPosition(id)).toEqual({ x: 9, y: 9 });

    adapter.removeBlock(id);
    expect(adapter.blocks.has(id)).toBe(false);
    expect(adapter.getBlockPosition(id)).toBeUndefined();
  });

  it('round-trips an edge through removeEdge + addEdge (delegating to the store)', () => {
    const store = new PillarPatchStore();
    const adapter = new PillarPatchAdapter(store);

    const seedEdge = adapter.edges[0];
    expect(seedEdge).toBeDefined();
    const { sourceBlockId, sourcePortId, targetBlockId, targetPortId } = seedEdge;

    adapter.removeEdge(seedEdge.id);
    expect(adapter.edges.some((e) => e.id === seedEdge.id)).toBe(false);

    const newId = adapter.addEdge(sourceBlockId, sourcePortId, targetBlockId, targetPortId);
    const rewired = adapter.edges.find((e) => e.id === newId)!;
    expect(rewired.sourceBlockId).toBe(sourceBlockId);
    expect(rewired.targetBlockId).toBe(targetBlockId);
    expect(rewired.targetPortId).toBe(targetPortId);
    // The source output handle is re-derived from the registry (the pillar store
    // holds only source block identity); it must resolve back to the same port.
    expect(rewired.sourcePortId).toBe(sourcePortId);
  });
});
