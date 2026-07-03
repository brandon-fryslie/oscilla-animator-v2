/**
 * src/pillars/types/__tests__/find-insertable-blocks.test.ts
 *
 * Query-helper contract tests. All scenarios run without calling
 * `resolveTypes`; the `StrictTypedGraph` is constructed directly to isolate
 * the query layer from the fixpoint driver. [LAW:behavior-not-structure]
 *
 * Scenarios:
 *   1. Catalog listing — returns all blocks, no type filtering
 *   2. Context-side direct match — float out → float-input block
 *   3. Context-side adapter match — degrees out → radians-input block + DegToRad
 *   4. Context-side no match — float out → vec2-input block, no adapter
 *   5. Polymorphic slot — var payload/unit matches any source directly
 *   6. Multi-slot — correct matchingSlotId reported when second slot matches
 *   7. Ranking — direct before via-adapter
 *   8. In-port direction — in port queries candidate output slots
 *   9. Benchmark — 1000 queries on 100-block catalog complete in < 5 s
 *  10. Cardinality — a one-cardinality SOURCE into a many target is never
 *      'direct' (the driver inserts a Broadcast there); many→many and
 *      many-source→one-target (silent promotion, no adapter) stay direct
 */

import { describe, it, expect } from 'vitest';
import {
  canonical,
  zFloat,
  zVec2,
  payloadVar,
  unitVar,
  manyExtent,
  instanceRef,
  type ZAdapterSpec,
  type ZInferenceCanonicalType,
  type ZCanonicalType,
} from '../schemas';
import type { DefinedBlock } from '../../block-api';
import { findInsertableBlocks, listCatalogEntries } from '../query';
import { draftPortKey } from '../solve/typed-graph';
import type { StrictTypedGraph, MutableGraph, DraftPortKey } from '../solve/typed-graph';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Cast a concrete (no-var) ZInferenceCanonicalType to ZCanonicalType. */
const asConcrete = (t: ZInferenceCanonicalType): ZCanonicalType =>
  t as unknown as ZCanonicalType;

const floatConcrete = (): ZCanonicalType => asConcrete(zFloat());
const degreesConcrete = (): ZCanonicalType =>
  asConcrete(canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'degrees' } }));

// ---------------------------------------------------------------------------
// Graph fixtures
// ---------------------------------------------------------------------------

const emptyMutableGraph = (): MutableGraph => ({
  blocks: [],
  edges: [],
  obligations: [],
  revision: 0,
});

function makeTypedGraph(portTypes: ReadonlyMap<DraftPortKey, ZCanonicalType>): StrictTypedGraph {
  return { graph: emptyMutableGraph(), portTypes, diagnostics: [] };
}

function portTypes(entries: Record<string, ZCanonicalType>): ReadonlyMap<DraftPortKey, ZCanonicalType> {
  return new Map(
    Object.entries(entries).map(([k, v]) => [k as DraftPortKey, v]),
  );
}

// ---------------------------------------------------------------------------
// Catalog builders
// ---------------------------------------------------------------------------

const degrees = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'degrees' } });

const radians = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'radians' } });

/** A block with one output (no inputs). */
const source = (type: string, outputType: ZInferenceCanonicalType): DefinedBlock => ({
  type,
  contract: {
    inputs: {},
    outputs: { output: { id: 'output', dir: 'out', type: { value: outputType } } },
  },
});

/** A block with one input (no outputs). */
const sink = (type: string, inputType: ZInferenceCanonicalType): DefinedBlock => ({
  type,
  contract: {
    inputs: { input: { id: 'input', dir: 'in', type: { value: inputType } } },
    outputs: {},
  },
});

/** A block with two input slots. */
const dualSink = (
  type: string,
  firstType: ZInferenceCanonicalType,
  secondType: ZInferenceCanonicalType,
): DefinedBlock => ({
  type,
  contract: {
    inputs: {
      first: { id: 'first', dir: 'in', type: { value: firstType } },
      second: { id: 'second', dir: 'in', type: { value: secondType } },
    },
    outputs: {},
  },
});

/** An adapter block: marked with adapterSpec. */
const adapterDef = (
  type: string,
  inputType: ZInferenceCanonicalType,
  outputType: ZInferenceCanonicalType,
  spec: ZAdapterSpec = { description: type },
): DefinedBlock => ({
  type,
  adapterSpec: spec,
  contract: {
    inputs: { in: { id: 'in', dir: 'in', type: { value: inputType } } },
    outputs: { out: { id: 'out', dir: 'out', type: { value: outputType } } },
  },
});

