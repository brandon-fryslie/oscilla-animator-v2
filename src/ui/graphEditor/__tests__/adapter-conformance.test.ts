/**
 * adapter-conformance.test — the GraphDataAdapter contract run against every
 * provider, plus a negative control proving the contract rejects.
 *
 * The contract itself lives in ./adapter-conformance.contract. Here we supply
 * one `ConformanceCase` per provider (seeding it in that provider's own
 * vocabulary) and run the shared suite over each. A future backend becomes
 * drop-in verifiable by adding one case below. [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { PatchStore } from '../../../stores/PatchStore';
import { LayoutStore } from '../../../stores/LayoutStore';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { CompositeEditorStore } from '../../../stores/CompositeEditorStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import type { BlockId } from '../../../types';
import type { InternalBlockId } from '../../../blocks/composite-types';

import { PatchStoreAdapter } from '../PatchStoreAdapter';
import { CompositeStoreAdapter } from '../CompositeStoreAdapter';
import { PillarPatchAdapter } from '../PillarPatchAdapter';
import type { GraphDataAdapter, BlockLike, EdgeLike } from '../types';

import {
  assertAddBlockReadableAndBranded,
  assertBlocksSelfDescribing,
  assertEdgesAnchorToRealHandles,
  assertMutationsDelegateToStore,
  assertReactivity,
  runConformanceSuite,
  type ConformanceCase,
} from './adapter-conformance.contract';

// =============================================================================
// One case per provider — provider-specific seeding, era-specific vocabulary.
// =============================================================================

const patchStoreCase: ConformanceCase<BlockId> = {
  name: 'PatchStoreAdapter',
  addableType: 'Const',
  capabilities: { params: true, displayName: true, history: true },
  setup() {
    const patchStore = new PatchStore();
    const layoutStore = new LayoutStore();
    const frontendStore = new FrontendResultStore();

    // Seed a Const -> Ellipse.rx wiring (>=2 blocks, >=1 edge).
    const constId = patchStore.addBlock('Const', { value: 0.5 });
    const ellipseId = patchStore.addBlock('Ellipse', {});
    patchStore.addEdge(
      { kind: 'port', blockId: constId, slotId: 'out' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );

    return { newAdapter: () => new PatchStoreAdapter(patchStore, layoutStore, frontendStore) };
  },
};

const compositeStoreCase: ConformanceCase<InternalBlockId> = {
  name: 'CompositeStoreAdapter',
  addableType: 'Noise',
  capabilities: { params: false, displayName: false, history: false },
  setup() {
    const store = new CompositeEditorStore();

    const noiseId = store.addBlock('Noise', { x: 0, y: 0 });
    const lagId = store.addBlock('Lag', { x: 200, y: 0 });
    store.addEdge({ fromBlock: noiseId, fromPort: 'out', toBlock: lagId, toPort: 'target' });

    return { newAdapter: () => new CompositeStoreAdapter(store) };
  },
};

const pillarPatchCase: ConformanceCase<string> = {
  name: 'PillarPatchAdapter',
  addableType: 'Constant',
  capabilities: { params: true, displayName: false, history: true },
  setup() {
    // PillarPatchStore self-seeds the grid-of-squares patch (3 blocks, 2 edges).
    const store = new PillarPatchStore();
    return { newAdapter: () => new PillarPatchAdapter(store) };
  },
};

runConformanceSuite(patchStoreCase);
runConformanceSuite(compositeStoreCase);
runConformanceSuite(pillarPatchCase);

// =============================================================================
// Negative control — a deliberately-broken adapter the contract MUST reject.
//
// If the assertions passed this, they would be vacuous. Each `expect(...).toThrow`
// pins a distinct invariant to the assertion that enforces it. [LAW:verifiable-goals]
// =============================================================================

/**
 * Violates the contract on every axis: a block with an empty typeLabel and a
 * mismatched id; an edge whose target handle does not exist; mutations that are
 * no-ops (so nothing is readable, nothing delegates, nothing reacts). It is a
 * plain object graph with no MobX observability.
 */
class BrokenAdapter implements GraphDataAdapter<string> {
  private readonly block: BlockLike = {
    id: 'real-id',
    type: 'Broken',
    typeLabel: '', // violation: not self-describing
    displayName: 'Broken',
    params: {},
    inputPorts: new Map([['in', { id: 'in', label: 'In' }]]),
    outputPorts: new Map([['out', { id: 'out', label: 'Out' }]]),
    controls: [],
  };

  get blocks(): ReadonlyMap<string, BlockLike> {
    // Key deliberately disagrees with block.id — breaks branded-id discipline.
    return new Map([['wrong-key', this.block]]);
  }

  get edges(): readonly EdgeLike[] {
    // Target handle 'nope' is not a real input port — the edge would be dropped.
    return [
      {
        id: 'e0',
        sourceBlockId: 'wrong-key',
        sourcePortId: 'out',
        targetBlockId: 'wrong-key',
        targetPortId: 'nope',
      },
    ];
  }

  addBlock(_type: string, _position: { x: number; y: number }): string {
    return 'ghost'; // no-op: never actually added
  }

  removeBlock(_id: string): void {
    /* no-op */
  }

  getBlockPosition(_id: string): { x: number; y: number } | undefined {
    return undefined;
  }

  setBlockPosition(_id: string, _position: { x: number; y: number }): void {
    /* no-op */
  }

  addEdge(_s: string, _sp: string, _t: string, _tp: string): string {
    return 'ghost-edge'; // no-op
  }

  removeEdge(_id: string): void {
    /* no-op */
  }
}

const brokenCase: ConformanceCase<string> = {
  name: 'BrokenAdapter',
  addableType: 'X',
  capabilities: { params: false, displayName: false, history: false },
  setup() {
    return { newAdapter: () => new BrokenAdapter() };
  },
};

describe('conformance contract rejects a non-conforming adapter (negative control)', () => {
  it('rejects blocks that are not self-describing', () => {
    expect(() => assertBlocksSelfDescribing(brokenCase)).toThrow();
  });

  it('rejects edges that do not anchor to real handles', () => {
    expect(() => assertEdgesAnchorToRealHandles(brokenCase)).toThrow();
  });

  it('rejects addBlock that is not immediately readable', () => {
    expect(() => assertAddBlockReadableAndBranded(brokenCase)).toThrow();
  });

  it('rejects mutations that do not delegate to a shared store', () => {
    expect(() => assertMutationsDelegateToStore(brokenCase)).toThrow();
  });

  it('rejects mutations that break MobX reactivity', () => {
    expect(() => assertReactivity(brokenCase)).toThrow();
  });
});
