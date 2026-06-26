/**
 * src/pillars/types/solve/__tests__/fixpoint.test.ts
 *
 * End-to-end fixpoint driver tests. Each test runs `resolveTypes` on a fully
 * constructed graph + catalog and inspects `FixpointResult`. Tests are
 * black-box over the iteration internals — they pin convergence paths, not
 * internal state. [LAW:behavior-not-structure]
 *
 * Seven scenarios:
 *   1. Identity — fully typed, no missing edges → converges in 1 iteration
 *   2. Adapter insertion — incompatible unit edge → adapter block inserted
 *   3. Default source — unconnected input → DefaultSource block inserted
 *   4. Broadcast insertion — one→many cardinality conflict → Broadcast block
 *   5. Payload anchor — polymorphic chain → CheaterAdapterUsed diagnostic
 *   6. Open obligation — edge mismatch with no adapter in catalog → OpenObligation
 *   7. Non-convergence — always-mismatch oscillator → NonConvergence diagnostic
 */

import { describe, it, expect } from 'vitest';
import {
  canonical,
  zFloat,
  instanceRef,
  type ZAdapterSpec,
  type ZInferenceCanonicalType,
  payloadVar,
  unitVar,
  cardinalityVar,
} from '../../schemas';
import type { DefinedBlock } from '../../../block-api';
import { resolveTypes, makeMutableGraph } from '../fixpoint';
import type { MutableBlock, MutableEdge } from '../typed-graph';

// ---------------------------------------------------------------------------
// Graph builder helpers
// ---------------------------------------------------------------------------

const userOrigin = { kind: 'user' as const };

function block(
  id: string,
  type: string,
  contract: import('../../schemas').ZBlockContract,
): MutableBlock {
  return { id, type, origin: userOrigin, syntheticContract: contract };
}

function edge(
  id: string,
  source: string,
  outputSlot: string,
  target: string,
  inputSlot: string,
): MutableEdge {
  return { id, source, outputSlot, target, inputSlot, origin: userOrigin };
}

/** A block with one input and one output of the given type. */
function throughBlock(
  id: string,
  type: string,
  inputType: ZInferenceCanonicalType,
  outputType: ZInferenceCanonicalType,
): MutableBlock {
  return block(id, type, {
    inputs: { input: { id: 'input', dir: 'in', type: { value: inputType } } },
    outputs: { output: { id: 'output', dir: 'out', type: { value: outputType } } },
  });
}

/** A source block with one output of the given type. */
function sourceBlock(
  id: string,
  type: string,
  outputType: ZInferenceCanonicalType,
): MutableBlock {
  return block(id, type, {
    inputs: {},
    outputs: { output: { id: 'output', dir: 'out', type: { value: outputType } } },
  });
}

/** A sink block with one input of the given type. */
function sinkBlock(
  id: string,
  type: string,
  inputType: ZInferenceCanonicalType,
): MutableBlock {
  return block(id, type, {
    inputs: { input: { id: 'input', dir: 'in', type: { value: inputType } } },
    outputs: {},
  });
}

/** An adapter DefinedBlock (one in, one out). */
function adapterEntry(
  type: string,
  inputField: ZInferenceCanonicalType,
  outputField: ZInferenceCanonicalType,
  spec: ZAdapterSpec = { description: type },
): DefinedBlock {
  return {
    type,
    adapterSpec: spec,
    contract: {
      inputs: { in: { id: 'in', dir: 'in', type: { value: inputField } } },
      outputs: { out: { id: 'out', dir: 'out', type: { value: outputField } } },
    },
  };
}

// Concrete type shorthands
const floatNone = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' });
const floatDeg = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'degrees' } });
const floatRad = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'radians' } });
const floatMany = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, {
    extent: {
      cardinality: { kind: 'many', instance: instanceRef('inst:test') },
      temporality: { kind: 'continuous' },
      binding: { kind: 'unbound' },
      perspective: { kind: 'default' },
      branch: { kind: 'default' },
    },
  });

