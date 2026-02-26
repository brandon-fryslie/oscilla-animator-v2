/**
 * Tests for createDerivedObligations.
 */
import { describe, it, expect } from 'vitest';
import { createDerivedObligations } from '../create-derived-obligations';
import type { DraftGraph, DraftBlock, DraftEdge } from '../draft-graph';
import type { TypeFacts, DraftPortKey, PortTypeHint } from '../type-facts';
import { draftPortKey } from '../type-facts';
import { canonicalScalar, canonicalMany, canonicalType, FLOAT, instanceRef, unitNone, contractClamp01, cardinalityOne, temporalityContinuous, axisInst, DEFAULT_BINDING, DEFAULT_PERSPECTIVE, DEFAULT_BRANCH } from '../../../core/canonical-types';
import type { CanonicalType, Extent } from '../../../core/canonical-types';
import type { ObligationId } from '../obligations';
import type { InferenceCanonicalType } from '../../../core/inference-types';

// =============================================================================
// Helpers
// =============================================================================

function makeFacts(entries: [DraftPortKey, PortTypeHint][]): TypeFacts {
  return { ports: new Map(entries), instances: new Map(), portAcceptance: new Map() };
}

function okHint(ct: CanonicalType): PortTypeHint {
  return { status: 'ok', canonical: ct, diagIds: [] };
}

function unknownHint(): PortTypeHint {
  return { status: 'unknown', diagIds: [] };
}

/** Create a hint with an unresolved payload var — the shape derivePayloadAnchorObligation looks for. */
function unresolvedPayloadHint(payloadVarId: string): PortTypeHint {
  const ONE_EXTENT: Extent = {
    cardinality: cardinalityOne(),
    temporality: temporalityContinuous(),
    binding: axisInst(DEFAULT_BINDING),
    perspective: axisInst(DEFAULT_PERSPECTIVE),
    branch: axisInst(DEFAULT_BRANCH),
  };
  const inference: InferenceCanonicalType = {
    payload: { kind: 'var', id: payloadVarId },
    unit: unitNone(),
    extent: ONE_EXTENT,
  };
  return { status: 'unknown', inference, diagIds: [] };
}

const ONE_FLOAT = canonicalScalar(FLOAT);
const FIELD_FLOAT = canonicalMany(FLOAT, undefined, instanceRef('circle', 'inst0'));

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
    portDefaults: {},
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
    alias: `${fromBlockId}.${fromPort}`,
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
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('add', 'a', 'in'), okHint(ONE_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('creates adapter obligation when types differ (one→many)', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'controlPoints')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('ri', 'controlPoints', 'in'), okHint(FIELD_FLOAT)],
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
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'controlPoints')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('ri', 'controlPoints', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obs1 = createDerivedObligations(g, facts);
    const obs2 = createDerivedObligations(g, facts);
    expect(obs1[0].id).toBe(obs2[0].id);
    expect(obs1[0].id).toBe('needsAdapter:c1:out->ri:controlPoints');
  });

  it('skips edges where either endpoint is not resolved', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('add', 'Add')],
      edges: [makeEdge('e1', 'c1', 'out', 'add', 'a')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('add', 'a', 'in'), unknownHint()],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('skips elaborated edges (prevents loops)', () => {
    const oblId = 'someObligation' as ObligationId;

    const elaboratedEdge: DraftEdge = {
      id: 'e1',
      from: { blockId: 'c1', port: 'out', dir: 'out' },
      to: { blockId: 'ri', port: 'controlPoints', dir: 'in' },
      alias: 'c1.out',
      role: 'userWire',
      origin: { kind: 'elaboration', obligationId: oblId, role: 'adapter' },
    };

    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [elaboratedEdge],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('ri', 'controlPoints', 'in'), okHint(FIELD_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('skips implicitCoerce edges', () => {
    const coerceEdge: DraftEdge = {
      id: 'e1',
      from: { blockId: 'c1', port: 'out', dir: 'out' },
      to: { blockId: 'ri', port: 'controlPoints', dir: 'in' },
      alias: 'c1.out',
      role: 'implicitCoerce',
      origin: 'user',
    };

    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [coerceEdge],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('ri', 'controlPoints', 'in'), okHint(FIELD_FLOAT)],
    ]);

    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('contract-only difference is assignable (clamp01 → none), no obligation', () => {
    const SCALAR_CLAMP01 = canonicalType(FLOAT, unitNone(), undefined, contractClamp01());
    const SCALAR_NONE = canonicalType(FLOAT, unitNone());

    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('add', 'Add')],
      edges: [makeEdge('e1', 'c1', 'out', 'add', 'a')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(SCALAR_CLAMP01)],
      [draftPortKey('add', 'a', 'in'), okHint(SCALAR_NONE)],
    ]);

    // Contract dropping is assignable — no adapter obligation created
    expect(createDerivedObligations(g, facts)).toEqual([]);
  });

  it('deps reference both edge endpoints', () => {
    const g = emptyGraph({
      blocks: [makeBlock('c1', 'Const'), makeBlock('ri', 'RenderInstances2D')],
      edges: [makeEdge('e1', 'c1', 'out', 'ri', 'controlPoints')],
    });

    const facts = makeFacts([
      [draftPortKey('c1', 'out', 'out'), okHint(ONE_FLOAT)],
      [draftPortKey('ri', 'controlPoints', 'in'), okHint(FIELD_FLOAT)],
    ]);

    const obs = createDerivedObligations(g, facts);
    expect(obs[0].deps.length).toBe(2);
    expect(obs[0].deps[0]).toEqual({ kind: 'portCanonicalizable', port: { blockId: 'c1', port: 'out', dir: 'out' } });
    expect(obs[0].deps[1]).toEqual({ kind: 'portCanonicalizable', port: { blockId: 'ri', port: 'controlPoints', dir: 'in' } });
  });
});

