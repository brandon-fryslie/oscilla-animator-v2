import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { hclDemos } from '../../demo';
import type { Patch } from '../../graph/Patch';
import { AddressRegistry } from '../../graph/address-registry';
import { PatchStore } from '../PatchStore';
import type { BlockId } from '../../types';

registerAllBlocks();

describe('PatchStore expression snapshot compatibility', () => {
  it('builds AddressRegistry from the Expression Operator Showcase snapshot', () => {
    const demo = hclDemos.find((entry) => entry.filename === 'expression-operator-showcase.hcl');
    expect(demo).toBeDefined();

    const store = new PatchStore();
    store.loadFromHCL(demo!.hcl);

    expect(() => AddressRegistry.buildFromPatch(store.patch)).not.toThrow();
  });

  it('exposes native port maps from immutable patch snapshots', () => {
    const demo = hclDemos.find((entry) => entry.filename === 'expression-operator-showcase.hcl');
    expect(demo).toBeDefined();

    const store = new PatchStore();
    store.loadFromHCL(demo!.hcl);

    for (const block of store.patch.blocks.values()) {
      expect(block.inputPorts).toBeInstanceOf(Map);
      expect(block.outputPorts).toBeInstanceOf(Map);
    }
  });

  it('detaches nested block and edge objects at load boundaries', () => {
    const sourcePatch: Patch = {
      blocks: new Map([
        ['source-block' as BlockId, {
          id: 'source-block' as BlockId,
          type: 'Expression',
          params: { expression: 'clock.phaseA' },
          displayName: 'Source',
          domainId: null,
          role: { kind: 'user', meta: {} },
          inputPorts: new Map([
            ['refs', { id: 'refs', combineMode: 'last' as const }],
          ]),
          outputPorts: new Map([
            ['output', { id: 'output' }],
          ]),
        }],
      ]),
      edges: [
        {
          id: 'edge-1',
          from: { kind: 'port', blockId: 'source-block', slotId: 'output' },
          to: { kind: 'port', blockId: 'target-block', slotId: 'refs' },
          enabled: true,
          sortKey: 0,
          role: { kind: 'collect', meta: { alias: 'source.output' } },
          alias: 'source.output',
        },
      ],
    };

    const sourceBlock = sourcePatch.blocks.get('source-block' as BlockId)!;
    const sourceEdge = sourcePatch.edges[0];
    const store = new PatchStore();
    store.loadPatch(sourcePatch);
    const loadedPatch = store.patch;
    const loadedBlock = loadedPatch.blocks.get('source-block' as BlockId)!;
    const loadedEdge = loadedPatch.edges[0];

    expect(loadedBlock).not.toBe(sourceBlock);
    expect(loadedBlock.role).not.toBe(sourceBlock.role);
    expect(loadedBlock.role.meta).not.toBe(sourceBlock.role.meta);
    expect(loadedEdge).not.toBe(sourceEdge);
    expect(loadedEdge.from).not.toBe(sourceEdge.from);
    expect(loadedEdge.to).not.toBe(sourceEdge.to);
    expect(loadedEdge.role).not.toBe(sourceEdge.role);
    expect(loadedEdge.role.meta).not.toBe(sourceEdge.role.meta);
  });
});
