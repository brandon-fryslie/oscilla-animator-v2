/**
 * selection-detail-conformance.test — the SelectionDetail contract run against every
 * provider, plus a negative control proving the contract rejects.
 *
 * The contract itself lives in ./selection-detail-conformance.contract. Here we
 * supply one `SelectionDetailConformanceCase` per provider (seeding it in that
 * provider's own vocabulary — a V1 patch with a block + edge + config, a pillar patch
 * likewise) and run the shared suite over each. A future backend becomes drop-in
 * verifiable by adding one case below. [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { PatchStore } from '../../../stores/PatchStore';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';

import { V1SelectionDetail } from '../V1SelectionDetail';
import { SceneSelectionDetail } from '../SceneSelectionDetail';
import { emptySelectionDetail } from '../selection-detail';
import type { BlockDetail, EdgeDetail, SelectionDetail } from '../selection-detail';

import {
  assertConfigRoundTrips,
  assertDescribesKnownBlock,
  assertUnknownBlockAbsent,
  assertUnknownEdgeAbsent,
  assertUnknownPortAbsent,
  assertUnknownTypeAbsent,
  runSelectionDetailConformanceSuite,
  type SelectionDetailConformanceCase,
} from './selection-detail-conformance.contract';

registerAllBlocks();

// =============================================================================
// V1 provider — a time signal into Compare.a; Compare carries an editable `op`
// config. The time→a edge is the known edge; Compare is the known block.
// =============================================================================

function v1Case(): SelectionDetailConformanceCase {
  const store = new PatchStore();
  const timeId = store.addBlock('InfiniteTimeRoot');
  const compareId = store.addBlock('Compare');
  const edgeId = store.addEdge(
    { kind: 'port', blockId: timeId, slotId: 'tMs' },
    { kind: 'port', blockId: compareId, slotId: 'a' },
  );

  return {
    name: 'V1SelectionDetail',
    detail: new V1SelectionDetail(store, new FrontendResultStore()),
    knownBlockId: compareId,
    unknownBlockId: 'no-such-block',
    knownEdgeId: edgeId,
    unknownEdgeId: 'no-such-edge',
    knownPort: { blockId: compareId, portId: 'a' },
    unknownPort: { blockId: 'no-such-block', portId: 'x' },
    knownType: 'Compare',
    unknownType: 'no-such-type',
    editableConfig: { blockId: compareId, paramId: 'op', value: 'lt' },
  };
}

// =============================================================================
// Pillar provider — Constant → WaveOffset.amplitude; Constant carries an editable
// `value` config. The const→amplitude edge is the known edge; Constant is the block.
// =============================================================================

function sceneCase(): SelectionDetailConformanceCase {
  const store = new PillarPatchStore({ blocks: [], edges: [] });
  const constId = store.addBlock('Constant');
  const waveId = store.addBlock('WaveOffset');
  const edgeId = store.addEdge(constId, waveId, 'amplitude');

  return {
    name: 'SceneSelectionDetail',
    detail: new SceneSelectionDetail(store),
    knownBlockId: constId,
    unknownBlockId: 'no-such-block',
    knownEdgeId: edgeId,
    unknownEdgeId: 'no-such-edge',
    knownPort: { blockId: waveId, portId: 'amplitude' },
    unknownPort: { blockId: 'no-such-block', portId: 'x' },
    knownType: 'WaveOffset',
    unknownType: 'no-such-type',
    editableConfig: { blockId: constId, paramId: 'value', value: 42 },
  };
}

runSelectionDetailConformanceSuite(v1Case());
runSelectionDetailConformanceSuite(sceneCase());

// =============================================================================
// Negative control — deliberately-broken providers the contract MUST reject. Each
// `expect(...).toThrow` pins a distinct invariant to the assertion that enforces it,
// so no assertion can pass vacuously. [LAW:verifiable-goals]
// =============================================================================

const okBlock: BlockDetail = {
  id: 'b',
  variant: 'block',
  type: 'T',
  typeLabel: 'T',
  displayName: 'T',
  canEditDisplayName: false,
  inputs: [],
  outputs: [],
  config: [{ kind: 'control', control: { id: 'p', label: 'P', value: 0, target: { kind: 'blockParam', blockId: 'b' as never, paramId: 'p' } } }],
};

const okEdge: EdgeDetail = {
  id: 'e',
  source: { blockId: 'a', portId: 'o', blockLabel: 'A' },
  target: { blockId: 'b', portId: 'i', blockLabel: 'B' },
  chain: [],
};

const NOOP = {
  applyControl: () => {},
  setDisplayName: () => ({}),
  setDefaultSource: () => {},
  setCombineMode: () => {},
  addLens: () => {},
  removeLens: () => {},
  connect: () => {},
  removeEdge: () => {},
  describeBlock: () => undefined,
  describeEdge: () => undefined,
  describePort: () => undefined,
  describeTypePreview: () => undefined,
} as const;

const DUMMY = {
  knownBlockId: 'b',
  unknownBlockId: 'ghost',
  knownEdgeId: 'e',
  unknownEdgeId: 'ghost',
  knownPort: { blockId: 'b', portId: 'i' },
  unknownPort: { blockId: 'ghost', portId: 'x' },
  knownType: 'T',
  unknownType: 'ghost',
  editableConfig: { blockId: 'b', paramId: 'p', value: 5 },
} as const;

/** Returns a detail for EVERY block id — so it invents the unknown block. */
const brokenInventsUnknownBlock: SelectionDetail = {
  ...NOOP,
  describeBlock: () => okBlock,
  describeEdge: () => undefined,
};

