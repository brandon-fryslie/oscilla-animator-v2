/**
 * graph-clipboard.test — copy/paste re-mints a multi-block selection with its
 * internal wiring, verified against EVERY real provider.
 *
 * The operations under test are pure over the neutral GraphDataAdapter seam, so
 * the SAME assertion proves the behavior for the V1 patch and the pillar patch
 * alike — this is the ticket's "round-trips in both boots" stated as one test,
 * no browser required. [LAW:verifiable-goals] [LAW:behavior-not-structure]
 */

import { describe, expect, it } from 'vitest';

import { PatchStore } from '../../../stores/PatchStore';
import { LayoutStore } from '../../../stores/LayoutStore';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';

import { PatchStoreAdapter } from '../PatchStoreAdapter';
import { PillarPatchAdapter } from '../PillarPatchAdapter';
import type { BlockLike, GraphDataAdapter } from '../types';
import { copyBlocks, pasteClipboard, pasteCascadeOffset, type GraphClipboard } from '../graph-clipboard';

// Each provider is read here through the neutral string-keyed seam (a branded
// BlockId is the same value at runtime), so one assertion checks them all.
interface ClipboardCase {
  readonly name: string;
  /** A freshly-seeded adapter with >= 2 blocks and >= 1 internal edge. */
  newAdapter(): GraphDataAdapter<string>;
  /** Whether this provider round-trips params (updateBlockParams present). */
  readonly roundTripsParams: boolean;
}

const OFFSET = { dx: 40, dy: 40 };

/**
 * Copy the whole seed, paste it, and assert the paste is a faithful, freshly-minted
 * duplicate: new ids, same shapes, internal edges rewired among the new blocks, and
 * the originals left untouched.
 */
function assertMultiBlockRoundtrips(c: ClipboardCase): void {
  const adapter = c.newAdapter();

  const originalIds = new Set([...adapter.blocks.keys()].map(String));
  const originalEdgeCount = adapter.edges.length;
  expect(originalIds.size, `${c.name}: seed has >=2 blocks`).toBeGreaterThanOrEqual(2);
  expect(originalEdgeCount, `${c.name}: seed has >=1 edge`).toBeGreaterThanOrEqual(1);

  const clip = copyBlocks(adapter, originalIds);
  expect(clip, `${c.name}: copying a non-empty selection yields a payload`).not.toBeNull();
  expect(clip!.blocks.length, `${c.name}: every selected block is captured`).toBe(originalIds.size);
  // Every seed edge is internal to a whole-graph selection, so all are captured.
  expect(clip!.edges.length, `${c.name}: internal edges are captured`).toBe(originalEdgeCount);

  const newIds = pasteClipboard(adapter, clip!, OFFSET);

  // Re-mint: one new block per captured block, and no id is reused.
  expect(newIds.length, `${c.name}: one new block per captured block`).toBe(originalIds.size);
  for (const id of newIds) {
    expect(originalIds.has(id), `${c.name}: paste mints a fresh id (${id})`).toBe(false);
  }

  // The graph grew by exactly the pasted count; the originals are all still there.
  expect(adapter.blocks.size, `${c.name}: graph grew by the pasted count`).toBe(originalIds.size * 2);
  for (const id of originalIds) {
    expect(adapter.blocks.has(id), `${c.name}: original ${id} untouched`).toBe(true);
  }

  // Each pasted block matches its source in type (and position offset, and params
  // where the provider supports it). newIds[i] corresponds to clip.blocks[i].
  clip!.blocks.forEach((source, i) => {
    const pasted = adapter.blocks.get(newIds[i]);
    expect(pasted, `${c.name}: pasted block ${newIds[i]} is readable`).toBeDefined();
    expect(pasted!.type, `${c.name}: pasted block preserves type`).toBe(source.type);
    expect(
      adapter.getBlockPosition(newIds[i]),
      `${c.name}: pasted block is offset from its source`,
    ).toEqual({ x: source.position.x + OFFSET.dx, y: source.position.y + OFFSET.dy });
    if (c.roundTripsParams) {
      // Every captured param value is faithfully restored. (A provider whose
      // addBlock seeds extra defaults the original omitted may carry more keys —
      // that is the store's concern, not the clipboard's.)
      for (const [key, value] of Object.entries(source.params)) {
        expect(pasted!.params[key], `${c.name}: pasted block restores param '${key}'`).toEqual(value);
      }
    }
  });

  // Internal wiring is preserved: every captured edge reappears among the NEW blocks,
  // and the total edge count is exactly doubled (originals + pasted). [LAW:one-source-of-truth]
  const newIdSet = new Set(newIds);
  const pastedEdges = adapter.edges.filter(
    (e) => newIdSet.has(e.sourceBlockId) && newIdSet.has(e.targetBlockId),
  );
  expect(pastedEdges.length, `${c.name}: internal edges rewired among pasted blocks`).toBe(
    originalEdgeCount,
  );
  expect(adapter.edges.length, `${c.name}: originals plus pasted edges`).toBe(originalEdgeCount * 2);
}

