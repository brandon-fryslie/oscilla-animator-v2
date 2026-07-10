/**
 * adapter-conformance.contract — the GraphDataAdapter contract, stated once, as
 * executable assertions.
 *
 * This file IS the specification of what makes an adapter "editor-compatible".
 * Every provider (PatchStoreAdapter, CompositeStoreAdapter, PillarPatchAdapter,
 * and any future backend) is checked against this one contract; a behavior this
 * file does not assert is not part of the contract, and a provider that passes
 * every assertion here is presumed drop-in for GraphEditorCore.
 * [LAW:single-enforcer] [LAW:verifiable-goals]
 *
 * DECOMPOSITION: a `ConformanceCase` is the seam. It carries the whole truth a
 * provider must supply to be checkable — how to build a freshly-seeded adapter,
 * a block type its registry accepts, and which optional capabilities it claims.
 * The `assert*` functions below know only the neutral vocabulary (BlockLike /
 * EdgeLike / GraphDataAdapter); they never import a store or an era-specific
 * type. This is what lets one contract check three heterogeneous providers.
 * [LAW:decomposition] [LAW:one-way-deps]
 *
 * The `assert*` functions are also the negative control's instrument: aimed at a
 * deliberately-broken adapter they must throw, proving the suite has teeth
 * rather than vacuously passing.
 */

import { reaction } from 'mobx';
import { describe, expect, it } from 'vitest';
import type { GraphDataAdapter } from '../types';
import type { GraphSnapshotSource } from '../../../stores/GraphHistoryStore';

/**
 * Everything a provider must supply to be run through the conformance contract.
 *
 * `setup()` builds a fresh, seeded store and returns a factory over it. Calling
 * the factory twice yields two adapters over the SAME store — the delegation
 * assertion relies on this to prove mutations reach the owning store rather than
 * adapter-local shadow state. Each `assert*` call invokes `setup()` once, so the
 * assertions are mutually isolated.
 */
export interface ConformanceCase<Id = string> {
  readonly name: string;
  /** Build a fresh adapter over a freshly-seeded store (>=2 blocks, >=1 edge). */
  setup(): { newAdapter(): GraphDataAdapter<Id> };
  /** A block type this provider's registry accepts (exercises addBlock). */
  readonly addableType: string;
  /**
   * Capabilities declared as values, not sniffed at runtime: the suite selects
   * capability-gated tests from these flags at registration time rather than
   * branching inside an assertion. [LAW:dataflow-not-control-flow]
   */
  readonly capabilities: {
    /** `updateBlockParams` present and writes through. */
    readonly params: boolean;
    /** `updateBlockDisplayName` present and writes through. */
    readonly displayName: boolean;
    /** Implements GraphSnapshotSource: authored state captures and restores for undo. */
    readonly history: boolean;
    /**
     * A block of `addableType` exposes >=1 self-describing inline control whose
     * `apply` writes through to the owning store. This is the neutral parameter-
     * affordance guarantee: an editor renders and edits a block's config from the
     * control descriptors alone, in either era. [LAW:effects-at-boundaries]
     */
    readonly controls: boolean;
  };
}

// The neutral EdgeLike names blocks by plain string; a provider's BlockIdT is a
// branded string. The two are the same value at runtime; this bridges the brand
// at the one seam where neutral ids re-enter a typed adapter call. [LAW:types-are-the-program]
function asId<Id>(neutralId: string): Id {
  return neutralId as unknown as Id;
}

/**
 * Every edge resolves to real handles on real blocks. This is the exact
 * predicate `createEdgeFromEdgeLike` uses to decide whether a projected edge
 * survives into ReactFlow, so an adapter that fails it silently loses edges.
 */
