/**
 * src/pillars/frontend/__tests__/normalize.test.ts
 *
 * Phase boundary test for the frontend. Imports only frontend/, blocks/,
 * block-api, and types — never lowering/ or assembly/. dependency-cruiser
 * fails the build if either sneaks in.
 */

import { describe, it, expect } from 'vitest';
import { ALL_BLOCKS } from '../../blocks';
import { buildRegistry } from '../registry';
import { buildNormalizedGraph } from '../build-normalized-graph';
import type { PillarPatch } from '../../types';
import { clearCanvas } from '../../block-dsl/presentation/canvas-attachment';

const registry = buildRegistry(ALL_BLOCKS);

function happyPatch(): PillarPatch {
  return {
    blocks: [
      { id: 'gen', kind: 'generator', type: 'ParticlePool',
        config: { domainId: 'dots', capacity: 8, radius: 0.5 } },
      { id: 'sink', kind: 'intent', type: 'DrawBundle',
        config: { domainId: 'dots', shapeId: 'dots_quad', quadScale: 0.03,
                  attachment: clearCanvas([0, 0, 0, 1]) } },
    ],
    edges: [
      { id: 'e0', source: 'gen', target: 'sink', inputSlot: 'primary', role: 'primary' },
    ],
  };
}

describe('frontend: buildNormalizedGraph', () => {
  it('returns a NormalizedGraph with opaque nodes for a valid patch', () => {
    const result = buildNormalizedGraph(happyPatch(), registry);
    expect(result.diagnostics).toEqual([]);
    expect(result.graph).not.toBeNull();
    const graph = result.graph!;
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    for (const node of graph.nodes) {
      expect(typeof node.lower).toBe('function');
      expect(node.manifestContribution).toBeTruthy();
    }
  });

  it('collects diagnostics and returns null graph on bad config', () => {
    const bad: PillarPatch = {
      blocks: [
        { id: 'gen', kind: 'generator', type: 'ParticlePool',
          config: { domainId: 42, capacity: 8, radius: 0.5 } },
      ],
      edges: [],
    };
    const result = buildNormalizedGraph(bad, registry);
    expect(result.graph).toBeNull();
    expect(result.diagnostics.some((d) => d.severity === 'error' && /domainId/.test(d.message))).toBe(true);
  });

  it('reports unknown block types with an error diagnostic', () => {
    const bad: PillarPatch = {
      blocks: [{ id: 'x', kind: 'generator', type: 'NoSuchBlock', config: {} }],
      edges: [],
    };
    const result = buildNormalizedGraph(bad, registry);
    expect(result.graph).toBeNull();
    expect(result.diagnostics.some((d) => /Unknown block type/.test(d.message))).toBe(true);
  });
});