/**
 * Returns a block whose IDENTITY is well-formed (so the id/type checks pass) but
 * whose input port is malformed — empty id + label. This forces the failure through
 * `assertBlockWellFormed`'s port loop specifically, not the earlier id-match guard,
 * so that assertion is proven to have teeth.
 */
const brokenMalformedBlock: SelectionDetail = {
  ...NOOP,
  describeBlock: () => ({
    ...okBlock,
    inputs: [{ id: '', label: '', feed: { kind: 'unconnected' }, controls: [] }],
  }),
  describeEdge: () => undefined,
};

/** Returns an edge for EVERY edge id — so it invents the unknown edge. */
const brokenInventsUnknownEdge: SelectionDetail = {
  ...NOOP,
  describeBlock: () => undefined,
  describeEdge: () => okEdge,
};

/** Reports a config field but ignores writes — so an edit never reads back. */
const brokenIgnoresApply: SelectionDetail = {
  ...NOOP,
  describeBlock: () => okBlock,
  describeEdge: () => undefined,
};

/** Returns a port detail for EVERY port id — so it invents the unknown port. */
const brokenInventsUnknownPort: SelectionDetail = {
  ...NOOP,
  describePort: () => ({
    ref: { blockId: 'b', portId: 'i' },
    direction: 'input',
    label: 'L',
    parentBlock: { blockId: 'b', portId: '', blockLabel: 'B' },
    feed: { kind: 'unconnected' },
    targets: [],
    controls: [],
  }),
};

/** Returns a preview for EVERY type — so it invents the unknown type. */
const brokenInventsUnknownType: SelectionDetail = {
  ...NOOP,
  describeTypePreview: () => ({ type: 'T', typeLabel: 'T', inputs: [], outputs: [] }),
};

describe('selection-detail conformance contract rejects a non-conforming provider (negative control)', () => {
  it('rejects a provider that invents a detail for an unknown block', () => {
    expect(() => assertUnknownBlockAbsent({ name: 'x', detail: brokenInventsUnknownBlock, ...DUMMY })).toThrow();
  });

  it('rejects a provider whose block detail is malformed', () => {
    expect(() => assertDescribesKnownBlock({ name: 'x', detail: brokenMalformedBlock, ...DUMMY })).toThrow();
  });

  it('rejects a provider that invents a detail for an unknown edge', () => {
    expect(() => assertUnknownEdgeAbsent({ name: 'x', detail: brokenInventsUnknownEdge, ...DUMMY })).toThrow();
  });

  it('rejects a provider that ignores a config write', () => {
    expect(() => assertConfigRoundTrips({ name: 'x', detail: brokenIgnoresApply, ...DUMMY })).toThrow();
  });

  it('rejects a provider that invents a detail for an unknown port', () => {
    expect(() => assertUnknownPortAbsent({ name: 'x', detail: brokenInventsUnknownPort, ...DUMMY })).toThrow();
  });

  it('rejects a provider that invents a preview for an unknown type', () => {
    expect(() => assertUnknownTypeAbsent({ name: 'x', detail: brokenInventsUnknownType, ...DUMMY })).toThrow();
  });
});

// =============================================================================
// emptySelectionDetail — pinned directly, because it is the one provider the
// conformance contract structurally cannot cover: it describes nothing, so it
// supplies no known block / edge / editable config. It is nonetheless production
// code (the composite editor), so its invariants are asserted here. [LAW:verifiable-goals]
// =============================================================================

describe('emptySelectionDetail', () => {
  it('describes no block, edge, port, or type', () => {
    expect(emptySelectionDetail.describeBlock('anything')).toBeUndefined();
    expect(emptySelectionDetail.describeEdge('anything')).toBeUndefined();
    expect(emptySelectionDetail.describePort({ blockId: 'a', portId: 'p' })).toBeUndefined();
    expect(emptySelectionDetail.describeTypePreview('anything')).toBeUndefined();
  });

  it('accepts every command as a no-op without throwing', () => {
    expect(() => {
      emptySelectionDetail.applyControl({ kind: 'blockParam', blockId: 'b' as never, paramId: 'p' }, 1);
      emptySelectionDetail.setCombineMode('b', 'p', 'sum');
      emptySelectionDetail.connect({ blockId: 'a', portId: 'o' }, { blockId: 'b', portId: 'i' });
      emptySelectionDetail.removeEdge('e');
    }).not.toThrow();
  });
});
