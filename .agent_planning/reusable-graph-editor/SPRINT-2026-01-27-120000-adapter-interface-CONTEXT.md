# Implementation Context: adapter-interface

**Generated:** 2026-01-27-120000
**Status:** READY FOR IMPLEMENTATION
**Plan:** SPRINT-2026-01-27-120000-adapter-interface-PLAN.md

## File Paths and Locations

### New Files to Create

```
src/ui/graphEditor/
  types.ts              # Interface + BlockLike/EdgeLike types
  PatchStoreAdapter.ts  # Adapter for main patch
  CompositeStoreAdapter.ts  # Adapter for composite editor
  index.ts              # Module exports
  __tests__/
    PatchStoreAdapter.test.ts
    CompositeStoreAdapter.test.ts
```

## Existing Code to Reference

### PatchStore Interface (src/stores/PatchStore.ts)

Key methods to wrap:
```typescript
// Lines 247-308: addBlock
addBlock(type: BlockType, params: Record<string, unknown> = {}, options?: BlockOptions): BlockId

// Lines 316-355: removeBlock
removeBlock(id: BlockId): void

// Lines 361-407: updateBlockParams
updateBlockParams(id: BlockId, params: Partial<Record<string, unknown>>): void

// Lines 417-462: updateBlockDisplayName
updateBlockDisplayName(id: BlockId, displayName: string): { error?: string }

// Lines 469-529: updateInputPort
updateInputPort(blockId: BlockId, portId: string, updates: Partial<InputPort>): void

// Lines 535-537: updateInputPortCombineMode
updateInputPortCombineMode(blockId: BlockId, portId: PortId, combineMode: CombineMode): void

// Lines 633-659: addEdge
addEdge(from: Endpoint, to: Endpoint, options?: EdgeOptions): string

// Lines 665-678: removeEdge
removeEdge(id: string): void
```

### LayoutStore Interface (src/stores/LayoutStore.ts - check actual file)

Key methods:
```typescript
getPosition(blockId: BlockId): { x: number; y: number } | undefined
setPosition(blockId: BlockId, position: { x: number; y: number }): void
removePosition(blockId: BlockId): void
```

### CompositeEditorStore Interface (src/stores/CompositeEditorStore.ts)

Key methods (lines 411-483):
```typescript
addBlock(type: string, position: { x: number; y: number }): InternalBlockId
removeBlock(id: InternalBlockId): void
updateBlockPosition(id: InternalBlockId, position: { x: number; y: number }): void
addEdge(edge: InternalEdge): void
removeEdge(fromBlock: InternalBlockId, fromPort: string, toBlock: InternalBlockId, toPort: string): void
```

### Type Imports

From `src/types/index.ts` or `src/graph/Patch.ts`:
```typescript
import type { BlockId, PortId, CombineMode, DefaultSource } from '../../types';
import type { Block, Edge, InputPort, OutputPort, Endpoint } from '../../graph/Patch';
```

From `src/blocks/composite-types.ts`:
```typescript
import type { InternalBlockId, InternalEdge, InternalBlockDef } from '../../blocks/composite-types';
```

## Pattern to Follow: PatchStore Snapshot Cache

Reference `src/stores/PatchStore.ts` lines 86-201 for the snapshot cache pattern:

```typescript
// From PatchStore - this pattern prevents excessive object creation
private _snapshotCache: ImmutablePatch | null = null;
private _snapshotVersion = 0;
private _dataVersion = 0;

private invalidateSnapshot(): void {
  this._dataVersion++;
  this._snapshotCache = null;
}

get patch(): ImmutablePatch {
  const currentVersion = this._dataVersion;
  if (this._snapshotCache !== null && this._snapshotVersion === currentVersion) {
    return this._snapshotCache;
  }
  // ... create snapshot
}
```

Use similar pattern in adapters if creating derived collections.

## Pattern to Follow: sync.ts SyncHandle

Reference `src/ui/reactFlowEditor/sync.ts` lines 32-38:

```typescript
export interface SyncHandle {
  patchStore: PatchStore;
  layoutStore: LayoutStore;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<ReactFlowEdge[]>>;
  getNodes: () => Node[];
}
```

The adapter should be simpler - it just wraps the store, not the React state setters.

## MobX Patterns

From PatchStore (lines 102-122):
```typescript
makeObservable<PatchStore, '_data' | '_dataVersion'>(this, {
  _data: observable,
  _dataVersion: observable,
  patch: computed,
  blocks: computed,
  edges: computed,
  // ... actions
});
```

For adapters, use:
```typescript
import { makeObservable, computed } from 'mobx';

class PatchStoreAdapter {
  constructor(private patchStore: PatchStore, private layoutStore: LayoutStore) {
    makeObservable(this, {
      blocks: computed,
      edges: computed,
    });
  }

  get blocks() {
    return this.patchStore.blocks; // Already observable
  }
}
```

## Edge ID Generation for CompositeStoreAdapter

CompositeEditorStore edges don't have explicit IDs. Generate them:

```typescript
// Pattern used in CompositeInternalGraph.tsx line 259-268
function createEdgeFromInternalEdge(edge: InternalEdge, index: number): ReactFlowEdge {
  return {
    id: `edge-${edge.fromBlock}-${edge.fromPort}-${edge.toBlock}-${edge.toPort}-${index}`,
    // ...
  };
}
```

For the adapter, use a similar deterministic ID scheme so `removeEdge(id)` can parse it back to the 4-tuple needed by `store.removeEdge()`.

## Test Setup Pattern

Reference existing tests like `src/stores/__tests__/PatchStore.test.ts` (if exists) or:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../../stores/PatchStore';
import { LayoutStore } from '../../stores/LayoutStore';
import { PatchStoreAdapter } from '../PatchStoreAdapter';

describe('PatchStoreAdapter', () => {
  let patchStore: PatchStore;
  let layoutStore: LayoutStore;
  let adapter: PatchStoreAdapter;

  beforeEach(() => {
    patchStore = new PatchStore();
    layoutStore = new LayoutStore();
    adapter = new PatchStoreAdapter(patchStore, layoutStore);
  });

  it('exposes blocks from PatchStore', () => {
    patchStore.addBlock('Const', { value: 1 });
    expect(adapter.blocks.size).toBe(1);
  });

  // ... more tests
});
```

## Block Definition Lookup

Both adapters will need to look up block definitions for port info:

```typescript
import { getBlockDefinition, requireBlockDef } from '../../blocks/registry';

// Safe lookup
const def = getBlockDefinition(blockType);
if (!def) { /* handle missing */ }

// Throwing lookup (when block must exist)
const def = requireBlockDef(blockType);
```

## Module Export Pattern

Create `src/ui/graphEditor/index.ts`:

```typescript
export type { GraphDataAdapter, BlockLike, EdgeLike, InputPortLike, OutputPortLike } from './types';
export { PatchStoreAdapter } from './PatchStoreAdapter';
export { CompositeStoreAdapter } from './CompositeStoreAdapter';
```
