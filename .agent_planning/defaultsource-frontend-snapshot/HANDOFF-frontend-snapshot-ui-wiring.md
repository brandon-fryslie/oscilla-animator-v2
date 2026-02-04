# Handoff: DefaultSource Frontend Snapshot → UI Wiring

**Created**: 2026-02-04
**Status**: in-progress (backend complete, UI partially wired)

---

## Objective

Make the graph editor display default source indicators and resolved port types driven by the compiler frontend snapshot — not the static block registry.

## The Core Problem

There are **two parallel rendering paths** that both build ReactFlow nodes, and the wrong one is live:

| Path | Where | Used By | FrontendStore Aware? |
|------|-------|---------|---------------------|
| **OLD** `nodes.ts` + `sync.ts` | `src/ui/reactFlowEditor/` | Nothing (dead code) | Yes (we wired it) |
| **LIVE** `nodeDataTransform.ts` + `GraphEditorCore.tsx` | `src/ui/graphEditor/` | Actual app | Partially |

We spent time wiring `FrontendResultStore` into `nodes.ts` and `sync.ts`. That code is **never called**. The live app uses `GraphEditorCore.tsx` → `reconcileNodesFromAdapter()` → `createNodeFromBlockLike()` in `nodeDataTransform.ts`.

## Current State

### What's Done (Backend — solid)
- `FrontendResultStore` (`src/stores/FrontendResultStore.ts`) — works, tested, 14 passing tests
- `RootStore.frontend` integration
- `CompileOrchestrator.compileAndSwap()` calls `compileFrontend()` first, stores snapshot
- `compile()` accepts `precomputedFrontend` to avoid duplicate work
- `PortProvenance` carries full `DefaultSource` descriptor (blockType, output, params)
- `PatchStoreAdapter` (`src/ui/graphEditor/PatchStoreAdapter.ts`) reads `FrontendResultStore` correctly in `transformInputPorts()` (line 228)

### What's Partially Done (UI — the problem)
- `PatchStoreAdapter.blocks` computed reads `frontendStore.snapshot` (line 60) — MobX tracks it
- `PatchStoreAdapter.transformInputPorts()` populates `InputPortLike.defaultSource` from frontend store
- `nodeDataTransform.ts:160` reads `portState?.defaultSource` which IS the adapter value

### What's Broken
1. **MobX reaction doesn't detect data changes** — `GraphEditorCore.tsx:466` reaction tracks `blockCount`, `edgeCount`, `blockIds`, `edgeIds`. It does NOT observe `adapter.blocks` deeply. When the frontend snapshot changes, `InputPortLike.defaultSource` changes inside the block data, but block count/IDs don't change, so the reaction never fires.

2. **Port type colors still use registry types** — `nodeDataTransform.ts:168` passes `inputDef.type` (static registry type) to `createPortData()`. Should use frontend-resolved type when available.

### What's Dead Code (wasted effort)
- `nodes.ts:getEffectiveDefaultSource()` — never called in live path
- `sync.ts:setupStructureReaction()` — never called
- `sync.ts:reconcileNodes()` — never called
- `sync.ts:buildNodesAndEdges()` — never called

## What Needs to Happen

### The Simple Fix (do this)

**Fix 1: Make the MobX reaction observe data changes**

`GraphEditorCore.tsx:466` — add a fingerprint that changes when frontend snapshot changes:

```typescript
// In the reaction data function, add:
frontendRev: adapter.blocks.size > 0
  ? Array.from(adapter.blocks.values()).map(b =>
      Array.from(b.inputPorts.values()).map(p => p.defaultSource?.blockType ?? '').join(',')
    ).join('|')
  : '',
```

Or simpler: expose a `revision` or `dataVersion` number on the adapter that increments when the frontend snapshot changes. The `PatchStoreAdapter` already reads the snapshot in its `blocks` computed — adding a `get dataVersion()` that returns `this.frontendStore.snapshot.patchRevision` would work.

**Fix 2: Pass resolved types through the adapter**

Either:
- (a) Add resolved types to `InputPortLike` / `OutputPortLike` (so `nodeDataTransform.ts` can use them instead of `inputDef.type`), OR
- (b) Pass `FrontendResultStore` to `createNodeFromBlockLike()` directly

