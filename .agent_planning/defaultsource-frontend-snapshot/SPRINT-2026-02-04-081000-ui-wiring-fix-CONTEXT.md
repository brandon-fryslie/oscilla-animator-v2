# Implementation Context: ui-wiring-fix

Generated: 2026-02-04T08:10:00

## Architecture: Two Rendering Paths

There are two rendering paths for the graph editor:

| Path | Files | Status |
|------|-------|--------|
| **LIVE** | `GraphEditorCore.tsx` → `nodeDataTransform.ts` via `PatchStoreAdapter` | Active, used by app |
| **DEAD** | `sync.ts` → `nodes.ts` | Never called, delete |

The live path uses `BlockLike` / `InputPortLike` / `OutputPortLike` interfaces from `types.ts`. The dead path uses raw `Block` / `Edge` types from `Patch.ts`.

## Key Files and Line Numbers

### Files to Modify

| File | What | Key Lines |
|------|------|-----------|
| `src/ui/graphEditor/types.ts` | Add `resolvedType` to port types | `InputPortLike` L23-28, `OutputPortLike` L33-35 |
| `src/ui/graphEditor/PatchStoreAdapter.ts` | Populate `resolvedType`, add `dataVersion` | `transformInputPorts` L215-244, `transformOutputPorts` L250-262, `blocks` computed L54-75 |
| `src/ui/graphEditor/nodeDataTransform.ts` | Use `resolvedType` over registry type | `createNodeFromBlockLike` L164-173 (inputs), L183 (outputs) |
| `src/ui/graphEditor/GraphEditorCore.tsx` | Track `dataVersion` in reaction | Reaction L465-487 |
| `src/ui/reactFlowEditor/ReactFlowEditor.tsx` | Fix constructor call | L107 (useStores), L127 (constructor) |
| `src/ui/graphEditor/__tests__/PatchStoreAdapter.test.ts` | Fix constructor call | L26 |

### Files to Delete

| File | Reason |
|------|--------|
| `src/ui/reactFlowEditor/sync.ts` | Zero external imports, dead code |

### Files to Strip

| File | Keep | Remove |
|------|------|--------|
| `src/ui/reactFlowEditor/nodes.ts` | `OscillaEdgeData` type (used by `nodeDataTransform.ts`, `OscillaEdge.tsx`) | All functions, `FrontendResultStore` import, all other types IF their consumers are dead |

### Files That Should NOT Change

| File | Reason |
|------|--------|
| `src/stores/FrontendResultStore.ts` | Backend is done |
| `src/stores/RootStore.ts` | Already wired |
| `src/services/CompileOrchestrator.ts` | Already wired |
| `src/compiler/compile.ts` | Already accepts precomputed frontend |

## FrontendResultStore API (for reference)

```typescript
// Queries used by PatchStoreAdapter:
getDefaultSourceByIds(blockId: string, portId: string): DefaultSource | undefined
getResolvedPortTypeByIds(blockId: string, portId: string, dir: 'in' | 'out'): CanonicalType | undefined

// Observable:
snapshot.status: 'none' | 'frontendOk' | 'frontendError'
snapshot.patchRevision: number
```

## MobX Reactivity Chain

```
FrontendResultStore.snapshot (observable)
  → PatchStoreAdapter.blocks (computed, reads snapshot)
    → PatchStoreAdapter.dataVersion (computed, reads snapshot.patchRevision)
      → GraphEditorCore reaction data function (tracks dataVersion)
        → reconcileNodesFromAdapter() → setNodes/setEdges
```

## Type Import

`InferenceCanonicalType` is from `src/core/inference-types.ts`. This is the standard type used throughout the UI for port type display. Already imported by `nodeDataTransform.ts`.

## Test Fixtures

`PatchStoreAdapter.test.ts` will need a `FrontendResultStore` instance. The store has a no-arg constructor and starts with `snapshot.status === 'none'`, so existing test behavior (registry fallback) is preserved by default.

## Dead Code Consumers to Check

Before deleting `nodes.ts` functions, verify these files:
- `OscillaNode.tsx` — imports `OscillaNodeData`, `PortData` types. Is `OscillaNode` registered as a ReactFlow node type in the live path? Check `GraphEditorCore.tsx` for `nodeTypes`.
- `PortInfoPopover.tsx` — imports `PortData` type. Is it used in `UnifiedNode.tsx`?

If these components are only used by the dead path, they can be deleted too. If they're shared, keep the types they need.
