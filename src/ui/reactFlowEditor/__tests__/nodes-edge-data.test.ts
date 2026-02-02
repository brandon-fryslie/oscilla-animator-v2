/**
 * Tests for edge data population with lens information
 */

import { describe, it, expect } from 'vitest';
import { createEdgeFromPatchEdge } from '../nodes';
import type { Edge, Block, BlockId } from '../../../types';
import type { LensAttachment } from '../../../graph/Patch';

// Ensure blocks are registered
import '../../../blocks/all';

describe('createEdgeFromPatchEdge - lens data population', () => {
  it('populates edge data with lenses from target port', () => {
    const lenses: LensAttachment[] = [
      {
        id: 'lens1',
        lensType: 'Adapter_PhaseToScalar01',
        sourceAddr: 'v1:blocks.source.outputs.out',
      },
    ];

    const sourceBlock: Block = {
      id: 'source' as BlockId,
      type: 'Osc_Phasor',
      displayName: 'Source',
      params: {},
      inputPorts: new Map(),
      outputPorts: new Map(),
    };

    const targetBlock: Block = {
      id: 'target' as BlockId,
      type: 'Math_Mult',
      displayName: 'Target',
      params: {},
      inputPorts: new Map([
        ['in', { id: 'in', combineMode: 'last', lenses }],
      ]),
      outputPorts: new Map(),
    };

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0,
    };

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, sourceBlock],
      ['target' as BlockId, targetBlock],
    ]);

    const rfEdge = createEdgeFromPatchEdge(edge, blocks);

    // Should have lens data populated
    expect(rfEdge.data).toBeDefined();
    expect(rfEdge.data!.lenses).toBeDefined();
    expect(rfEdge.data!.lenses).toHaveLength(1);
    expect(rfEdge.data!.lenses![0].lensType).toBe('Adapter_PhaseToScalar01');
  });

  it('sets edge type to oscilla for custom rendering', () => {
    const sourceBlock: Block = {
      id: 'source' as BlockId,
      type: 'Osc_Phasor',
      displayName: 'Source',
      params: {},
      inputPorts: new Map(),
      outputPorts: new Map(),
    };

    const targetBlock: Block = {
      id: 'target' as BlockId,
      type: 'Math_Mult',
      displayName: 'Target',
      params: {},
      inputPorts: new Map([
        ['in', { id: 'in', combineMode: 'last' }],
      ]),
      outputPorts: new Map(),
    };

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0,
    };

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, sourceBlock],
      ['target' as BlockId, targetBlock],
    ]);

    const rfEdge = createEdgeFromPatchEdge(edge, blocks);

    // Should use custom edge type
    expect(rfEdge.type).toBe('oscilla');
  });

  it('populates edge data with multiple lenses', () => {
    const lenses: LensAttachment[] = [
      {
        id: 'lens1',
        lensType: 'Adapter_PhaseToScalar01',
        sourceAddr: 'v1:blocks.source.outputs.out',
      },
      {
        id: 'lens2',
        lensType: 'Lens_Scale',
        sourceAddr: 'v1:blocks.source.outputs.out',
      },
    ];

    const sourceBlock: Block = {
      id: 'source' as BlockId,
      type: 'Osc_Phasor',
      displayName: 'Source',
      params: {},
      inputPorts: new Map(),
      outputPorts: new Map(),
    };

    const targetBlock: Block = {
      id: 'target' as BlockId,
      type: 'Math_Mult',
      displayName: 'Target',
      params: {},
      inputPorts: new Map([
        ['in', { id: 'in', combineMode: 'last', lenses }],
      ]),
      outputPorts: new Map(),
    };

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0,
    };

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, sourceBlock],
      ['target' as BlockId, targetBlock],
    ]);

    const rfEdge = createEdgeFromPatchEdge(edge, blocks);

    // Should have all lenses
    expect(rfEdge.data!.lenses).toHaveLength(2);
    expect(rfEdge.data!.lenses![0].lensType).toBe('Adapter_PhaseToScalar01');
    expect(rfEdge.data!.lenses![1].lensType).toBe('Lens_Scale');
  });

  it('leaves lens data undefined when no lenses attached', () => {
    const sourceBlock: Block = {
      id: 'source' as BlockId,
      type: 'Osc_Phasor',
      displayName: 'Source',
      params: {},
      inputPorts: new Map(),
      outputPorts: new Map(),
    };

    const targetBlock: Block = {
      id: 'target' as BlockId,
      type: 'Math_Mult',
      displayName: 'Target',
      params: {},
      inputPorts: new Map([
        ['in', { id: 'in', combineMode: 'last' }], // No lenses
      ]),
      outputPorts: new Map(),
    };

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0,
    };

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, sourceBlock],
      ['target' as BlockId, targetBlock],
    ]);

    const rfEdge = createEdgeFromPatchEdge(edge, blocks);

    // No lenses - data should not have lenses field set
    expect(rfEdge.data!.lenses).toBeUndefined();
  });

  it('sets isNonContributing flag in edge data', () => {
    const sourceBlock: Block = {
      id: 'source' as BlockId,
      type: 'Osc_Phasor',
      displayName: 'Source',
      params: {},
      inputPorts: new Map(),
      outputPorts: new Map(),
    };

    const targetBlock: Block = {
      id: 'target' as BlockId,
      type: 'Math_Mult',
      displayName: 'Target',
      params: {},
      inputPorts: new Map([
        ['in', { id: 'in', combineMode: 'last' }],
      ]),
      outputPorts: new Map(),
    };

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0,
    };

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, sourceBlock],
      ['target' as BlockId, targetBlock],
    ]);

    const nonContributing = new Set(['e1']);

    const rfEdge = createEdgeFromPatchEdge(edge, blocks, nonContributing);

    // Should have isNonContributing flag set
    expect(rfEdge.data!.isNonContributing).toBe(true);
  });
});