function assertAllEdgesAnchor<Id>(adapter: GraphDataAdapter<Id>, name: string): void {
  for (const edge of adapter.edges) {
    const source = adapter.blocks.get(asId<Id>(edge.sourceBlockId));
    const target = adapter.blocks.get(asId<Id>(edge.targetBlockId));
    expect(source, `${name}: edge ${edge.id} source block ${edge.sourceBlockId} exists`).toBeDefined();
    expect(target, `${name}: edge ${edge.id} target block ${edge.targetBlockId} exists`).toBeDefined();
    expect(
      source!.outputPorts.has(edge.sourcePortId),
      `${name}: edge ${edge.id} anchors to real source handle ${edge.sourcePortId}`,
    ).toBe(true);
    expect(
      target!.inputPorts.has(edge.targetPortId),
      `${name}: edge ${edge.id} anchors to real target handle ${edge.targetPortId}`,
    ).toBe(true);
  }
}

/** Blocks render without a registry: every block and port is self-describing. */
export function assertBlocksSelfDescribing<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  expect(adapter.blocks.size, `${c.name}: seed must contain blocks`).toBeGreaterThan(0);

  for (const [id, block] of adapter.blocks) {
    expect(block.id, `${c.name}: BlockLike.id matches its map key`).toBe(id);
    expect(block.type.length, `${c.name}: block ${String(id)} carries a type`).toBeGreaterThan(0);
    expect(block.typeLabel.length, `${c.name}: block ${String(id)} carries a typeLabel`).toBeGreaterThan(0);
    expect(typeof block.displayName, `${c.name}: block ${String(id)} carries a displayName`).toBe('string');

    for (const port of [...block.inputPorts.values(), ...block.outputPorts.values()]) {
      expect(port.label.length, `${c.name}: port ${port.id} carries a label`).toBeGreaterThan(0);
      if (port.typeDisplay) {
        expect(port.typeDisplay.color.length, `${c.name}: port ${port.id} type color`).toBeGreaterThan(0);
        expect(
          port.typeDisplay.compatibilityToken.length,
          `${c.name}: port ${port.id} compatibility token`,
        ).toBeGreaterThan(0);
      }
    }
  }
}

/** The seed's edges all anchor to real handles. */
export function assertEdgesAnchorToRealHandles<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  expect(adapter.edges.length, `${c.name}: seed must contain >=1 edge`).toBeGreaterThan(0);
  assertAllEdgesAnchor(adapter, c.name);
}

/** addBlock is immediately readable, addressable by the id it returns, and records position. */
export function assertAddBlockReadableAndBranded<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const before = adapter.blocks.size;
  const position = { x: 123, y: 456 };

  const id = adapter.addBlock(c.addableType, position);

  expect(adapter.blocks.size, `${c.name}: addBlock grows the projection`).toBe(before + 1);
  const added = adapter.blocks.get(id);
  expect(added, `${c.name}: added block is immediately readable`).toBeDefined();
  // Branded-id discipline: the id you are handed is the id you address it by.
  expect(added!.id, `${c.name}: added block addressable by returned id`).toBe(id);
  expect(adapter.getBlockPosition(id), `${c.name}: addBlock records the drop position`).toEqual(position);
}

/** removeBlock leaves no dangling edge refs and clears the block's position. */
export function assertRemoveBlockCoherent<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const id = adapter.addBlock(c.addableType, { x: 0, y: 0 });
  expect(adapter.blocks.has(id)).toBe(true);

  adapter.removeBlock(id);

  expect(adapter.blocks.has(id), `${c.name}: removed block gone from projection`).toBe(false);
  expect(adapter.getBlockPosition(id), `${c.name}: removed block position cleared`).toBeUndefined();
  for (const edge of adapter.edges) {
    expect(edge.sourceBlockId, `${c.name}: no edge dangles from removed block`).not.toBe(String(id));
    expect(edge.targetBlockId, `${c.name}: no edge dangles to removed block`).not.toBe(String(id));
  }
  assertAllEdgesAnchor(adapter, c.name);
}

/** A block's editor position round-trips through the adapter. */
export function assertPositionRoundtrips<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const id = adapter.addBlock(c.addableType, { x: 1, y: 2 });
  adapter.setBlockPosition(id, { x: 77, y: 88 });
  expect(adapter.getBlockPosition(id), `${c.name}: position round-trips`).toEqual({ x: 77, y: 88 });
}

