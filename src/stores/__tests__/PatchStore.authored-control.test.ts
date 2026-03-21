import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { buildDraftGraph } from '../../compiler/frontend/draft-graph';
import { LayoutStore } from '../LayoutStore';
import { FrontendResultStore } from '../FrontendResultStore';
import { PatchStore } from '../PatchStore';
import { PatchStoreAdapter } from '../../ui/graphEditor/PatchStoreAdapter';
import { deserializePatch, serializePatch } from '../../services/PatchPersistence';
import type { BlockId, PortId } from '../../types';

registerAllBlocks();

describe('PatchStore authored input control ownership', () => {
  it('stores exposed input values on authoredControl instead of block.params at creation time', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Rotate2D', { angleDeg: 45 });
    const block = store.patch.blocks.get(blockId)!;

    expect(block.params.angleDeg).toBeUndefined();
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source).toMatchObject({
      blockType: 'Const',
      outputPortId: 'out',
      params: { value: 45 },
    });
  });

  it('updates exposed input control values without restoring the legacy params shadow', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Rotate2D');
    store.updateBlockParams(blockId, { angleDeg: 90 });

    const block = store.patch.blocks.get(blockId)!;
    expect(block.params.angleDeg).toBeUndefined();
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBe(90);
  });

  it('keeps config-only params in block.params', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Expression');
    store.updateBlockParams(blockId, { expression: 'clock.phaseA' });

    const block = store.patch.blocks.get(blockId)!;
    expect(block.params.expression).toBe('clock.phaseA');
    expect(block.inputPorts.get('expression')).toBeUndefined();
  });

  it('bridges authored input control into DraftGraph portDefaults', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Rotate2D', { angleDeg: 30 });
    const result = buildDraftGraph(store.patch);
    const draftBlock = result.graph.blocks.find((block) => block.id === blockId);

    expect(draftBlock).toBeDefined();
    expect(draftBlock?.params.angleDeg).toBeUndefined();
    expect(draftBlock?.portDefaults.angleDeg).toEqual({
      blockType: 'Const',
      output: 'out',
      params: { value: 30 },
    });
  });

  it('exposes authored input control through PatchStoreAdapter without leaking it back into block.params', () => {
    const patchStore = new PatchStore();
    const layoutStore = new LayoutStore();
    const frontendStore = new FrontendResultStore();
    const adapter = new PatchStoreAdapter(patchStore, layoutStore, frontendStore);

    const blockId = patchStore.addBlock('Rotate2D', { angleDeg: 15 });
    const block = adapter.blocks.get(blockId as BlockId)!;

    expect(block.params.angleDeg).toBeUndefined();
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBe(15);
  });

  it('persists authored input control through JSON serialization', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Rotate2D', { angleDeg: 22.5 });
    const serialized = serializePatch(store.patch, 0);
    const deserialized = deserializePatch(serialized);

    expect(deserialized).not.toBeNull();
    const block = deserialized!.patch.blocks.get(blockId)!;
    expect(block.params.angleDeg).toBeUndefined();
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBe(22.5);
  });

  it('updates const-backed binding controls through semantic targets', () => {
    const store = new PatchStore();

    const blockId = store.addBlock('Rotate2D');
    store.updateControlValue({
      kind: 'bindingSourceParam',
      blockId,
      portId: 'angleDeg' as PortId,
      sourceBlockType: 'Const',
      sourceOutputPortId: 'out' as PortId,
      paramId: 'value',
    }, 135);

    const block = store.patch.blocks.get(blockId)!;
    expect(block.params.angleDeg).toBeUndefined();
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBe(135);
  });

  it('updates lens-backed binding controls through semantic targets', () => {
    const store = new PatchStore();

    const sourceId = store.addBlock('Const', { value: 0.25 });
    const blockId = store.addBlock('Rotate2D');
    store.addEdge(
      { kind: 'port', blockId: sourceId, slotId: 'out' },
      { kind: 'port', blockId, slotId: 'angleDeg' },
    );
    const lensId = store.addLens(
      blockId,
      'angleDeg',
      'Clamp',
      `v1:blocks.${sourceId}.outputs.out`,
      { min: 0, max: 180 },
    );

    store.updateControlValue({
      kind: 'bindingLensParam',
      blockId,
      portId: 'angleDeg' as PortId,
      lensId,
      paramId: 'max',
    }, 270);

    const updatedLens = store.getLensesForPort(blockId, 'angleDeg').find((lens) => lens.id === lensId);
    expect(updatedLens?.params?.max).toBe(270);
  });
});
