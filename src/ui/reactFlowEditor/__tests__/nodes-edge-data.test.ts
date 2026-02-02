/**
 * Tests for edge data population with lens information.
 *
 * Tests both code paths:
 * - createEdgeFromEdgeLike (active path via nodeDataTransform.ts / GraphEditorCore)
 * - createEdgeFromPatchEdge (legacy path via nodes.ts / OscillaNode direct usage)
 */

import { describe, it, expect } from 'vitest';
import { createEdgeFromEdgeLike } from '../../graphEditor/nodeDataTransform';
import { createEdgeFromPatchEdge } from '../nodes';
import type { Edge, Block, BlockId } from '../../../types';
import type { LensAttachment } from '../../../graph/Patch';
import type { BlockLike, EdgeLike } from '../../graphEditor/types';

// Ensure blocks are registered
import '../../../blocks/all';

// ---------------------------------------------------------------------------
// Active code path: createEdgeFromEdgeLike (nodeDataTransform.ts)
// ---------------------------------------------------------------------------

describe('createEdgeFromEdgeLike - lens data population', () => {
  function makeBlocks(
    targetLenses?: readonly LensAttachment[]
  ): ReadonlyMap<string, BlockLike> {
    return new Map<string, BlockLike>([
      ['source', {
        id: 'source',
        type: 'Osc_Phasor',
        displayName: 'Source',
        params: {},
        inputPorts: new Map(),
        outputPorts: new Map(),
      }],
      ['target', {
        id: 'target',
        type: 'Math_Mult',
        displayName: 'Target',
        params: {},
        inputPorts: new Map([
          ['in', { id: 'in', combineMode: 'last' as const, lenses: targetLenses }],
        ]),
        outputPorts: new Map(),
      }],
    ]);
  }

  const edge: EdgeLike = {
    id: 'e1',
    sourceBlockId: 'source',
    sourcePortId: 'out',
    targetBlockId: 'target',
    targetPortId: 'in',
  };

  it('populates edge data with lenses from target port', () => {
    const lenses: LensAttachment[] = [
      { id: 'lens1', lensType: 'Adapter_PhaseToScalar01', sourceAddress: 'v1:blocks.source.outputs.out', sortKey: 0 },
    ];

    const rfEdge = createEdgeFromEdgeLike(edge, makeBlocks(lenses));

    expect(rfEdge.data).toBeDefined();
    expect(rfEdge.data!.lenses).toHaveLength(1);
    expect(rfEdge.data!.lenses![0].lensType).toBe('Adapter_PhaseToScalar01');
  });

  it('sets edge type to oscilla for custom rendering', () => {
    const rfEdge = createEdgeFromEdgeLike(edge, makeBlocks());
    expect(rfEdge.type).toBe('oscilla');
  });

  it('populates edge data with multiple lenses', () => {
    const lenses: LensAttachment[] = [
      { id: 'lens1', lensType: 'Adapter_PhaseToScalar01', sourceAddress: 'v1:blocks.source.outputs.out', sortKey: 0 },
      { id: 'lens2', lensType: 'Lens_Scale', sourceAddress: 'v1:blocks.source.outputs.out', sortKey: 1 },
    ];

    const rfEdge = createEdgeFromEdgeLike(edge, makeBlocks(lenses));

    expect(rfEdge.data!.lenses).toHaveLength(2);
    expect(rfEdge.data!.lenses![0].lensType).toBe('Adapter_PhaseToScalar01');
    expect(rfEdge.data!.lenses![1].lensType).toBe('Lens_Scale');
  });

  it('leaves lens data undefined when no lenses attached', () => {
    const rfEdge = createEdgeFromEdgeLike(edge, makeBlocks());
    expect(rfEdge.data!.lenses).toBeUndefined();
  });

  it('works without blocks map (graceful degradation)', () => {
    const rfEdge = createEdgeFromEdgeLike(edge);
    expect(rfEdge.type).toBe('oscilla');
    expect(rfEdge.data!.lenses).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Legacy code path: createEdgeFromPatchEdge (nodes.ts)
// ---------------------------------------------------------------------------

describe('createEdgeFromPatchEdge - lens data population', () => {
  it('populates edge data with lenses from target port', () => {
    const lenses: LensAttachment[] = [
      { id: 'lens1', lensType: 'Adapter_PhaseToScalar01', sourceAddress: 'v1:blocks.source.outputs.out', sortKey: 0 },
    ];

    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, {
        id: 'source' as BlockId, type: 'Osc_Phasor', displayName: 'Source',
        params: {}, domainId: null, role: { kind: 'user', meta: {} },
        inputPorts: new Map(), outputPorts: new Map(),
      }],
      ['target' as BlockId, {
        id: 'target' as BlockId, type: 'Math_Mult', displayName: 'Target',
        params: {}, domainId: null, role: { kind: 'user', meta: {} },
        inputPorts: new Map([['in', { id: 'in', combineMode: 'last' as const, lenses }]]),
        outputPorts: new Map(),
      }],
    ]);

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0, enabled: true, role: { kind: 'user', meta: {} },
    };

    const rfEdge = createEdgeFromPatchEdge(edge, blocks);

    expect(rfEdge.data).toBeDefined();
    expect(rfEdge.data!.lenses).toHaveLength(1);
    expect(rfEdge.data!.lenses![0].lensType).toBe('Adapter_PhaseToScalar01');
  });

  it('sets isNonContributing flag in edge data', () => {
    const blocks = new Map<BlockId, Block>([
      ['source' as BlockId, {
        id: 'source' as BlockId, type: 'Osc_Phasor', displayName: 'Source',
        params: {}, domainId: null, role: { kind: 'user', meta: {} },
        inputPorts: new Map(), outputPorts: new Map(),
      }],
      ['target' as BlockId, {
        id: 'target' as BlockId, type: 'Math_Mult', displayName: 'Target',
        params: {}, domainId: null, role: { kind: 'user', meta: {} },
        inputPorts: new Map([['in', { id: 'in', combineMode: 'last' as const }]]),
        outputPorts: new Map(),
      }],
    ]);

    const edge: Edge = {
      id: 'e1',
      from: { kind: 'port', blockId: 'source', slotId: 'out' },
      to: { kind: 'port', blockId: 'target', slotId: 'in' },
      sortKey: 0, enabled: true, role: { kind: 'user', meta: {} },
    };

    const rfEdge = createEdgeFromPatchEdge(edge, blocks, new Set(['e1']));
    expect(rfEdge.data!.isNonContributing).toBe(true);
  });
});
