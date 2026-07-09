/**
 * GraphHistoryStore — the single, era-neutral undo/redo authority.
 *
 * The same store drives both eras through the neutral GraphSnapshotSource, so these
 * tests are the contract: undo/redo restores authored state across every mutation
 * kind, redo is voided by a new edit, and the stacks survive a panel remount (rebind
 * with the same model key). The pillar continuity case asserts that undo yields a
 * frame-identical recompile — the "equivalent reinstall" the continuity epic gates on.
 */

import { describe, expect, it } from 'vitest';

import { FrontendResultStore } from '../FrontendResultStore';
import { LayoutStore } from '../LayoutStore';
import { PatchStore } from '../PatchStore';
import { PillarPatchStore } from '../PillarPatchStore';
import { GraphHistoryStore } from '../GraphHistoryStore';
import { PatchStoreAdapter } from '../../ui/graphEditor/PatchStoreAdapter';
import { PillarPatchAdapter } from '../../ui/graphEditor/PillarPatchAdapter';
import type { BlockId } from '../../types';

function makeV1() {
  const patch = new PatchStore();
  const layout = new LayoutStore();
  const frontend = new FrontendResultStore();
  const adapter = new PatchStoreAdapter(patch, layout, frontend);
  return { patch, layout, adapter };
}

function makePillar() {
  const store = new PillarPatchStore();
  const adapter = new PillarPatchAdapter(store);
  return { store, adapter };
}

describe('GraphHistoryStore', () => {
  it('records nothing until the first edit', () => {
    const history = new GraphHistoryStore();
    const { adapter, patch } = makeV1();
    history.bind(adapter, patch);

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('V1: undo/redo restores state across every adapter mutation kind', () => {
    const history = new GraphHistoryStore();
    const { adapter, patch, layout } = makeV1();
    history.bind(adapter, patch);

    // addBlock
    const id = adapter.addBlock('Const', { x: 10, y: 20 });
    expect(patch.blocks.size).toBe(1);

    // setBlockPosition
    adapter.setBlockPosition(id, { x: 99, y: 99 });
    expect(layout.getPosition(id)).toEqual({ x: 99, y: 99 });

    // updateBlockParams
    adapter.updateBlockParams(id, { value: 7 });
    expect(patch.blocks.get(id)?.params.value).toBe(7);

    // updateBlockDisplayName
    expect(adapter.updateBlockDisplayName(id, 'MyConst').error).toBeUndefined();
    expect(patch.blocks.get(id)?.displayName).toBe('MyConst');

    // Undo walks backward through each checkpoint.
    history.undo(); // undo rename
    expect(patch.blocks.get(id)?.displayName).not.toBe('MyConst');
    history.undo(); // undo param
    expect(patch.blocks.get(id)?.params.value).not.toBe(7);
    history.undo(); // undo move
    expect(layout.getPosition(id)).toEqual({ x: 10, y: 20 });
    history.undo(); // undo add
    expect(patch.blocks.size).toBe(0);
    expect(history.canUndo).toBe(false);

    // Redo replays forward to the final state.
    history.redo();
    history.redo();
    history.redo();
    history.redo();
    expect(patch.blocks.size).toBe(1);
    expect(patch.blocks.get(id)?.params.value).toBe(7);
    expect(patch.blocks.get(id)?.displayName).toBe('MyConst');
    expect(layout.getPosition(id)).toEqual({ x: 99, y: 99 });
    expect(history.canRedo).toBe(false);
  });

  it('Pillar: undo/redo restores blocks, config, layout, and edges', () => {
    const history = new GraphHistoryStore();
    const { adapter, store } = makePillar();
    history.bind(adapter, store);

    const edgeCountBefore = store.patch.edges.length;
    const blockCountBefore = store.patch.blocks.length;
    const firstEdgeId = store.patch.edges[0].id;

    // removeEdge
    adapter.removeEdge(firstEdgeId);
    expect(store.patch.edges.length).toBe(edgeCountBefore - 1);

    // addBlock + config + position
    const id = adapter.addBlock('ColorCycle', { x: 5, y: 5 });
    expect(store.patch.blocks.length).toBe(blockCountBefore + 1);
    adapter.updateBlockParams(id, { cycleSpeed: 0.9 });
    expect(store.patch.blocks.find((b) => b.id === id)?.config.cycleSpeed).toBe(0.9);

    // Undo everything.
    history.undo(); // undo config
    expect(store.patch.blocks.find((b) => b.id === id)?.config.cycleSpeed).not.toBe(0.9);
    history.undo(); // undo addBlock
    expect(store.patch.blocks.length).toBe(blockCountBefore);
    history.undo(); // undo removeEdge
    expect(store.patch.edges.length).toBe(edgeCountBefore);
    expect(store.patch.edges.some((e) => e.id === firstEdgeId)).toBe(true);

    // Redo back to the edited state.
    history.redo();
    history.redo();
    history.redo();
    expect(store.patch.edges.length).toBe(edgeCountBefore - 1);
    expect(store.patch.blocks.find((b) => b.id === id)?.config.cycleSpeed).toBe(0.9);
  });

  it('a new edit clears the redo stack', () => {
    const history = new GraphHistoryStore();
    const { adapter, patch } = makeV1();
    history.bind(adapter, patch);

    adapter.addBlock('Const', { x: 0, y: 0 });
    history.undo();
    expect(history.canRedo).toBe(true);

    // A fresh edit branches history; the undone future is discarded.
    adapter.addBlock('Const', { x: 1, y: 1 });
    expect(history.canRedo).toBe(false);
  });

  it('keeps its stacks when rebound to the same model (panel remount)', () => {
    const history = new GraphHistoryStore();
    const { adapter, patch, layout } = makeV1();
    history.bind(adapter, patch);

    adapter.addBlock('Const', { x: 0, y: 0 });
    expect(history.canUndo).toBe(true);

    // Dockview rearrangement recreates the adapter over the SAME stores.
    history.unbind(adapter);
    const remounted = new PatchStoreAdapter(patch, layout, new FrontendResultStore());
    history.bind(remounted, patch);

    expect(history.canUndo).toBe(true);
    history.undo();
    expect(patch.blocks.size).toBe(0);
  });

  it('resets its stacks when bound to a different model', () => {
    const history = new GraphHistoryStore();
    const v1 = makeV1();
    history.bind(v1.adapter, v1.patch);
    v1.adapter.addBlock('Const', { x: 0, y: 0 });
    expect(history.canUndo).toBe(true);

    const pillar = makePillar();
    history.bind(pillar.adapter, pillar.store);
    expect(history.canUndo).toBe(false);
  });

  it('Pillar continuity: undo yields a frame-identical recompile', () => {
    const history = new GraphHistoryStore();
    const { adapter, store } = makePillar();
    history.bind(adapter, store);

    // The compiled ScenePlan an undone edit must return to bit-for-bit — the
    // "equivalent reinstall is frame-identical" continuity gate. [LAW:one-source-of-truth]
    const planBefore = store.compiled;

    // A structural edit changes the plan; undo must recompile back to the exact plan.
    adapter.removeEdge(store.patch.edges[0].id);
    expect(store.compiled).not.toEqual(planBefore);

    history.undo();
    expect(store.compiled).toEqual(planBefore);
  });
});