/** removeEdge leaves no dangling refs; a subsequent addEdge yields a well-formed edge. */
export function assertEdgeMutationCoherent<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const seed = adapter.edges[0];
  expect(seed, `${c.name}: seed must contain >=1 edge`).toBeDefined();

  adapter.removeEdge(seed.id);
  expect(adapter.edges.some((e) => e.id === seed.id), `${c.name}: removed edge id is gone`).toBe(false);
  assertAllEdgesAnchor(adapter, c.name);

  const newId = adapter.addEdge(
    asId<Id>(seed.sourceBlockId),
    seed.sourcePortId,
    asId<Id>(seed.targetBlockId),
    seed.targetPortId,
  );
  expect(adapter.edges.some((e) => e.id === newId), `${c.name}: re-added edge is present`).toBe(true);
  assertAllEdgesAnchor(adapter, c.name);
}

/** A mutation through one adapter is visible through a fresh adapter over the same store. */
export function assertMutationsDelegateToStore<Id>(c: ConformanceCase<Id>): void {
  const { newAdapter } = c.setup();
  const writer = newAdapter();
  const reader = newAdapter(); // same underlying store

  const id = writer.addBlock(c.addableType, { x: 0, y: 0 });

  expect(
    reader.blocks.has(id),
    `${c.name}: mutation reaches the owning store (visible via a fresh adapter), not adapter-local shadow state`,
  ).toBe(true);
}

/** Mutations invalidate MobX-tracked reads so ReactFlow re-renders. */
export function assertReactivity<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();

  // Track a structural signature, not a count: a same-cardinality edit (remove
  // one, auto-materialize another) still changes identity and must be observed.
  let blockSignals = 0;
  const disposeBlocks = reaction(
    () => [...adapter.blocks.keys()].map(String).join('|'),
    () => {
      blockSignals += 1;
    },
  );
  adapter.addBlock(c.addableType, { x: 0, y: 0 });
  expect(blockSignals, `${c.name}: block mutation triggers a MobX reaction`).toBeGreaterThan(0);
  disposeBlocks();

  let edgeSignals = 0;
  const disposeEdges = reaction(
    () => adapter.edges.map((e) => e.id).join('|'),
    () => {
      edgeSignals += 1;
    },
  );
  const seed = adapter.edges[0];
  expect(seed, `${c.name}: seed must contain >=1 edge`).toBeDefined();
  adapter.removeEdge(seed.id);
  expect(edgeSignals, `${c.name}: edge mutation triggers a MobX reaction`).toBeGreaterThan(0);
  disposeEdges();

  if (adapter.dataVersion !== undefined) {
    expect(typeof adapter.dataVersion, `${c.name}: dataVersion is numeric when present`).toBe('number');
  }
}

/** updateBlockParams writes through to the store and is reflected in the projection. */
export function assertParamEditingDelegates<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  expect(adapter.updateBlockParams, `${c.name}: declared params capability requires updateBlockParams`).toBeDefined();

  const id = adapter.addBlock(c.addableType, { x: 0, y: 0 });
  adapter.updateBlockParams!(id, { value: 0.7 });

  expect(adapter.blocks.get(id)?.params.value, `${c.name}: param write reflected in projection`).toBe(0.7);
}

/** A value distinct from `value`, in the same type, so a write is observably a change. */
function nextDistinctValue(value: unknown): unknown {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') return `${value}_edited`;
  return 'edited';
}

/**
 * A block's inline controls are self-describing AND editable: each carries an id,
 * label and an `apply` sink, and writing through `apply` is reflected in a fresh
 * read of the same control. This is the neutral param-control contract — an editor
 * renders and edits config from the descriptors alone, and the provider's own store
 * performs the mutation, so the same node/inspector edits both eras. [LAW:effects-at-boundaries]
 */
export function assertControlsSelfDescribingAndEditable<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const id = adapter.addBlock(c.addableType, { x: 0, y: 0 });
  const block = adapter.blocks.get(id);
  expect(block, `${c.name}: added block is readable`).toBeDefined();

  const controls = block!.controls;
  expect(controls.length, `${c.name}: '${c.addableType}' exposes >=1 inline control`).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.id.length, `${c.name}: control carries an id`).toBeGreaterThan(0);
    expect(control.label.length, `${c.name}: control ${control.id} carries a label`).toBeGreaterThan(0);
    expect(typeof control.apply, `${c.name}: control ${control.id} carries an apply sink`).toBe('function');
  }

  // Editable: the first control's `apply` reaches the owning store and re-reads.
  const first = controls[0];
  const next = nextDistinctValue(first.value);
  first.apply(next);
  const reread = adapter.blocks.get(id)?.controls.find((ctrl) => ctrl.id === first.id);
  expect(reread?.value, `${c.name}: control ${first.id} edit writes through and re-reads`).toBe(next);
}