/** A block with no contract (bare). */
const bareBlock = (type: string): DefinedBlock => ({ type });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listCatalogEntries — catalog-side listing', () => {
  it('returns every block in the catalog with no filtering', () => {
    const catalog: DefinedBlock[] = [
      source('FloatSource', zFloat()),
      sink('FloatSink', zFloat()),
      adapterDef('DegToRad', degrees(), radians()),
      bareBlock('Passthrough'),
    ];

    const entries = listCatalogEntries(catalog);

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.blockType)).toEqual(
      expect.arrayContaining(['FloatSource', 'FloatSink', 'DegToRad', 'Passthrough']),
    );
  });

  it('maps adapterSpec through to the entry', () => {
    const catalog: DefinedBlock[] = [adapterDef('DegToRad', degrees(), radians(), { description: 'Degrees → Radians' })];
    const [entry] = listCatalogEntries(catalog);
    expect(entry.adapterSpec?.description).toBe('Degrees → Radians');
  });

  it('returns an empty array for an empty catalog', () => {
    expect(listCatalogEntries([])).toHaveLength(0);
  });
});

describe('findInsertableBlocks — context-side query', () => {
  it('direct match: float out port → float-input block', () => {
    const catalog: DefinedBlock[] = [sink('FloatSink', zFloat())];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].blockType).toBe('FloatSink');
    expect(results[0].matchingSlotId).toBe('input');
    expect(results[0].adapter).toBeNull();
    expect(results[0].confidence).toBe('direct');
  });

  it('adapter match: degrees out port → radians-input block via DegToRad', () => {
    // DegToRad: direct match (its 'in' slot accepts degrees)
    // RadiansSink: via-adapter (degrees → DegToRad → radians)
    const catalog: DefinedBlock[] = [
      sink('RadiansSink', radians()),
      adapterDef('DegToRad', degrees(), radians()),
    ];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: degreesConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(2);
    const direct = results.find((r) => r.confidence === 'direct');
    const viaAdapter = results.find((r) => r.confidence === 'via-adapter');
    expect(direct?.blockType).toBe('DegToRad');
    expect(direct?.matchingSlotId).toBe('in');
    expect(viaAdapter?.blockType).toBe('RadiansSink');
    expect(viaAdapter?.adapter?.blockType).toBe('DegToRad');
  });

  it('no match: float out port → vec2-input block with no adapter', () => {
    const catalog: DefinedBlock[] = [sink('Vec2Sink', zVec2())];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(0);
  });

  it('returns empty when portRef is not in the typed graph', () => {
    const catalog: DefinedBlock[] = [sink('FloatSink', zFloat())];
    const missingKey = draftPortKey('nowhere', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({}));

    const results = findInsertableBlocks(missingKey, graph, catalog);

    expect(results).toHaveLength(0);
  });

  it('polymorphic slot: var payload and var unit match any concrete source directly', () => {
    const polyInput: ZInferenceCanonicalType = {
      payload: payloadVar('P'),
      unit: unitVar('U'),
      extent: { cardinality: { kind: 'one' }, temporality: { kind: 'continuous' }, binding: { kind: 'unbound' }, perspective: { kind: 'default' }, branch: { kind: 'default' } },
    };
    const catalog: DefinedBlock[] = [sink('PolySink', polyInput)];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe('direct');
    expect(results[0].adapter).toBeNull();
  });

  it('cardinality: one out port → many-input block is not a direct match', () => {
    // The solver would auto-insert a Broadcast here; claiming 'direct'
    // (no adapter block needed) would misrepresent the insertion.
    const manyInput = canonical({ kind: 'float' }, { extent: manyExtent(instanceRef('inst:q')) });
    const catalog: DefinedBlock[] = [sink('ManySink', manyInput)];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results.filter((r) => r.confidence === 'direct')).toHaveLength(0);
  });

  it('cardinality: many out port → one-input block stays direct (driver promotes silently)', () => {
    const many = canonical({ kind: 'float' }, { extent: manyExtent(instanceRef('inst:q')) });
    const catalog: DefinedBlock[] = [sink('OneSink', zFloat())];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: asConcrete(many) }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe('direct');
  });

  it('cardinality: querying a many IN port excludes one-output source blocks from direct', () => {
    // dir='in': the candidate block's output is the edge SOURCE. A one-output
    // source into this many target is the driver's Broadcast case.
    const many = canonical({ kind: 'float' }, { extent: manyExtent(instanceRef('inst:q')) });
    const catalog: DefinedBlock[] = [source('OneSource', zFloat())];
    const key = draftPortKey('tgtBlock', 'input', 'value', 'in');
    const graph = makeTypedGraph(portTypes({ [key]: asConcrete(many) }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results.filter((r) => r.confidence === 'direct')).toHaveLength(0);
  });

  it('cardinality: many out port → many-input block stays direct', () => {
    const many = canonical({ kind: 'float' }, { extent: manyExtent(instanceRef('inst:q')) });
    const catalog: DefinedBlock[] = [sink('ManySink', many)];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: asConcrete(many) }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe('direct');
  });

  it('multi-slot: reports the matching slot id', () => {
    // 'first' slot is vec2 (no match), 'second' slot is float (match)
    const catalog: DefinedBlock[] = [dualSink('DualSink', zVec2(), zFloat())];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].blockType).toBe('DualSink');
    expect(results[0].matchingSlotId).toBe('second');
  });

  it('a direct match on a later slot wins over an earlier via-adapter slot', () => {
    // First slot needs an adapter (radians), second matches directly (degrees).
    const catalog: DefinedBlock[] = [
      dualSink('MixedSink', radians(), degrees()),
      adapterDef('DegToRad', degrees(), radians()),
    ];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: degreesConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    const mixed = results.find((r) => r.blockType === 'MixedSink');
    expect(mixed?.confidence).toBe('direct');
    expect(mixed?.matchingSlotId).toBe('second');
    expect(mixed?.adapter).toBeNull();
  });

  it('multi-field bundles: matches the field with the queried port name', () => {
    const multiFieldSink: DefinedBlock = {
      type: 'MultiFieldSink',
      contract: {
        inputs: { input: { id: 'input', dir: 'in', type: { value: zFloat(), meta: zVec2() } } },
        outputs: {},
      },
    };
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, [multiFieldSink]);

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe('direct');
  });

  it('no match when the candidate slot lacks the queried field name', () => {
    // Edge wiring matches fields by name; a disjoint field name means no
    // constraints and no data flow, so the block is not insertable.
    const mismatchedSink: DefinedBlock = {
      type: 'MismatchedSink',
      contract: {
        inputs: { input: { id: 'input', dir: 'in', type: { other: zFloat() } } },
        outputs: {},
      },
    };
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    expect(findInsertableBlocks(key, graph, [mismatchedSink])).toHaveLength(0);
  });

  it('ranking: direct matches appear before via-adapter matches', () => {
    const catalog: DefinedBlock[] = [
      // RadiansSink needs an adapter bridge (degrees → radians)
      sink('RadiansSink', radians()),
      adapterDef('DegToRad', degrees(), radians()),
      // FloatSink is a direct match
      sink('FloatSink', degrees()),
    ];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: degreesConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    // FloatSink (direct) must come before RadiansSink (via-adapter)
    const directIdx = results.findIndex((r) => r.confidence === 'direct');
    const adapterIdx = results.findIndex((r) => r.confidence === 'via-adapter');
    expect(directIdx).toBeGreaterThanOrEqual(0);
    expect(adapterIdx).toBeGreaterThanOrEqual(0);
    expect(directIdx).toBeLessThan(adapterIdx);
  });

  it('in-port direction: queries candidate output slots', () => {
    // Queried port is an INPUT → look at catalog blocks' OUTPUTS
    const catalog: DefinedBlock[] = [source('FloatSource', zFloat())];
    const key = draftPortKey('tgtBlock', 'input', 'value', 'in');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results).toHaveLength(1);
    expect(results[0].blockType).toBe('FloatSource');
    expect(results[0].matchingSlotId).toBe('output');
    expect(results[0].confidence).toBe('direct');
  });

  it('skips blocks without contracts', () => {
    const catalog: DefinedBlock[] = [bareBlock('NakedBlock'), sink('FloatSink', zFloat())];
    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const results = findInsertableBlocks(key, graph, catalog);

    expect(results.every((r) => r.blockType !== 'NakedBlock')).toBe(true);
    expect(results).toHaveLength(1);
  });
});

describe('findInsertableBlocks — benchmark', () => {
  it('1000 queries on a 100-block catalog complete in < 5 s', () => {
    // Build a 100-block catalog: 50 float sinks + 48 vec2 sinks + 1 DegToRad adapter + 1 RadiansSink
    const catalog: DefinedBlock[] = [
      ...Array.from({ length: 50 }, (_, i) => sink(`FloatSink${i}`, zFloat())),
      ...Array.from({ length: 48 }, (_, i) => sink(`Vec2Sink${i}`, zVec2())),
      adapterDef('DegToRad', degrees(), radians()),
      sink('RadiansSink', radians()),
    ];
    expect(catalog).toHaveLength(100);

    const key = draftPortKey('srcBlock', 'output', 'value', 'out');
    const graph = makeTypedGraph(portTypes({ [key]: floatConcrete() }));

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      findInsertableBlocks(key, graph, catalog);
    }
    const elapsed = performance.now() - start;

    // [LAW:verifiable-goals] — 5 s gives 3–5× headroom over dev-machine baseline
    // while still catching O(n²) regressions on slow CI runners.
    expect(elapsed).toBeLessThan(5000);
  });
});
