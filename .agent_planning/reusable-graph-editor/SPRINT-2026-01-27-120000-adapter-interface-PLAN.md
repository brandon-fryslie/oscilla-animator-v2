# Sprint: adapter-interface - Graph Data Adapter Interface

**Generated:** 2026-01-27-120000
**Confidence:** HIGH: 5, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Source:** EVALUATION-2026-01-27-120000.md

## Sprint Goal

Define the GraphDataAdapter interface and implement adapters for both PatchStore and CompositeEditorStore, enabling a single graph editor to work with multiple data sources.

## Scope

**Deliverables:**
- GraphDataAdapter interface definition
- PatchStoreAdapter implementation
- CompositeStoreAdapter implementation
- Unit tests for both adapters

## Work Items

### P0 [HIGH] Define GraphDataAdapter Interface

**Dependencies:** None
**Spec Reference:** ONE TYPE PER BEHAVIOR architectural law
**Status Reference:** EVALUATION Gap Analysis - "No Abstraction Layer"

#### Description

Create a TypeScript interface that abstracts graph operations. This interface must support:
- Reading blocks and edges (for rendering)
- Block CRUD operations
- Edge CRUD operations
- Position management
- Optional parameter editing (for main patch only)

The interface should use generics for block/edge ID types to preserve type safety.

#### Acceptance Criteria

- [ ] Interface defined in `src/ui/graphEditor/types.ts`
- [ ] Generic types `BlockIdT` and `EdgeIdT` for type safety
- [ ] Read-only properties for `blocks` and `edges`
- [ ] All CRUD methods defined
- [ ] Optional methods marked with `?`
- [ ] TSDoc comments for all members
- [ ] No circular dependencies introduced

#### Technical Notes

```typescript
// Key interface shape (implementation may vary)
interface GraphDataAdapter<BlockIdT = string> {
  // Read
  readonly blocks: ReadonlyMap<BlockIdT, BlockLike>;
  readonly edges: readonly EdgeLike[];

  // Block operations
  addBlock(type: string, position: { x: number; y: number }): BlockIdT;
  removeBlock(id: BlockIdT): void;
  getBlockPosition(id: BlockIdT): { x: number; y: number } | undefined;
  setBlockPosition(id: BlockIdT, position: { x: number; y: number }): void;

  // Edge operations
  addEdge(source: BlockIdT, sourcePort: string, target: BlockIdT, targetPort: string): string;
  removeEdge(id: string): void;

  // Optional (main patch only)
  updateBlockParams?(id: BlockIdT, params: Record<string, unknown>): void;
  updateBlockDisplayName?(id: BlockIdT, displayName: string): { error?: string };
  updateInputPort?(blockId: BlockIdT, portId: string, updates: unknown): void;
  updateInputPortCombineMode?(blockId: BlockIdT, portId: string, mode: CombineMode): void;
}
```

---

### P0 [HIGH] Implement PatchStoreAdapter

**Dependencies:** GraphDataAdapter interface
**Spec Reference:** PatchStore as single source of truth (CLAUDE.md)
**Status Reference:** EVALUATION - PatchStore Actions listing

#### Description

Create an adapter that wraps PatchStore + LayoutStore to implement GraphDataAdapter. This adapter must preserve all existing sync behavior including:
- MobX reactivity (blocks/edges are observable)
- Position persistence to LayoutStore
- Event emission (BlockAdded, EdgeRemoved, etc.)

#### Acceptance Criteria

- [ ] Class `PatchStoreAdapter` in `src/ui/graphEditor/PatchStoreAdapter.ts`
- [ ] Implements `GraphDataAdapter<BlockId>`
- [ ] Constructor takes `PatchStore` and `LayoutStore`
- [ ] `blocks` getter returns `patchStore.blocks`
- [ ] `edges` getter returns `patchStore.edges`
- [ ] `addBlock` calls `patchStore.addBlock` and `layoutStore.setPosition`
- [ ] `removeBlock` calls `patchStore.removeBlock` and `layoutStore.removePosition`
- [ ] `getBlockPosition` reads from LayoutStore
- [ ] `setBlockPosition` writes to LayoutStore
- [ ] `addEdge` calls `patchStore.addEdge`
- [ ] `removeEdge` calls `patchStore.removeEdge`
- [ ] All optional methods implemented
- [ ] Unit tests verify all operations

#### Technical Notes

The adapter is a thin wrapper - it should not duplicate any logic from PatchStore. Positions come from LayoutStore, not PatchStore (per existing architecture).

---

### P0 [HIGH] Implement CompositeStoreAdapter

