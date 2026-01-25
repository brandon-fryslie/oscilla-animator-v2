import { buildPatch } from './graph/Patch';
import './blocks/time-blocks';
import './blocks/field-operations-blocks';
import './blocks/signal-blocks';
import './blocks/primitive-blocks';
import './blocks/array-blocks';
import './blocks/field-blocks';
import './blocks/render-blocks';
import './blocks/color-blocks';
import './blocks/instance-blocks';
import './blocks/adapter-blocks';
import { runNormalizationPasses } from './graph/passes';
import { describe, it, expect } from 'vitest';

describe('Debug5', () => {
  it('checks adapter insertion', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const array = b.addBlock('Array', { count: 4 });
      const layout = b.addBlock('GridLayout', { rows: 2, cols: 2 });
      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');

      const hue = b.addBlock('FieldHueFromPhase', {});
      b.wire(array, 't', hue, 'id01');
      const phase = b.addBlock('Const', { value: 0.0 });
      b.wire(phase, 'out', hue, 'phase');
    });

    console.log('Raw patch blocks:');
    for (const [id, block] of patch.blocks) {
      console.log(`  ${id}: ${block.type}`);
    }
    console.log('Raw patch edges:');
    for (const edge of patch.edges) {
      console.log(`  ${edge.from.blockId}.${edge.from.slotId} -> ${edge.to.blockId}.${edge.to.slotId}`);
    }

    const result = runNormalizationPasses(patch);
    if ('errors' in result) {
      console.log('Errors:', result.errors);
      expect('errors' in result).toBe(false);
      return;
    }

    console.log('\nNormalized blocks:');
    for (let i = 0; i < result.patch.blocks.length; i++) {
      const block = result.patch.blocks[i];
      console.log(`  [${i}] ${block.id}: ${block.type}`);
    }
    console.log('\nNormalized edges:');
    for (const edge of result.patch.edges) {
      const from = result.patch.blocks[edge.fromBlock];
      const to = result.patch.blocks[edge.toBlock];
      console.log(`  [${edge.fromBlock}] ${from?.type}.${edge.fromPort} -> [${edge.toBlock}] ${to?.type}.${edge.toPort}`);
    }
    
    // Check if FieldBroadcast was inserted for Const -> FieldHueFromPhase.phase
    const hasFieldBroadcast = result.patch.blocks.some(b => b.type === 'FieldBroadcast');
    console.log('\nHas FieldBroadcast adapter?', hasFieldBroadcast);
    
    expect(hasFieldBroadcast).toBe(true);
  });
});
