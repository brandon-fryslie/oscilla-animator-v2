/**
 * Tests for DefaultSourcePolicy.
 */
import { describe, it, expect } from 'vitest';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';

describe('DefaultSourcePolicy', () => {
  it('does not create default sources for connected inputs', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;

    // No default source blocks for Add's inputs (both connected)
    const dsA = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_a`);
    const dsB = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_b`);

    expect(dsA).toBeUndefined();
    expect(dsB).toBeUndefined();
  });

  it('convergence: fixpoint terminates even with nested default sources', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 30,
    });

    // Should converge, not hit max iterations
    expect(result.iterations).toBeLessThan(30);
  });
});