**Dependencies:** GraphDataAdapter interface
**Spec Reference:** CompositeEditorStore state management
**Status Reference:** EVALUATION - CompositeEditorStore Actions listing

#### Description

Create an adapter that wraps CompositeEditorStore to implement GraphDataAdapter. Key differences from PatchStoreAdapter:
- Positions are stored inline in InternalBlockState (not separate store)
- Edge storage uses InternalEdge array format
- No LayoutStore integration

#### Acceptance Criteria

- [ ] Class `CompositeStoreAdapter` in `src/ui/graphEditor/CompositeStoreAdapter.ts`
- [ ] Implements `GraphDataAdapter<InternalBlockId>`
- [ ] Constructor takes `CompositeEditorStore`
- [ ] `blocks` returns a transformed view of `store.internalBlocks`
- [ ] `edges` returns transformed `store.internalEdges`
- [ ] `addBlock` calls `store.addBlock`
- [ ] `removeBlock` calls `store.removeBlock`
- [ ] `getBlockPosition` reads from InternalBlockState.position
- [ ] `setBlockPosition` calls `store.updateBlockPosition`
- [ ] `addEdge` calls `store.addEdge` (transforms endpoint format)
- [ ] `removeEdge` calls `store.removeEdge` (transforms from edge ID)
- [ ] Optional param methods return undefined (not supported for composites)
- [ ] Unit tests verify all operations

#### Technical Notes

Edge ID format differs between stores:
- PatchStore: `e0`, `e1`, etc. (string IDs)
- CompositeEditorStore: No explicit ID, edges identified by (fromBlock, fromPort, toBlock, toPort)

The adapter should generate synthetic edge IDs for the composite case and maintain a map for removal.

---

### P1 [HIGH] Define BlockLike and EdgeLike Types

**Dependencies:** None (can parallel with interface)
**Spec Reference:** Block and Edge types from graph/Patch.ts
**Status Reference:** EVALUATION - Key Differences in Data Models

#### Description

Define the common shape types that both stores' data can be transformed into. These types should capture the minimum information needed for rendering.

#### Acceptance Criteria

- [ ] `BlockLike` type defined capturing: id, type, displayName, inputPorts, outputPorts
- [ ] `EdgeLike` type defined capturing: id, source, sourcePort, target, targetPort
- [ ] Types are minimal but sufficient for node/edge rendering
- [ ] Types have TSDoc explaining purpose
- [ ] No store-specific information leaks into these types

#### Technical Notes

```typescript
interface BlockLike {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly params: Record<string, unknown>;
  readonly inputPorts: ReadonlyMap<string, InputPortLike>;
  readonly outputPorts: ReadonlyMap<string, OutputPortLike>;
}

interface InputPortLike {
  readonly id: string;
  readonly combineMode: CombineMode;
  readonly defaultSource?: DefaultSource;
}

interface OutputPortLike {
  readonly id: string;
}

interface EdgeLike {
  readonly id: string;
  readonly sourceBlockId: string;
  readonly sourcePortId: string;
  readonly targetBlockId: string;
  readonly targetPortId: string;
}
```

---

### P1 [HIGH] Add MobX Observability to Adapters

**Dependencies:** Both adapters implemented
**Spec Reference:** MobX stores architecture (CLAUDE.md)
**Status Reference:** EVALUATION - MobX reaction sync mentioned

#### Description

Ensure adapters properly expose MobX observability so ReactFlow can react to changes. The underlying stores are already observable; adapters must not break this.

#### Acceptance Criteria

- [ ] `PatchStoreAdapter.blocks` is MobX-observable (computed from patchStore.blocks)
- [ ] `PatchStoreAdapter.edges` is MobX-observable (computed from patchStore.edges)
- [ ] `CompositeStoreAdapter.blocks` is MobX-observable
- [ ] `CompositeStoreAdapter.edges` is MobX-observable
- [ ] Test: MobX reaction fires when underlying store changes
- [ ] No unnecessary re-renders from adapter layer

#### Technical Notes

Use `@computed` getters or `computed` from mobx. Do not create new Maps/Arrays on every access - use memoization pattern from PatchStore._snapshotCache.

## Dependencies

This sprint has no external dependencies. All work items can be parallelized after the interface is defined.

## Risks

- **Risk:** Generic type complexity making interface hard to use
  - **Mitigation:** Keep generics minimal (just BlockIdT), use sensible defaults

- **Risk:** MobX reactivity broken by adapter layer
  - **Mitigation:** Unit tests specifically for reactivity; test with observer components
