import { reaction } from 'mobx';
import { describe, expect, it } from 'vitest';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { LayoutStore } from '../../../stores/LayoutStore';
import { PatchStore } from '../../../stores/PatchStore';
import type { BlockId } from '../../../types';
import { PatchStoreAdapter } from '../PatchStoreAdapter';

describe('PatchStoreAdapter position sync', () => {
  it('commits block creation and layout position in a single reaction transaction', () => {
    const patchStore = new PatchStore();
    const layoutStore = new LayoutStore();
    const frontendStore = new FrontendResultStore();
    const adapter = new PatchStoreAdapter(patchStore, layoutStore, frontendStore);

    const seenPositions: Array<{ x: number; y: number }> = [];
    const dispose = reaction(
      () => Array.from(adapter.blocks.values()).map((block) => `${block.id}:${block.type}`).join('|'),
      () => {
        const block = Array.from(adapter.blocks.values())[0];
        if (!block) return;
        const stored = adapter.getBlockPosition(block.id as BlockId);
        seenPositions.push(stored ?? { x: 100, y: 100 });
      },
    );

    const dropPosition = { x: 420, y: 315 };
    adapter.addBlock('Const', dropPosition);

    dispose();

    // [LAW:one-source-of-truth] Projection consumers should observe authored drop coordinates,
    // not fallback placement from an intermediate partial write.
    expect(seenPositions).toEqual([dropPosition]);
  });
});
