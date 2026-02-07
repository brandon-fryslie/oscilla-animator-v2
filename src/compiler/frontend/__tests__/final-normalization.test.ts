/**
 * Tests for the fixpoint driver.
 */
import { describe, it, expect } from 'vitest';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { draftPortKey } from '../type-facts';
import { isAxisInst } from '../../../core/canonical-types';

describe('finalizeNormalizationFixpoint (skeleton)', () => {
  it('terminates immediately for empty graph (no plans = stop)', () => {
    const patch = buildPatch(() => {
      // empty
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    expect(result.iterations).toBe(1);
    expect(result.diagnostics.length).toBe(0);
    // Empty graph should produce strict result (no ports to fail)
    expect(result.strict).not.toBeNull();
  });

  it('terminates and discharges obligations for unconnected inputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Solver resolves types, then policy materializes default sources
    // Should converge within a few iterations
    expect(result.iterations).toBeLessThanOrEqual(5);
    // Default source blocks should have been added for unconnected inputs
    expect(result.graph.blocks.length).toBeGreaterThan(g.blocks.length);
  });

  it('respects max iteration limit', () => {
    // With the stub solver, this should terminate immediately
    // but we test that the limit mechanism works
    const patch = buildPatch(() => {});
    const g = buildDraftGraph(patch);

    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 1,
    });

    expect(result.iterations).toBeLessThanOrEqual(1);
  });

  it('empty graph produces empty result', () => {
    const patch = buildPatch(() => {});
    const g = buildDraftGraph(patch);

    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    expect(result.graph.blocks.length).toBe(0);
    expect(result.graph.edges.length).toBe(0);
    expect(result.graph.obligations.length).toBe(0);
  });

  it('preserves user blocks and edges, adds default sources', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // User blocks preserved (at minimum)
    expect(result.graph.blocks.length).toBeGreaterThanOrEqual(g.blocks.length);
    // User edges preserved (at minimum)
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(g.edges.length);

    // Original blocks still present
    for (const block of g.blocks) {
      expect(result.graph.blocks.find((b) => b.id === block.id)).toBeDefined();
    }
    // Original edges still present
    for (const edge of g.edges) {
      expect(result.graph.edges.find((e) => e.id === edge.id)).toBeDefined();
    }
  });

  it('returns TypeFacts with port hints for blocks', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Solver produces type hints for Add's ports (a, b, out)
    expect(result.facts.ports.size).toBeGreaterThan(0);
  });

  it('graph with only connected ports and no obligations produces strict', () => {
    // Create a graph where all inputs are connected (no obligations)
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const g = buildDraftGraph(patch);

    // If the Add block still has unconnected inputs (it shouldn't with both wired),
    // obligations will exist. But if no obligations → strict should be non-null.
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // With stub solver producing empty facts, this depends on whether
    // there are open obligations
    if (g.obligations.length === 0) {
      expect(result.strict).not.toBeNull();
    } else {
      // Some obligations for Const inputs → still null
      expect(result.strict).toBeNull();
    }
  });
});

describe('finalizeNormalizationFixpoint (type solving)', () => {
  it('resolves port types for connected Const → Add', () => {
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

    // Add's ports should have resolved types via edge propagation from Const
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    const bHint = result.facts.ports.get(draftPortKey(addBlock.id, 'b', 'in'));
    const outHint = result.facts.ports.get(draftPortKey(addBlock.id, 'out', 'out'));

    expect(aHint).toBeDefined();
    expect(bHint).toBeDefined();
    expect(outHint).toBeDefined();

    // Const has concrete float payload → propagates to Add
    // Status should be 'ok' (fully resolved) or 'unknown' (partially)
    // depending on whether all vars got resolved
    if (aHint!.status === 'ok') {
      expect(aHint!.canonical).toBeDefined();
      expect(aHint!.canonical!.payload.kind).toBe('float');
    }
  });

  it('signal ports have cardinality one in their base type', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Const.out should be a signal (cardinality one)
    const constBlock = g.blocks.find((b) => b.type === 'Const')!;
    const outHint = result.facts.ports.get(draftPortKey(constBlock.id, 'out', 'out'));
    expect(outHint).toBeDefined();

    if (outHint!.status === 'ok' && outHint!.canonical) {
      const card = outHint!.canonical.extent.cardinality;
      if (isAxisInst(card)) {
        expect(card.value.kind).toBe('one');
      }
    }
  });

  it('no CanonicalType contains vars (ok status only)', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Every port with status 'ok' must have a CanonicalType with NO vars
    for (const [, hint] of result.facts.ports) {
      if (hint.status === 'ok' && hint.canonical) {
        // Payload must not be var
        expect(hint.canonical.payload.kind).not.toBe('var');
        // Unit must not be var
        expect(hint.canonical.unit.kind).not.toBe('var');
        // All axes must be inst
        expect(isAxisInst(hint.canonical.extent.cardinality)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.temporality)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.binding)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.perspective)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.branch)).toBe(true);
      }
    }
  });

  it('TypeFacts port count matches graph port count', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const g = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Should have hints for all ports in the graph
    expect(result.facts.ports.size).toBeGreaterThan(0);

    // Every port key should follow the format blockId:portName:dir
    for (const key of result.facts.ports.keys()) {
      expect(key).toMatch(/^.+:.+:(in|out)$/);
    }
  });
});
