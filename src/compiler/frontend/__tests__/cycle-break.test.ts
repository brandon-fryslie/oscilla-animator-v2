/**
 * Tests for cycle break obligation creation and fixpoint integration.
 *
 * Verifies that algebraic cycles are detected structurally and resolved
 * via automatic UnitDelay insertion.
 */
import { describe, it, expect } from 'vitest';
import { createCycleBreakObligations } from '../create-cycle-break-obligations';
import type { DraftGraph, DraftEdge, DraftBlock, EdgeOrigin } from '../draft-graph';
import type { ObligationId } from '../obligations';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import '../../../blocks/all'; // Register all blocks
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { finalizeNormalizationFixpoint } from '../final-normalization';

// =============================================================================
// Helper Functions
// =============================================================================

function makeGraph(blocks: DraftBlock[], edges: DraftEdge[]): DraftGraph {
  return {
    blocks,
    edges,
    obligations: [],
    meta: { revision: 0, provenance: 'test' },
  };
}

function makeBlock(id: string, type: string): DraftBlock {
  return {
    id,
    type,
    params: {},
    origin: 'user',
    displayName: type,
    domainId: null,
    role: { kind: 'user', meta: {} },
  };
}

function makeEdge(id: string, from: string, fromPort: string, to: string, toPort: string, origin: EdgeOrigin = 'user'): DraftEdge {
  return {
    id,
    from: { blockId: from, port: fromPort, dir: 'out' },
    to: { blockId: to, port: toPort, dir: 'in' },
    role: 'userWire',
    origin,
  };
}

// =============================================================================
// Unit Tests: createCycleBreakObligations
// =============================================================================

describe('createCycleBreakObligations', () => {
  it('returns empty for empty graph', () => {
    const g = makeGraph([], []);
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(0);
  });

  it('returns empty for acyclic graph (A→B→C)', () => {
    const g = makeGraph(
      [
        makeBlock('a', 'Const'),
        makeBlock('b', 'Add'),
        makeBlock('c', 'Add'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'b', 'a'),
        makeEdge('e2', 'b', 'out', 'c', 'a'),
      ],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(0);
  });

  it('creates obligation for simple 2-block cycle (A→B→A)', () => {
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('b', 'Multiply'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'b', 'a'),
        makeEdge('e2', 'b', 'out', 'a', 'a'),
      ],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('needsCycleBreak');
    expect(result[0].anchor.edgeId).toBeDefined();
    expect(result[0].deps).toEqual([]);
    expect(result[0].policy.name).toBe('cycleBreak.v1');
  });

  it('creates obligation for self-loop (A→A)', () => {
    const g = makeGraph(
      [makeBlock('a', 'Add')],
      [makeEdge('e1', 'a', 'out', 'a', 'a')],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('needsCycleBreak');
    expect(result[0].anchor.edgeId).toBe('e1');
  });

  it('returns empty for cycle with UnitDelay in path', () => {
    // UnitDelay has lowerOutputsOnly, so its outgoing edges don't create same-frame deps
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('delay', 'UnitDelay'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'delay', 'in'),
        makeEdge('e2', 'delay', 'out', 'a', 'a'),
      ],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(0);
  });

  it('creates obligation for cycle with Lag in path (Lag does NOT break same-frame deps)', () => {
    // Lag is stateful but NOT lowerOutputsOnly, so it doesn't break algebraic cycles
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('lag', 'Lag'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'lag', 'in'),
        makeEdge('e2', 'lag', 'out', 'a', 'a'),
      ],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('needsCycleBreak');
  });

  it('returns exactly one obligation when multiple independent SCCs exist', () => {
    // Two separate cycles: A↔B and C↔D
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('b', 'Multiply'),
        makeBlock('c', 'Add'),
        makeBlock('d', 'Multiply'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'b', 'a'),
        makeEdge('e2', 'b', 'out', 'a', 'a'),
        makeEdge('e3', 'c', 'out', 'd', 'a'),
        makeEdge('e4', 'd', 'out', 'c', 'a'),
      ],
    );
    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    // Monotone: at most one obligation per iteration
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('needsCycleBreak');
  });

  it('selects cut edge deterministically across multiple runs', () => {
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('b', 'Multiply'),
      ],
      [
        makeEdge('e1', 'a', 'out', 'b', 'a'),
        makeEdge('e2', 'b', 'out', 'a', 'a'),
      ],
    );

    const result1 = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    const result2 = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);
    expect(result1[0].anchor.edgeId).toBe(result2[0].anchor.edgeId);
  });

  it('prefers cutting non-elaboration edges over elaboration edges', () => {
    const g = makeGraph(
      [
        makeBlock('a', 'Add'),
        makeBlock('b', 'Multiply'),
      ],
      [
        makeEdge('e_elab', 'a', 'out', 'b', 'a', { kind: 'elaboration', obligationId: 'obl1' as ObligationId, role: 'internalHelper' }),
        makeEdge('e_user', 'b', 'out', 'a', 'a', 'user'),
      ],
    );

    const result = createCycleBreakObligations(g, BLOCK_DEFS_BY_TYPE);
    expect(result).toHaveLength(1);
    // Should prefer cutting the user edge
    expect(result[0].anchor.edgeId).toBe('e_user');
  });
});

