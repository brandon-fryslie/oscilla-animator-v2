import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { hclDemos } from '../../demo';
import { AddressRegistry } from '../../graph/address-registry';
import { PatchStore } from '../PatchStore';

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
});
