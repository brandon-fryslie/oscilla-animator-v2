/**
 * Tests for AdapterPolicy.
 */
import { describe, it, expect } from 'vitest';
import { adapterPolicyV1 } from '../policies/adapter-policy';
import type { PolicyContext } from '../policies/policy-types';
import type { DraftGraph, DraftBlock, DraftEdge } from '../draft-graph';
import type { TypeFacts, DraftPortKey, PortTypeHint } from '../type-facts';
import { draftPortKey, getPortHint } from '../type-facts';
import { canonicalSignal, canonicalField, FLOAT } from '../../../core/canonical-types';
import { instanceRef } from '../../../core/canonical-types';
import type { CanonicalType } from '../../../core/canonical-types';
import type { Obligation, ObligationId } from '../obligations';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';

// =============================================================================
// Helpers
// =============================================================================

const SIGNAL_FLOAT = canonicalSignal(FLOAT);
const FIELD_FLOAT = canonicalField(FLOAT, undefined, instanceRef('circle', 'inst0'));

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

function makeEdge(id: string, fromBlockId: string, fromPort: string, toBlockId: string, toPort: string): DraftEdge {
  return {
    id,
    from: { blockId: fromBlockId, port: fromPort, dir: 'out' },
    to: { blockId: toBlockId, port: toPort, dir: 'in' },
    role: 'userWire',
    origin: 'user',
  };
}

function emptyGraph(overrides?: Partial<DraftGraph>): DraftGraph {
  return {
    blocks: [],
    edges: [],
    obligations: [],
    meta: { revision: 0, provenance: 'test' },
    ...overrides,
  };
}

function makeObligation(
  id: string,
  edgeId: string,
  fromBlockId: string,
): Obligation {
  return {
    id: id as ObligationId,
    kind: 'needsAdapter',
    anchor: { edgeId, blockId: fromBlockId },
    status: { kind: 'open' },
    deps: [],
    policy: { name: 'adapters.v1', version: 1 },
    debug: { createdBy: 'test' },
  };
}

function makeFacts(entries: [DraftPortKey, PortTypeHint][]): TypeFacts {
  return { ports: new Map(entries), instances: new Map() };
}

function okHint(ct: CanonicalType): PortTypeHint {
  return { status: 'ok', canonical: ct, diagIds: [] };
}

function makeCtx(g: DraftGraph, facts: TypeFacts): PolicyContext {
  return {
    graph: g,
    registry: BLOCK_DEFS_BY_TYPE,
    facts,
    getHint: (port) => getPortHint(facts, port.blockId, port.port, port.dir),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AdapterPolicy (adapters.v1)', () => {
  it('produces a plan with Broadcast adapter for signal→field mismatch', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obl = makeObligation('needsAdapter:c1:out->ri:pos', 'e1', 'c1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      // Should add a Broadcast adapter block
      expect(result.plan.addBlocks).toBeDefined();
      expect(result.plan.addBlocks!.length).toBe(1);
      expect(result.plan.addBlocks![0].type).toBe('Broadcast');

      // Should replace the original edge with two new edges
      expect(result.plan.replaceEdges).toBeDefined();
      expect(result.plan.replaceEdges!.length).toBe(1);
      expect(result.plan.replaceEdges![0].remove).toBe('e1');
      expect(result.plan.replaceEdges![0].add.length).toBe(2);
    }
  });

  it('adapter block has elaboration origin', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obl = makeObligation('needsAdapter:c1:out->ri:pos', 'e1', 'c1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      const adapterBlock = result.plan.addBlocks![0];
      expect(typeof adapterBlock.origin).toBe('object');
      if (typeof adapterBlock.origin === 'object') {
        expect(adapterBlock.origin.kind).toBe('elaboration');
        expect(adapterBlock.origin.role).toBe('adapter');
      }
    }
  });

  it('replacement edges have implicitCoerce role', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obl = makeObligation('needsAdapter:c1:out->ri:pos', 'e1', 'c1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      for (const edge of result.plan.replaceEdges![0].add) {
        expect(edge.role).toBe('implicitCoerce');
      }
    }
  });

  it('returns blocked when edge is not found', () => {
    const g = emptyGraph();
    const facts = makeFacts([]);

    const obl = makeObligation('needsAdapter:c1:out->ri:pos', 'nonexistent', 'c1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('blocked');
  });

  it('returns blocked when no adapter exists for the conversion', () => {
    // float→bool with no adapter
    const boolType: CanonicalType = {
      ...SIGNAL_FLOAT,
      payload: { kind: 'bool' },
      unit: { kind: 'none' },
    };

    const g = emptyGraph({
      blocks: [makeBlock('b1', 'SomeBlock'), makeBlock('b2', 'OtherBlock')],
      edges: [makeEdge('e1', 'b1', 'out', 'b2', 'in')],
    });

    const facts = makeFacts([
      [draftPortKey('b1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('b2', 'in', 'in'), okHint(boolType)],
    ]);

    const obl = makeObligation('needsAdapter:b1:out->b2:in', 'e1', 'b1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('blocked');
  });

  it('returns blocked when edgeId anchor is missing', () => {
    const g = emptyGraph();
    const facts = makeFacts([]);

    const obl: Obligation = {
      id: 'needsAdapter:test' as ObligationId,
      kind: 'needsAdapter',
      anchor: { blockId: 'c1' }, // Missing edgeId
      status: { kind: 'open' },
      deps: [],
      policy: { name: 'adapters.v1', version: 1 },
      debug: { createdBy: 'test' },
    };

    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));
    expect(result.kind).toBe('blocked');
  });

  it('adapter block ID is deterministic and keyed by obligation ID', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const oblId = 'needsAdapter:c1:out->ri:pos';
    const obl = makeObligation(oblId, 'e1', 'c1');
    const result = adapterPolicyV1.plan(obl, makeCtx(g, facts));

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      expect(result.plan.addBlocks![0].id).toBe(`_adapter_${oblId}`);
    }
  });
});
