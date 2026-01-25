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
import { findAdapter, extractSignature } from './graph/adapters';
import { getBlockDefinition } from './blocks/registry';
import { describe, it, expect } from 'vitest';

describe('Debug5', () => {
  it('checks adapter insertion for Signal->Field', () => {
    // Build a patch that requires FieldBroadcast: Const (Signal) -> FieldRadiusSqrt.radius (Field)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const array = b.addBlock('Array', { count: 4 });
      const layout = b.addBlock('GridLayout', { rows: 2, cols: 2 });
      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');

      // This is a Signal -> Field connection that needs FieldBroadcast
      const radiusSqrt = b.addBlock('FieldRadiusSqrt', {});
      b.wire(array, 't', radiusSqrt, 'id01');  // Field -> Field (ok)
      const radius = b.addBlock('Const', { value: 0.35 });
      b.wire(radius, 'out', radiusSqrt, 'radius');  // Signal -> Field (needs adapter!)
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

    // Check if FieldBroadcast was inserted for Const -> FieldRadiusSqrt.radius
    const hasFieldBroadcast = result.patch.blocks.some(b => b.type === 'FieldBroadcast');
    console.log('\nHas FieldBroadcast adapter?', hasFieldBroadcast);

    expect(hasFieldBroadcast).toBe(true);
  });

  it('debug findAdapter for Const -> Field connection', () => {
    // Get Const output type
    const constDef = getBlockDefinition('Const')!;
    const constOutType = constDef.outputs.out.type;
    console.log('Const.out type:', JSON.stringify(constOutType, null, 2));
    console.log('Const.out signature:', extractSignature(constOutType));

    // Get FieldRadiusSqrt input type
    const fieldDef = getBlockDefinition('FieldRadiusSqrt')!;
    const fieldRadiusType = fieldDef.inputs.radius.type;
    console.log('\nFieldRadiusSqrt.radius type:', JSON.stringify(fieldRadiusType, null, 2));
    console.log('FieldRadiusSqrt.radius signature:', extractSignature(fieldRadiusType));

    // Check if adapter is found
    const adapter = findAdapter(constOutType, fieldRadiusType);
    console.log('\nAdapter found:', adapter);

    expect(adapter).not.toBeNull();
    expect(adapter?.blockType).toBe('FieldBroadcast');
  });
});
