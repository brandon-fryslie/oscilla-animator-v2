import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../graph/Patch';
import { registerAllBlocks } from '../../../blocks/all';
import type { BlockId } from '../../../types';
import {
  findCompatibleReplacementPlans,
  isCompatibleBlockReplacement,
} from '../menus/blockReplacement';

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

    const compatible = findCompatibleReplacementPlans(patch, target);
    const types = compatible.map((item) => item.blockType);

    expect(types).toContain('Subtract');
    expect(types).toContain('Sin');
  });

  it('produces rewired edges that no longer reference the old slots', () => {
    let target = '' as BlockId;
    const patch = buildPatch((b) => {
      const source = b.addBlock('Const');
      target = b.addBlock('Add');
      const sink = b.addBlock('Sin');

      b.wire(source, 'out', target, 'a');
      b.wire(target, 'out', sink, 'input');
    });

    const compatible = findCompatibleReplacementPlans(patch, target);
    const sinPlan = compatible.find((item) => item.blockType === 'Sin');

    expect(sinPlan).toBeDefined();
    expect(sinPlan?.rewiredEdges.some((edge) => edge.to.blockId === target && edge.to.slotId === 'input')).toBe(true);
    expect(sinPlan?.rewiredEdges.some((edge) => edge.from.blockId === target && edge.from.slotId === 'result')).toBe(true);
  });

  it('rejects incompatible replacement types', () => {
    let target = '' as BlockId;
    const patch = buildPatch((b) => {
      const source = b.addBlock('Const');
      target = b.addBlock('Add');
      b.wire(source, 'out', target, 'a');
    });

    expect(isCompatibleBlockReplacement(patch, target, 'Const')).toBe(false);
  });
});