// =============================================================================
// Payload anchor determinism tests
// =============================================================================

describe('derivePayloadAnchorObligation determinism', () => {
  it('same-prefix port keys are distinguished by full key, not first char', () => {
    // Two components whose smallest port keys share a prefix ('add' vs 'addExtra').
    // With charCodeAt(0) both start with 'a' (97) — tie-break was arbitrary.
    // With full-key sort, 'add:out:out' < 'addExtra:out:out' deterministically.
    const g = emptyGraph({
      blocks: [
        makeBlock('add', 'Generic'),
        makeBlock('addExtra', 'Generic'),
        makeBlock('sink1', 'Generic'),
        makeBlock('sink2', 'Generic'),
      ],
      edges: [
        makeEdge('e1', 'add', 'out', 'sink1', 'in'),
        makeEdge('e2', 'addExtra', 'out', 'sink2', 'in'),
      ],
    });

    // Component 1 (var 'pv_A'): ports on 'add' and 'sink1'
    // Component 2 (var 'pv_B'): ports on 'addExtra' and 'sink2'
    const facts = makeFacts([
      [draftPortKey('add', 'out', 'out'), unresolvedPayloadHint('pv_A')],
      [draftPortKey('sink1', 'in', 'in'), unresolvedPayloadHint('pv_A')],
      [draftPortKey('addExtra', 'out', 'out'), unresolvedPayloadHint('pv_B')],
      [draftPortKey('sink2', 'in', 'in'), unresolvedPayloadHint('pv_B')],
    ]);

    const obs = createDerivedObligations(g, facts);
    const anchor = obs.find((o) => o.kind === 'needsPayloadAnchor');
    expect(anchor).toBeDefined();
    // Component with 'add:out:out' sorts before 'addExtra:out:out'
    expect(anchor!.id).toBe('needsPayloadAnchor:add:out:out->sink1:in:in');
  });

  it('produces identical output across repeated calls (idempotent determinism)', () => {
    const g = emptyGraph({
      blocks: [
        makeBlock('b1', 'Generic'),
        makeBlock('b2', 'Generic'),
      ],
      edges: [
        makeEdge('e1', 'b1', 'out', 'b2', 'in'),
      ],
    });

    const facts = makeFacts([
      [draftPortKey('b1', 'out', 'out'), unresolvedPayloadHint('pv_X')],
      [draftPortKey('b2', 'in', 'in'), unresolvedPayloadHint('pv_X')],
    ]);

    const results = Array.from({ length: 5 }, () => createDerivedObligations(g, facts));
    const ids = results.map((r) => r.find((o) => o.kind === 'needsPayloadAnchor')?.id);
    // All five calls produce the same obligation ID
    expect(new Set(ids).size).toBe(1);
  });

  it('selects component with lexicographically smaller full port key when prefixes match', () => {
    // Port keys: 'x1:p:out' vs 'x10:p:out' — charCodeAt(0) identical ('x'),
    // but full string sort picks 'x1:p:out' before 'x10:p:out'.
    const g = emptyGraph({
      blocks: [
        makeBlock('x1', 'Generic'),
        makeBlock('x10', 'Generic'),
        makeBlock('dst1', 'Generic'),
        makeBlock('dst10', 'Generic'),
      ],
      edges: [
        makeEdge('e1', 'x1', 'p', 'dst1', 'q'),
        makeEdge('e2', 'x10', 'p', 'dst10', 'q'),
      ],
    });

    const facts = makeFacts([
      [draftPortKey('x1', 'p', 'out'), unresolvedPayloadHint('pv_short')],
      [draftPortKey('dst1', 'q', 'in'), unresolvedPayloadHint('pv_short')],
      [draftPortKey('x10', 'p', 'out'), unresolvedPayloadHint('pv_long')],
      [draftPortKey('dst10', 'q', 'in'), unresolvedPayloadHint('pv_long')],
    ]);

    const obs = createDerivedObligations(g, facts);
    const anchor = obs.find((o) => o.kind === 'needsPayloadAnchor');
    expect(anchor).toBeDefined();
    // 'dst1:q:in' < 'dst10:q:in' and 'x1:p:out' < 'x10:p:out'
    // Component pv_short has smallest key 'dst1:q:in' < 'dst10:q:in'
    expect(anchor!.id).toBe('needsPayloadAnchor:x1:p:out->dst1:q:in');
  });

  it('emits at most one payload anchor obligation per call', () => {
    const g = emptyGraph({
      blocks: [
        makeBlock('a', 'Generic'),
        makeBlock('b', 'Generic'),
        makeBlock('c', 'Generic'),
        makeBlock('d', 'Generic'),
      ],
      edges: [
        makeEdge('e1', 'a', 'out', 'b', 'in'),
        makeEdge('e2', 'c', 'out', 'd', 'in'),
      ],
    });

    const facts = makeFacts([
      [draftPortKey('a', 'out', 'out'), unresolvedPayloadHint('pv_1')],
      [draftPortKey('b', 'in', 'in'), unresolvedPayloadHint('pv_1')],
      [draftPortKey('c', 'out', 'out'), unresolvedPayloadHint('pv_2')],
      [draftPortKey('d', 'in', 'in'), unresolvedPayloadHint('pv_2')],
    ]);

    const obs = createDerivedObligations(g, facts);
    const anchors = obs.filter((o) => o.kind === 'needsPayloadAnchor');
    expect(anchors.length).toBe(1);
  });
});