/** updateBlockDisplayName writes through to the store and is reflected in the projection. */
export function assertDisplayNameDelegates<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  expect(
    adapter.updateBlockDisplayName,
    `${c.name}: declared displayName capability requires updateBlockDisplayName`,
  ).toBeDefined();

  const id = adapter.addBlock(c.addableType, { x: 0, y: 0 });
  const result = adapter.updateBlockDisplayName!(id, 'Renamed');

  expect(result.error, `${c.name}: valid rename has no error`).toBeUndefined();
  expect(adapter.blocks.get(id)?.displayName, `${c.name}: rename reflected in projection`).toBe('Renamed');
}

/**
 * GraphSnapshotSource round-trips: a captured snapshot restores the exact authored
 * state, and the history token moves on an edit so the history authority checkpoints.
 * This is the undo contract stated once, independent of the GraphHistoryStore. [LAW:single-enforcer]
 */
export function assertHistorySnapshotRoundtrips<Id>(c: ConformanceCase<Id>): void {
  const adapter = c.setup().newAdapter();
  const source = adapter as unknown as GraphSnapshotSource;
  expect(typeof source.captureHistorySnapshot, `${c.name}: declares captureHistorySnapshot`).toBe('function');
  expect(typeof source.restoreHistorySnapshot, `${c.name}: declares restoreHistorySnapshot`).toBe('function');

  const before = adapter.blocks.size;
  const tokenBefore = source.historyToken;
  const snapshot = source.captureHistorySnapshot();

  adapter.addBlock(c.addableType, { x: 0, y: 0 });
  expect(adapter.blocks.size, `${c.name}: edit grows the graph`).toBe(before + 1);
  expect(source.historyToken, `${c.name}: history token moves on an edit`).not.toEqual(tokenBefore);

  source.restoreHistorySnapshot(snapshot);
  expect(adapter.blocks.size, `${c.name}: restore returns to the captured state`).toBe(before);
}

/**
 * Register the whole contract against one provider. A future 4th provider is
 * drop-in verifiable: build a ConformanceCase for it and call this.
 */
export function runConformanceSuite<Id>(c: ConformanceCase<Id>): void {
  describe(`GraphDataAdapter conformance: ${c.name}`, () => {
    it('projects self-describing blocks', () => assertBlocksSelfDescribing(c));
    it('edges anchor to real handles', () => assertEdgesAnchorToRealHandles(c));
    it('addBlock is immediately readable and branded-id addressable', () => assertAddBlockReadableAndBranded(c));
    it('removeBlock leaves no dangling refs and clears position', () => assertRemoveBlockCoherent(c));
    it('block position round-trips', () => assertPositionRoundtrips(c));
    it('edge remove/add is coherent', () => assertEdgeMutationCoherent(c));
    it('mutations delegate to the owning store (no shadow state)', () => assertMutationsDelegateToStore(c));
    it('mutations preserve MobX reactivity', () => assertReactivity(c));

    const paramsIt = c.capabilities.params ? it : it.skip;
    paramsIt('updateBlockParams writes through to the store', () => assertParamEditingDelegates(c));

    const controlsIt = c.capabilities.controls ? it : it.skip;
    controlsIt('inline controls are self-describing and editable', () => assertControlsSelfDescribingAndEditable(c));

    const displayNameIt = c.capabilities.displayName ? it : it.skip;
    displayNameIt('updateBlockDisplayName writes through to the store', () => assertDisplayNameDelegates(c));

    const historyIt = c.capabilities.history ? it : it.skip;
    historyIt('history snapshot captures and restores authored state', () => assertHistorySnapshotRoundtrips(c));
  });
}
