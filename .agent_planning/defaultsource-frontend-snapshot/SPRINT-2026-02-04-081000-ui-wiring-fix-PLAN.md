# Sprint: ui-wiring-fix - Wire FrontendResultStore to Live Rendering Path

Generated: 2026-02-04T08:10:00
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Fix the frontend snapshot → UI wiring so default source indicators and resolved port types display correctly in the live graph editor, and delete dead code that misdirected the previous sprint.

## Context

The backend (`FrontendResultStore`, `CompileOrchestrator`, `compile()` precomputed path) is done and tested. The previous sprint wired the frontend store into `nodes.ts` + `sync.ts` — the old rendering path that is never called. The live path (`GraphEditorCore.tsx` → `nodeDataTransform.ts` via `PatchStoreAdapter`) needs three fixes plus dead code cleanup.

Additionally, the `PatchStoreAdapter` constructor was changed to require `FrontendResultStore` but two call sites weren't updated, causing typecheck failures.

## Work Items

### WI-1: Fix PatchStoreAdapter constructor call sites [HIGH]

Two call sites pass 2 arguments but the constructor now requires 3.

**Files:**
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx:127` — add `frontendStore` from `useStores()`
- `src/ui/graphEditor/__tests__/PatchStoreAdapter.test.ts:26` — create or mock a `FrontendResultStore`

**Changes:**
1. In `ReactFlowEditor.tsx:107`, destructure `frontend` from `useStores()`
2. In `ReactFlowEditor.tsx:127`, pass `frontend` as third arg: `new PatchStoreAdapter(patchStore, layoutStore, frontend)`
3. In `PatchStoreAdapter.test.ts:26`, create a minimal `FrontendResultStore` (or use the real class with no-arg constructor) and pass as third arg

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes (currently fails with 2 errors)
- [ ] `PatchStoreAdapter.test.ts` still passes
- [ ] ReactFlowEditor renders without errors

### WI-2: Add resolvedType to InputPortLike/OutputPortLike and populate from adapter [HIGH]

The live path uses `inputDef.type` (static registry type) for port colors. The adapter already has access to `FrontendResultStore` but `InputPortLike`/`OutputPortLike` have no type field.

**Files:**
- `src/ui/graphEditor/types.ts` — add `resolvedType?: InferenceCanonicalType` to `InputPortLike` and `OutputPortLike`
- `src/ui/graphEditor/PatchStoreAdapter.ts:transformInputPorts()` — populate `resolvedType` from `frontendStore.getResolvedPortTypeByIds()`
- `src/ui/graphEditor/PatchStoreAdapter.ts:transformOutputPorts()` — populate `resolvedType` from `frontendStore.getResolvedPortTypeByIds()`
- `src/ui/graphEditor/nodeDataTransform.ts:createNodeFromBlockLike()` — use `portState?.resolvedType` instead of `inputDef.type` when available

**Changes:**
1. In `types.ts`, add to `InputPortLike`:
   ```typescript
   readonly resolvedType?: InferenceCanonicalType;
   ```
   Same for `OutputPortLike`.

2. In `PatchStoreAdapter.transformInputPorts()`, when `blockId` is provided (frontend available), call `this.frontendStore.getResolvedPortTypeByIds(blockId, id, 'in')` and set `resolvedType` on the returned `InputPortLike`.

3. In `PatchStoreAdapter.transformOutputPorts()`, accept optional `blockId` param. When provided, call `this.frontendStore.getResolvedPortTypeByIds(blockId, id, 'out')` and set `resolvedType`.

4. In `nodeDataTransform.ts:164-173`, change `createPortData()` call to prefer `portState?.resolvedType ?? inputDef.type`:
   ```typescript
   createPortData(
     inputId,
     inputDef.label || inputId,
     portState?.resolvedType ?? inputDef.type,  // was: inputDef.type
     isConnected,
     defaultSource,
     connection,
     ...
   )
   ```
   Same for outputs at line 183: use output port's `resolvedType` when available.

**Acceptance Criteria:**
- [ ] Port type colors use compiler-resolved types when frontend snapshot is available
- [ ] Falls back to registry types when no snapshot (status === 'none')
- [ ] Typecheck passes
- [ ] Existing tests pass

### WI-3: Fix MobX reaction to observe frontend data changes [HIGH]

The reaction in `GraphEditorCore.tsx:465` only tracks structural keys (block/edge count + IDs). When the frontend snapshot changes port types or default sources, no structural change occurs, so the reaction doesn't fire.

**File:** `src/ui/graphEditor/GraphEditorCore.tsx`

**Approach:** Add a `dataVersion` getter to `PatchStoreAdapter` that returns the frontend snapshot's `patchRevision`. Include it in the reaction's data function.

**Changes:**
1. In `PatchStoreAdapter.ts`, add a public getter:
   ```typescript
   get dataVersion(): number {
     return this.frontendStore.snapshot.patchRevision;
   }
   ```
   Make it `computed` in `makeObservable`.

2. In `GraphEditorCore.tsx:466` reaction data function, add:
   ```typescript
   dataVersion: adapter.dataVersion,
   ```

This is clean because:
- `dataVersion` changes whenever the frontend snapshot updates (new patchRevision)
- It's a single number comparison — no string fingerprinting needed
- MobX tracks it automatically because `adapter.dataVersion` reads from `frontendStore.snapshot` (observable)

**Acceptance Criteria:**
- [ ] Changing graph connections triggers node re-render (regression)
- [ ] Frontend snapshot changes trigger node data update (new behavior)
- [ ] No unnecessary re-renders when data hasn't changed
- [ ] Typecheck passes

### WI-4: Delete dead code in sync.ts and strip nodes.ts [HIGH]

Dead code in the old rendering path misdirects agents and adds confusion. `sync.ts` has zero external imports. `nodes.ts` has one live export (`OscillaEdgeData` type).

**Files:**
- `src/ui/reactFlowEditor/sync.ts` — delete entire file
- `src/ui/reactFlowEditor/nodes.ts` — strip to only live exports

**Changes:**
1. Delete `src/ui/reactFlowEditor/sync.ts` entirely.

2. In `nodes.ts`, determine what's actually imported:
   - `OscillaEdgeData` type — imported by `nodeDataTransform.ts` and `OscillaEdge.tsx` (LIVE)
   - `OscillaNodeData`, `PortData` types — imported by `OscillaNode.tsx` and `PortInfoPopover.tsx` (legacy node component)
   - All functions (`createNodeFromBlock`, `createEdgeFromPatchEdge`, `computeAllNonContributingEdges`, `getEffectiveDefaultSource`, `getNonContributingEdges`, `getHandleId`) — only imported by `sync.ts` (being deleted) and tests

   **Decision:** Move `OscillaEdgeData` to `nodeDataTransform.ts` (it's already defining a local `PortData`). Update imports in `OscillaEdge.tsx`. Then assess whether `OscillaNode.tsx` and `PortInfoPopover.tsx` are dead (they reference old `OscillaNodeData`/`PortData` types — if `UnifiedNode.tsx` replaced them, they're dead too).

   If `OscillaNode.tsx`/`PortInfoPopover.tsx` are still imported somewhere, keep `OscillaNodeData` and `PortData` types in `nodes.ts` and strip the rest. If not, delete `nodes.ts` entirely.

3. Delete any tests that only test deleted functions (e.g., tests for `getEffectiveDefaultSource`).

**Acceptance Criteria:**
- [ ] `sync.ts` deleted
- [ ] `nodes.ts` stripped to only live exports (or deleted if all exports are dead)
- [ ] No import errors — all live code still compiles
- [ ] Typecheck passes
- [ ] All remaining tests pass

### WI-5: Verify end-to-end behavior [HIGH]

Run full test suite, typecheck, and confirm the handoff acceptance criteria.

**Verification steps:**
1. `npm run typecheck` — must pass clean
2. `npm run test` — all tests must pass
3. Verify no new console warnings in test output
4. Review that `FrontendResultStore` tests still pass (they shouldn't be affected, but confirm)

**Acceptance Criteria (from handoff):**
- [ ] RenderInstances2D default source indicators work (port data carries `defaultSource` from frontend store)
- [ ] Port type colors reflect compiler-resolved types
- [ ] Ellipse default source indicators still work (regression)
- [ ] Adding/removing connections updates indicators reactively
- [ ] Dead code removed
- [ ] All tests pass
- [ ] Typecheck passes

## Dependencies

WI-1 → WI-2, WI-3, WI-4 (fix build first)
WI-2, WI-3 are independent of each other
WI-4 is independent (dead code removal)
WI-5 runs last (verification)

## Risks

| Risk | Mitigation |
|------|------------|
| `OscillaNode.tsx` / `PortInfoPopover.tsx` may be imported by live code, complicating nodes.ts cleanup | Check imports before deleting. Keep types if needed. |
| `dataVersion` approach may fire too eagerly if patchRevision changes for non-visual reasons | patchRevision only changes on actual graph edits, which always need re-render anyway |
| `CompositeStoreAdapter` may also need `resolvedType` support | Out of scope — composite editor doesn't use frontend snapshot. `resolvedType` is optional on the interface. |
