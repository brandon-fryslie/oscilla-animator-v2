/**
 * Tests for apply-elaboration.
 */
import { describe, it, expect } from 'vitest';
import { applyElaborationPlan, applyAllPlans } from '../apply-elaboration';
import type { DraftGraph, DraftBlock, DraftEdge } from '../draft-graph';
import type { ElaborationPlan } from '../elaboration';
import type { Obligation, ObligationId } from '../obligations';
import { blockId, portId } from '../../../types';

function makeGraph(overrides?: Partial<DraftGraph>): DraftGraph {
  return {
    blocks: overrides?.blocks ?? [],
    edges: overrides?.edges ?? [],
    obligations: overrides?.obligations ?? [],
    meta: overrides?.meta ?? { revision: 0, provenance: 'test' },
  };
}

function makeObligation(id: string): Obligation {
  return {
    id: id as ObligationId,
    kind: 'missingInputSource',
    anchor: { blockId: 'b0' },
    status: { kind: 'open' },
    deps: [],
    policy: { name: 'defaultSources.v1', version: 1 },
    debug: { createdBy: 'test' },
  };
}

describe('applyElaborationPlan', () => {
  it('adds blocks and edges', () => {
    const obl = makeObligation('obl-1');
    const g = makeGraph({ obligations: [obl] });

    const newBlock: DraftBlock = {
      id: '_ds_b0_pos',
      type: 'Const',
      params: {},
      origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
      displayName: 'Const (default)',
      domainId: null,
      role: { kind: 'derived', meta: { kind: 'defaultSource', target: { kind: 'port', port: { blockId: blockId('b0'), portId: portId('pos') } } } },
    };

    const newEdge: DraftEdge = {
      id: '_e_obl-1_a',
      from: { blockId: '_ds_b0_pos', port: 'out', dir: 'out' },
      to: { blockId: 'b0', port: 'pos', dir: 'in' },
      role: 'defaultWire',
      origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
    };

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [newBlock],
      addEdges: [newEdge],
    };

    const result = applyElaborationPlan(g, plan);

    expect(result.blocks.length).toBe(1);
    expect(result.edges.length).toBe(1);
    expect(result.blocks[0].id).toBe('_ds_b0_pos');
    expect(result.edges[0].id).toBe('_e_obl-1_a');
  });

  it('bumps revision', () => {
    const obl = makeObligation('obl-1');
    const g = makeGraph({ obligations: [obl] });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'new-block',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
        displayName: 'Const',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const result = applyElaborationPlan(g, plan);
    expect(result.meta.revision).toBe(1);
  });

  it('marks obligation as discharged', () => {
    const obl = makeObligation('obl-1');
    const g = makeGraph({ obligations: [obl] });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'new-block',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
        displayName: 'Const',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const result = applyElaborationPlan(g, plan);
    const updatedObl = result.obligations.find((o) => o.id === obl.id);
    expect(updatedObl?.status.kind).toBe('discharged');
  });

  it('re-applying same plan is no-op (idempotent)', () => {
    const obl = makeObligation('obl-1');
    const g = makeGraph({ obligations: [obl] });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'new-block',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
        displayName: 'Const',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const result1 = applyElaborationPlan(g, plan);
    const result2 = applyElaborationPlan(result1, plan);

    // Second application should be no-op
    expect(result2.blocks.length).toBe(result1.blocks.length);
    expect(result2.meta.revision).toBe(result1.meta.revision);
  });

  it('replaces edges correctly', () => {
    const obl = makeObligation('obl-1');
    const existingEdge: DraftEdge = {
      id: 'e0',
      from: { blockId: 'b0', port: 'out', dir: 'out' },
      to: { blockId: 'b1', port: 'in', dir: 'in' },
      role: 'userWire',
      origin: 'user',
    };

    const g = makeGraph({
      edges: [existingEdge],
      obligations: [obl],
    });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'adapter',
      replaceEdges: [{
        remove: 'e0',
        add: [
          {
            id: 'e0_to_adapter',
            from: { blockId: 'b0', port: 'out', dir: 'out' },
            to: { blockId: '_adapter', port: 'in', dir: 'in' },
            role: 'implicitCoerce',
            origin: { kind: 'elaboration', obligationId: obl.id, role: 'adapter' },
          },
          {
            id: 'e0_from_adapter',
            from: { blockId: '_adapter', port: 'out', dir: 'out' },
            to: { blockId: 'b1', port: 'in', dir: 'in' },
            role: 'implicitCoerce',
            origin: { kind: 'elaboration', obligationId: obl.id, role: 'adapter' },
          },
        ],
      }],
    };

    const result = applyElaborationPlan(g, plan);
    expect(result.edges.length).toBe(2);
    expect(result.edges.find((e) => e.id === 'e0')).toBeUndefined();
    expect(result.edges.find((e) => e.id === 'e0_to_adapter')).toBeDefined();
    expect(result.edges.find((e) => e.id === 'e0_from_adapter')).toBeDefined();
  });

  it('throws on partial application (corruption)', () => {
    const obl = makeObligation('obl-1');
    // Graph already has one of the plan's blocks but not the edges
    const existingBlock: DraftBlock = {
      id: 'new-block',
      type: 'Const',
      params: {},
      origin: 'user',
      displayName: 'Const',
      domainId: null,
      role: { kind: 'user', meta: {} },
    };

    const g = makeGraph({
      blocks: [existingBlock],
      obligations: [obl],
    });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [existingBlock],
      addEdges: [{
        id: 'new-edge',
        from: { blockId: 'new-block', port: 'out', dir: 'out' },
        to: { blockId: 'b0', port: 'in', dir: 'in' },
        role: 'defaultWire',
        origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
      }],
    };

    expect(() => applyElaborationPlan(g, plan)).toThrow(/partially applied/);
  });

  it('elaboration is monotone (only adds structure)', () => {
    const obl = makeObligation('obl-1');
    const existingBlock: DraftBlock = {
      id: 'user-block',
      type: 'Add',
      params: {},
      origin: 'user',
      displayName: 'Add',
      domainId: null,
      role: { kind: 'user', meta: {} },
    };

    const g = makeGraph({
      blocks: [existingBlock],
      obligations: [obl],
    });

    const plan: ElaborationPlan = {
      obligationId: obl.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'ds-block',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl.id, role: 'defaultSource' },
        displayName: 'Const',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const result = applyElaborationPlan(g, plan);
    // User block still present
    expect(result.blocks.find((b) => b.id === 'user-block')).toBeDefined();
    // New block added
    expect(result.blocks.find((b) => b.id === 'ds-block')).toBeDefined();
  });
});

describe('applyAllPlans', () => {
  it('applies multiple plans sequentially', () => {
    const obl1 = makeObligation('obl-1');
    const obl2 = makeObligation('obl-2');
    const g = makeGraph({ obligations: [obl1, obl2] });

    const plan1: ElaborationPlan = {
      obligationId: obl1.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'b1',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl1.id, role: 'defaultSource' },
        displayName: 'Const 1',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const plan2: ElaborationPlan = {
      obligationId: obl2.id,
      role: 'defaultSource',
      addBlocks: [{
        id: 'b2',
        type: 'Const',
        params: {},
        origin: { kind: 'elaboration', obligationId: obl2.id, role: 'defaultSource' },
        displayName: 'Const 2',
        domainId: null,
        role: { kind: 'user', meta: {} },
      }],
    };

    const result = applyAllPlans(g, [plan1, plan2]);
    expect(result.blocks.length).toBe(2);
    expect(result.meta.revision).toBe(2);
  });
});
