/**
 * Tests for createDerivedObligations.
 */
import { describe, it, expect } from 'vitest';
import { createDerivedObligations } from '../create-derived-obligations';
import type { DraftGraph, DraftBlock, DraftEdge } from '../draft-graph';
import type { TypeFacts, DraftPortKey, PortTypeHint } from '../type-facts';
import { draftPortKey } from '../type-facts';
import { canonicalSignal, canonicalField, FLOAT, instanceRef } from '../../../core/canonical-types';
import type { CanonicalType } from '../../../core/canonical-types';
import type { ObligationId } from '../obligations';

// =============================================================================
// Helpers
// =============================================================================

function makeFacts(entries: [DraftPortKey, PortTypeHint][]): TypeFacts {
  return { ports: new Map(entries) };
}

function okHint(ct: CanonicalType): PortTypeHint {
  return { status: 'ok', canonical: ct, diagIds: [] };
}

function unknownHint(): PortTypeHint {
  return { status: 'unknown', diagIds: [] };
}

const SIGNAL_FLOAT = canonicalSignal(FLOAT);
const FIELD_FLOAT = canonicalField(FLOAT, undefined, instanceRef('circle', 'inst0'));

function emptyGraph(overrides?: Partial<DraftGraph>): DraftGraph {
  return {
    blocks: [],
    edges: [],
    obligations: [],
    meta: { revision: 0, provenance: 'test' },
    ...overrides,
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

function makeEdge(id: string, fromBlockId: string, fromPort: string, toBlockId: string, toPort: string): DraftEdge {
  return {
    id,
    from: { blockId: fromBlockId, port: fromPort, dir: 'out' },
    to: { blockId: toBlockId, port: toPort, dir: 'in' },
    role: 'userWire',
    origin: 'user',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('createDerivedObligations', () => {
  it('returns empty array for empty graph', () => {
    const g = emptyGraph();
    const facts = makeFacts([]);
    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('returns empty array when types are equal', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('add', 'Add')],
      edges: [makeEdge('e1', 'c1', 'out', 'add', 'a')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('add', 'a', 'in'), okHint(SIGNAL_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('creates adapter obligation when types differ (signal→field)', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obs = createDerivedObligations(g, facts);
    expect(obs.length).toBe(1);
    expect(obs[0].kind).toBe('needsAdapter');
    expect(obs[0].policy.name).toBe('adapters.v1');
    expect(obs[0].anchor.edgeId).toBe('e1');
  });

  it('generates deterministic obligation IDs', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obs1 = createDerivedObligations(g, facts);
    const obs2 = createDerivedObligations(g, facts);
    expect(obs1[0].id).toBe(obs2[0].id);
    expect(obs1[0].id).toBe('needsAdapter:c1:out->ri:pos');
  });

  it('skips edges where either endpoint is not resolved', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('add', 'Add')],
      edges: [makeEdge('e1', 'c1', 'out', 'add', 'a')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('add', 'a', 'in'), unknownHint()],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('skips elaborated edges (prevents loops)', () => {
    const oblId = 'someObligation' as ObligationId;

    const elaboratedEdge: DraftEdge = {
      id: 'e1',
      from: { blockId: 'c1', port: 'out', dir: 'out' },
      to: { blockId: 'ri', port: 'pos', dir: 'in' },
      role: 'userWire',
      origin: { kind: 'elaboration', obligationId: oblId, role: 'adapter' },
    };

    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [elaboratedEdge],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('skips implicitCoerce edges', () => {
    const coerceEdge: DraftEdge = {
      id: 'e1',
      from: { blockId: 'c1', port: 'out', dir: 'out' },
      to: { blockId: 'ri', port: 'pos', dir: 'in' },
      role: 'implicitCoerce',
      origin: 'user',
    };

    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [coerceEdge],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('deps reference both edge endpoints', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'pos')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SIGNAL_FLOAT)],
      [draftPortKey('ri', 'pos', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obs = createDerivedObligations(g, facts);
    expect(obs[0].deps.length).toBe(2);
    expect(obs[0].deps[0]).toEqual({ kind: 'portCanonicalizable', port: { blockId: 'c1', port: 'out', dir: 'out' } });
    expect(obs[0].deps[1]).toEqual({ kind: 'portCanonicalizable', port: { blockId: 'ri', port: 'pos', dir: 'in' } });
  });
});