Option (a) is cleaner — it keeps `nodeDataTransform.ts` adapter-agnostic. The `PatchStoreAdapter.transformInputPorts()` already has access to the store; just add `resolvedType?: CanonicalType` to `InputPortLike`.

**Fix 3: Delete dead code**

Remove from `nodes.ts`:
- `getEffectiveDefaultSource()`

Remove from `sync.ts`:
- `setupStructureReaction()`
- `reconcileNodes()`
- `buildNodesAndEdges()`
- `SyncHandle` interface
- `FrontendResultStore` import and all threading

These are the old rendering path. They confuse agents into wiring things into the wrong place.

### Why This Keeps Happening

The codebase has **two complete rendering pipelines** for the same graph editor:
1. `src/ui/reactFlowEditor/` (old: `nodes.ts`, `sync.ts`, `OscillaNode.tsx`)
2. `src/ui/graphEditor/` (new: `nodeDataTransform.ts`, `GraphEditorCore.tsx`, `UnifiedNode.tsx`)

Both import from `reactFlowEditor/` for some shared utilities (`typeValidation.ts`, `OscillaEdge.tsx`, `layout.ts`). The old path's `nodes.ts` and `sync.ts` look like the main code (they have the most comments, they're well-structured), but they're dead. Any agent exploring the codebase will find them first and wire things into them.

**The fix that makes the right outcome inevitable**: delete `sync.ts` entirely and strip `nodes.ts` down to only its actually-used exports (`createEdgeFromPatchEdge`, `computeAllNonContributingEdges`, `OscillaEdgeData` type, `createNodeFromBlock` if used). Or better: move the shared utilities out and delete the rest.

## Key Files

| File | Role | Status |
|------|------|--------|
| `src/stores/FrontendResultStore.ts` | Store (backend) | ✅ Done |
| `src/stores/RootStore.ts` | Store wiring | ✅ Done |
| `src/services/CompileOrchestrator.ts` | Compile flow | ✅ Done |
| `src/compiler/compile.ts` | Precomputed frontend | ✅ Done |
| `src/ui/graphEditor/PatchStoreAdapter.ts` | Adapter (defaultSource) | ✅ Done |
| `src/ui/graphEditor/nodeDataTransform.ts` | Node creation | ❌ Needs resolved types |
| `src/ui/graphEditor/GraphEditorCore.tsx` | MobX reaction | ❌ Doesn't detect data changes |
| `src/ui/graphEditor/types.ts` | InputPortLike type | ❌ Needs resolvedType field |
| `src/ui/reactFlowEditor/nodes.ts` | Dead code | 🗑️ Strip or delete |
| `src/ui/reactFlowEditor/sync.ts` | Dead code | 🗑️ Delete entirely |

## Acceptance Criteria

- [ ] RenderInstances2D shows default source indicators on `pos`, `color`, `shape` (ports with NO registry defaultSource)
- [ ] Port type colors reflect compiler-resolved types, not static registry types
- [ ] Ellipse default source indicators still work (regression check)
- [ ] Adding/removing connections updates default source indicators reactively
- [ ] Dead code in `nodes.ts` / `sync.ts` removed
- [ ] All existing tests pass
- [ ] Typecheck passes

## Testing Strategy

### Automated
- Existing 2163 tests must pass
- Existing `FrontendResultStore` unit + integration tests (14 tests)

### Manual Verification
1. `npm run dev`
2. Open graph editor
3. Add a `RenderInstances2D` block — `pos`, `color`, `shape` inputs should show default source indicator dots
4. Wire a Const to `rx` on an Ellipse — indicator disappears
5. Disconnect — indicator reappears

## Next Steps for Agent

1. Read this handoff
2. Add `resolvedType?: InferenceCanonicalType` to `InputPortLike` and `OutputPortLike` in `types.ts`
3. Populate `resolvedType` in `PatchStoreAdapter.transformInputPorts()` from `frontendStore.getResolvedPortTypeByIds()`
4. Use `resolvedType` in `nodeDataTransform.ts:createNodeFromBlockLike()` instead of `inputDef.type`
5. Fix MobX reaction in `GraphEditorCore.tsx` to observe data changes (simplest: add frontier snapshot revision to tracked data)
6. Delete dead code in `sync.ts` and strip `nodes.ts`
7. Run tests + typecheck + manual verify