const patchStoreCase: ClipboardCase = {
  name: 'PatchStoreAdapter',
  roundTripsParams: true,
  newAdapter() {
    const patchStore = new PatchStore();
    const layoutStore = new LayoutStore();
    const frontendStore = new FrontendResultStore();

    // Const(value:0.5) -> Ellipse.rx, positioned so the offset assertion is meaningful.
    const constId = patchStore.addBlock('Const', { value: 0.5 });
    const ellipseId = patchStore.addBlock('Ellipse', {});
    patchStore.addEdge(
      { kind: 'port', blockId: constId, slotId: 'out' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );
    layoutStore.setPosition(constId, { x: 100, y: 100 });
    layoutStore.setPosition(ellipseId, { x: 400, y: 100 });

    return new PatchStoreAdapter(patchStore, layoutStore, frontendStore) as GraphDataAdapter<string>;
  },
};

const pillarPatchCase: ClipboardCase = {
  name: 'PillarPatchAdapter',
  roundTripsParams: true,
  newAdapter() {
    // PillarPatchStore self-seeds the grid-of-squares patch (3 blocks, 2 edges).
    return new PillarPatchAdapter(new PillarPatchStore());
  },
};

describe('graph-clipboard: multi-block copy/paste round-trips per provider', () => {
  it('re-mints a multi-block selection over PatchStoreAdapter', () => {
    assertMultiBlockRoundtrips(patchStoreCase);
  });

  it('re-mints a multi-block selection over PillarPatchAdapter', () => {
    assertMultiBlockRoundtrips(pillarPatchCase);
  });

  it('copying an empty selection yields no clipboard payload', () => {
    const adapter = patchStoreCase.newAdapter();
    expect(copyBlocks(adapter, [])).toBeNull();
    expect(copyBlocks(adapter, ['does-not-exist'])).toBeNull();
  });

  it('pasteCascadeOffset steps one increment per paste index, uniform in x/y', () => {
    const first = pasteCascadeOffset(0);
    const second = pasteCascadeOffset(1);
    expect(first.dx).toBe(first.dy);
    expect(second.dx).toBeGreaterThan(first.dx);
    expect(second.dy).toBeGreaterThan(first.dy);
  });

  it('a paste that throws part-way rolls back, leaving no orphaned blocks', () => {
    // An adapter whose addBlock throws on the 2nd call — the failure mode a mobx
    // action does NOT roll back for us. Paste must compensate so nothing is left behind.
    const live = new Map<string, BlockLike>();
    let adds = 0;
    const adapter: GraphDataAdapter<string> = {
      blocks: live,
      edges: [],
      addBlock(type) {
        adds += 1;
        if (adds === 2) throw new Error('boom');
        const id = `n${adds}`;
        live.set(id, {
          id, type, typeLabel: type, displayName: id, params: {},
          inputPorts: new Map(), outputPorts: new Map([['out', { id: 'out', label: 'out' }]]),
          controls: [],
        });
        return id;
      },
      removeBlock(id) { live.delete(id); },
      getBlockPosition: () => ({ x: 0, y: 0 }),
      setBlockPosition() {},
      addEdge: () => 'e',
      removeEdge() {},
    };

    const clip: GraphClipboard = {
      blocks: [
        { localId: 'a', type: 'Const', params: {}, position: { x: 0, y: 0 } },
        { localId: 'b', type: 'Const', params: {}, position: { x: 0, y: 0 } },
      ],
      edges: [],
    };

    expect(() => pasteClipboard(adapter, clip, { dx: 0, dy: 0 })).toThrow('boom');
    expect(live.size, 'the block added before the throw was rolled back').toBe(0);
  });

  it('a paste whose addEdge throws rolls back every already-added block', () => {
    // The other cleanup shape: all blocks add successfully, then wiring throws.
    // Rollback must remove the blocks that already exist in the graph.
    const live = new Map<string, BlockLike>();
    let n = 0;
    const adapter: GraphDataAdapter<string> = {
      blocks: live,
      edges: [],
      addBlock(type) {
        n += 1;
        const id = `n${n}`;
        live.set(id, {
          id, type, typeLabel: type, displayName: id, params: {},
          inputPorts: new Map(), outputPorts: new Map([['out', { id: 'out', label: 'out' }]]),
          controls: [],
        });
        return id;
      },
      removeBlock(id) { live.delete(id); },
      getBlockPosition: () => ({ x: 0, y: 0 }),
      setBlockPosition() {},
      addEdge() { throw new Error('bad wire'); },
      removeEdge() {},
    };

    const clip: GraphClipboard = {
      blocks: [
        { localId: 'a', type: 'Const', params: {}, position: { x: 0, y: 0 } },
        { localId: 'b', type: 'Const', params: {}, position: { x: 0, y: 0 } },
      ],
      edges: [{ sourceLocalId: 'a', sourcePortId: 'out', targetLocalId: 'b', targetPortId: 'in' }],
    };

    expect(() => pasteClipboard(adapter, clip, { dx: 0, dy: 0 })).toThrow('bad wire');
    expect(live.size, 'all blocks added before the wiring throw were rolled back').toBe(0);
  });
});