// ---------------------------------------------------------------------------
// 1. Identity — fully typed, already connected → 1 iteration, strict non-null
// ---------------------------------------------------------------------------

describe('resolveTypes — identity graph', () => {
  it('converges in 1 iteration with strict result when graph is fully typed', () => {
    // A source → sink, both float. No missing edges, no conflicts.
    const src = sourceBlock('src', 'Source', floatNone());
    const snk = sinkBlock('snk', 'Sink', floatNone());
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const graph = makeMutableGraph([src, snk], [e1]);
    const result = resolveTypes(graph, []);

    expect(result.iterations).toBe(1);
    expect(result.strict).not.toBeNull();
    expect(result.diagnostics).toHaveLength(0);
    // Both ports should be 'ok'
    const portKeys = [...result.facts.ports.keys()];
    expect(portKeys.length).toBeGreaterThan(0);
    for (const [, hint] of result.facts.ports) {
      expect(hint.status).toBe('ok');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Adapter insertion — degrees → radians edge, DegToRad adapter in catalog
// ---------------------------------------------------------------------------

describe('resolveTypes — adapter insertion', () => {
  it('inserts an adapter block on a unit-mismatched edge and converges', () => {
    const src = sourceBlock('src', 'DegSource', floatDeg());
    const snk = sinkBlock('snk', 'RadSink', floatRad());
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const graph = makeMutableGraph([src, snk], [e1]);
    const catalog: DefinedBlock[] = [
      adapterEntry('DegToRad', floatDeg(), floatRad()),
    ];

    const result = resolveTypes(graph, catalog);

    expect(result.diagnostics.filter((d) => d.code === 'OpenObligation')).toHaveLength(0);
    expect(result.strict).not.toBeNull();

    // A DegToRad block should have been inserted
    const adapterBlocks = result.graph.blocks.filter((b) => b.type === 'DegToRad');
    expect(adapterBlocks).toHaveLength(1);

    // The original edge e1 should be gone (replaced by two edges)
    const edgeIds = result.graph.edges.map((e) => e.id);
    expect(edgeIds).not.toContain('e1');
  });
});

// ---------------------------------------------------------------------------
// 3. Default source — block with no incoming edge → DefaultSource inserted
// ---------------------------------------------------------------------------

describe('resolveTypes — default source', () => {
  it('inserts a DefaultSource for every disconnected input port', () => {
    // A sink with no source.
    const snk = sinkBlock('snk', 'FloatSink', floatNone());
    const graph = makeMutableGraph([snk], []);
    const result = resolveTypes(graph, []);

    expect(result.diagnostics.filter((d) => d.code === 'OpenObligation')).toHaveLength(0);

    // A _sys/DefaultSource block should exist
    const defaultSources = result.graph.blocks.filter((b) => b.type === '_sys/DefaultSource');
    expect(defaultSources).toHaveLength(1);

    // There should be an edge from it to snk:input
    const edgeToSnk = result.graph.edges.find((e) => e.target === 'snk' && e.inputSlot === 'input');
    expect(edgeToSnk).toBeDefined();
    expect(edgeToSnk?.source).toBe(defaultSources[0].id);
  });
});

// ---------------------------------------------------------------------------
// 4. Broadcast insertion — one→many cardinality conflict
// ---------------------------------------------------------------------------

describe('resolveTypes — broadcast insertion', () => {
  it('inserts a Broadcast block when a one-cardinality source feeds a many-cardinality input', () => {
    const src = sourceBlock('src', 'OneSource', floatNone()); // cardinality one (default)
    const snk = sinkBlock('snk', 'ManySink', floatMany());    // cardinality many
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const graph = makeMutableGraph([src, snk], [e1]);
    const result = resolveTypes(graph, []);

    // Should not leave an open obligation about the cardinality conflict
    const openObs = result.diagnostics.filter((d) => d.code === 'OpenObligation');
    expect(openObs).toHaveLength(0);

    // A Broadcast block should have been inserted
    const broadcasts = result.graph.blocks.filter((b) => b.type === '_sys/Broadcast');
    expect(broadcasts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Payload anchor — polymorphic chain with no concrete payload evidence
// ---------------------------------------------------------------------------

describe('resolveTypes — payload anchor', () => {
  it('emits CheaterAdapterUsed when payload anchor must default to float', () => {
    // Two blocks with shared payload var P — no concrete evidence for P
    const polyType = (): ZInferenceCanonicalType => ({
      payload: payloadVar('P'),
      unit: { kind: 'none' },
      extent: {
        cardinality: { kind: 'one' },
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    });

    const src = sourceBlock('src', 'PolySource', polyType());
    const snk = sinkBlock('snk', 'PolySink', polyType());
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const graph = makeMutableGraph([src, snk], [e1]);
    const result = resolveTypes(graph, []);

    const cheaterDiags = result.diagnostics.filter((d) => d.code === 'CheaterAdapterUsed');
    expect(cheaterDiags.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Open obligation — mismatch with no adapter in catalog → OpenObligation
// ---------------------------------------------------------------------------

describe('resolveTypes — open obligation', () => {
  it('emits OpenObligation when edge has type conflict and no adapter is available', () => {
    // vec2 → vec3 mismatch: no adapter in catalog
    const src = sourceBlock('src', 'Vec2Source', canonical({ kind: 'vec2' }));
    const snk = sinkBlock('snk', 'Vec3Sink', canonical({ kind: 'vec3' }));
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const graph = makeMutableGraph([src, snk], [e1]);
    const result = resolveTypes(graph, []); // empty catalog

    const openObs = result.diagnostics.filter((d) => d.code === 'OpenObligation');
    expect(openObs.length).toBeGreaterThanOrEqual(1);
    expect(result.strict).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Non-convergence — pathological graph hits maxIterations
// ---------------------------------------------------------------------------

describe('resolveTypes — non-convergence', () => {
  it('returns NonConvergence diagnostic and strict:null when maxIterations exceeded', () => {
    // To force non-convergence we cap at 1 iteration with a graph that needs 2.
    // A sink with no source needs 2 iterations: first creates missingInput obligation,
    // second discharges it. With maxIterations:1 it can't converge.
    const snk = sinkBlock('snk', 'FloatSink', floatNone());
    const graph = makeMutableGraph([snk], []);

    const result = resolveTypes(graph, [], { maxIterations: 1 });

    const ncDiags = result.diagnostics.filter((d) => d.code === 'NonConvergence');
    expect(ncDiags).toHaveLength(1);
    expect(result.strict).toBeNull();
    expect(result.iterations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Determinism — same graph produces bit-identical result
// ---------------------------------------------------------------------------

describe('resolveTypes — determinism', () => {
  it('produces bit-identical graphs across two runs on the same input', () => {
    const src = sourceBlock('src', 'DegSource', floatDeg());
    const snk = sinkBlock('snk', 'RadSink', floatRad());
    const e1 = edge('e1', 'src', 'output', 'snk', 'input');

    const catalog: DefinedBlock[] = [
      adapterEntry('DegToRad', floatDeg(), floatRad()),
    ];

    const g1 = makeMutableGraph([src, snk], [e1]);
    const g2 = makeMutableGraph([src, snk], [e1]);

    const r1 = resolveTypes(g1, catalog);
    const r2 = resolveTypes(g2, catalog);

    // Same blocks, same edges (same IDs in same order)
    const blockIds1 = r1.graph.blocks.map((b) => b.id);
    const blockIds2 = r2.graph.blocks.map((b) => b.id);
    expect(blockIds1).toEqual(blockIds2);

    const edgeIds1 = r1.graph.edges.map((e) => e.id);
    const edgeIds2 = r2.graph.edges.map((e) => e.id);
    expect(edgeIds1).toEqual(edgeIds2);

    expect(r1.iterations).toBe(r2.iterations);
    expect(r1.diagnostics.map((d) => d.stableKey)).toEqual(r2.diagnostics.map((d) => d.stableKey));
  });
});
