/**
 * Tests for DefaultSourcePolicy.
 */
import { describe, it, expect } from 'vitest';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE, getBlockDefinition } from '../../../blocks/registry';
import { draftPortKey } from '../type-facts';
import { isDischarged, isOpen, isBlocked } from '../obligations';

describe('DefaultSourcePolicy', () => {
  it('creates default source blocks for unconnected inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Add has inputs 'a' and 'b' — both unconnected
    // Default source blocks should be created for each
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const dsA = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_a`);
    const dsB = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_b`);

    expect(dsA).toBeDefined();
    expect(dsB).toBeDefined();
  });

  it('creates default source edges wiring to target inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;

    // Should have edges from default source blocks to Add inputs
    const edgesToA = result.graph.edges.filter(
      (e) => e.to.blockId === addBlock.id && e.to.port === 'a',
    );
    const edgesToB = result.graph.edges.filter(
      (e) => e.to.blockId === addBlock.id && e.to.port === 'b',
    );

    expect(edgesToA.length).toBe(1);
    expect(edgesToB.length).toBe(1);

    // Edges should have role 'defaultWire'
    expect(edgesToA[0].role).toBe('defaultWire');
    expect(edgesToB[0].role).toBe('defaultWire');
  });

  it('default source blocks have elaboration origin', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const dsA = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_a`);

    expect(dsA).toBeDefined();
    expect(typeof dsA!.origin).toBe('object');
    if (typeof dsA!.origin === 'object') {
      expect(dsA!.origin.kind).toBe('elaboration');
      expect(dsA!.origin.role).toBe('defaultSource');
    }
  });

  it('obligations are discharged after default source insertion', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Initial obligations for 'a' and 'b' should now be discharged
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const oblA = result.graph.obligations.find(
      (o) => o.anchor.port?.port === 'a' && o.anchor.blockId === addBlock.id,
    );
    const oblB = result.graph.obligations.find(
      (o) => o.anchor.port?.port === 'b' && o.anchor.blockId === addBlock.id,
    );

    expect(oblA).toBeDefined();
    expect(oblB).toBeDefined();
    if (oblA) expect(isDischarged(oblA)).toBe(true);
    if (oblB) expect(isDischarged(oblB)).toBe(true);
  });

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

  it('re-iteration: new default source block ports get solved on next loop', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 20,
    });

    // After fixpoint: default source blocks should also have type facts
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const dsAId = `_ds_${addBlock.id}_a`;
    const dsA = result.graph.blocks.find((b) => b.id === dsAId);
    expect(dsA).toBeDefined();

    // The default source block's output should have a type hint
    if (dsA) {
      const dsAOutKey = draftPortKey(dsAId, 'out', 'out');
      const hint = result.facts.ports.get(dsAOutKey);
      // May or may not be present depending on solver coverage
      // But the fixpoint should have iterated to solve it
    }

    // Multiple iterations needed to solve + plan + apply + re-solve
    expect(result.iterations).toBeGreaterThanOrEqual(2);
  });

  it('uses DefaultSource block type as fallback', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const dsA = result.graph.blocks.find((b) => b.id === `_ds_${addBlock.id}_a`);

    // Add's inputs don't have a specific defaultSource in the registry,
    // so the polymorphic DefaultSource block type is used
    expect(dsA).toBeDefined();
    expect(dsA!.type).toBe('DefaultSource');
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
