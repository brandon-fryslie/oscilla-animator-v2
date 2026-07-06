import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../graph/Patch';
import { registerAllBlocks } from '../../../blocks/all';
import type { BlockId } from '../../../types';
import {
  findCompatibleReplacementPlans,
  isCompatibleBlockReplacement,
} from '../menus/blockReplacement';
import { v1BlockCatalog } from '../../graphEditor/V1BlockCatalog';

registerAllBlocks();

describe('blockReplacement helpers', () => {
  it('finds replacement plans that keep all connected edges valid', () => {
    let target = '' as BlockId;
    const patch = buildPatch((b) => {
      const source = b.addBlock('Const');
      target = b.addBlock('Add');
      const sink = b.addBlock('Sin');

      b.wire(source, 'out', target, 'a');
      b.wire(source, 'out', target, 'b');
      b.wire(target, 'out', sink, 'input');
    });

    const compatible = findCompatibleReplacementPlans(v1BlockCatalog, patch, target);
    const types = compatible.map((item) => item.blockType);

    expect(types).toContain('Subtract');
    expect(types).toContain('Multiply');
  });

  it('rejects incompatible replacement types', () => {
    let target = '' as BlockId;
    const patch = buildPatch((b) => {
      const source = b.addBlock('Const');
      target = b.addBlock('Add');
      b.wire(source, 'out', target, 'a');
    });

    expect(isCompatibleBlockReplacement(v1BlockCatalog, patch, target, 'Const')).toBe(false);
  });
});