// =============================================================================
// Integration Test: Fixpoint End-to-End
// =============================================================================

describe('cycle break fixpoint integration', () => {
  it('inserts UnitDelay and breaks cycle', () => {
    // Build a simple 2-block cycle using the Patch API
    const patch = buildPatch((b) => {
      const add1 = b.addBlock('Add', { displayName: 'Add1' });
      const mul1 = b.addBlock('Multiply', { displayName: 'Mul1' });

      // Create cycle: add1.out → mul1.a, mul1.out → add1.a
      b.wire(add1, 'out', mul1, 'a');
      b.wire(mul1, 'out', add1, 'a');
    });

    // Build draft graph
    const { graph: draftGraph } = buildDraftGraph(patch);

    // Run fixpoint
    const result = finalizeNormalizationFixpoint(draftGraph, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
      trace: false,
    });

    // Verify UnitDelay was inserted
    const unitDelayBlocks = result.graph.blocks.filter((b) => b.type === 'UnitDelay');
    expect(unitDelayBlocks.length).toBeGreaterThanOrEqual(1);

    // Verify UnitDelay has elaboration origin
    const unitDelay = unitDelayBlocks[0];
    expect(unitDelay.origin).toMatchObject({ kind: 'elaboration' });

    // Verify original cycle edge was replaced
    // (Note: edge count may increase due to default sources + cycle break)
    const unitDelayEdges = result.graph.edges.filter(
      (e) => e.from.blockId === unitDelay.id || e.to.blockId === unitDelay.id,
    );
    // Should have exactly 2 edges connected to UnitDelay (in and out)
    expect(unitDelayEdges.length).toBe(2);

    // Verify CycleBreakInserted diagnostic is present
    const cycleBreakDiag = result.diagnostics.find(
      (d: any) => d.kind === 'CycleBreakInserted',
    );
    expect(cycleBreakDiag).toBeDefined();
    expect((cycleBreakDiag as any).insertedBlockId).toBe(unitDelay.id);

    // Verify no remaining open obligations
    const openObligations = result.graph.obligations.filter((o) => o.status.kind === 'open');
    expect(openObligations).toHaveLength(0);

    // Verify re-running produces no new insertions (idempotent)
    const result2 = finalizeNormalizationFixpoint(result.graph, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
      trace: false,
    });
    const unitDelayBlocks2 = result2.graph.blocks.filter((b) => b.type === 'UnitDelay');
    expect(unitDelayBlocks2.length).toBe(unitDelayBlocks.length); // No new UnitDelay blocks
  });
});
