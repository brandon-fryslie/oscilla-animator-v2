/**
 * Tests for edge data population with lens information.
 *
 * Tests the active code path:
 * - createEdgeFromEdgeLike (via nodeDataTransform.ts / GraphEditorCore)
 */

import { describe, it, expect } from 'vitest';
import { createEdgeFromEdgeLike } from '../../graphEditor/nodeDataTransform';
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
