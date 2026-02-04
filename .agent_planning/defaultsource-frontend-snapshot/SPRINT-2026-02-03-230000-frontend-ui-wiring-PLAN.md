# Sprint: frontend-ui-wiring - Make UI Normalization-Aware via FrontendResult

Generated: 2026-02-03T23:00:00 (revised 2026-02-04T00:00:00 after ChatGPT review)
Confidence: HIGH: 7, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Wire the compiler frontend's `FrontendResult` to the UI layer so the graph editor displays accurate default source indicators, resolved port types, and edge provenance — driven by the compiler frontend, not the static block registry. Use canonical addresses as the standard external query API.

## Context

### Current State
- `compileFrontend()` exists and is well-tested but only used in tests — not in the production compile path.
- `compile()` in `compile.ts` duplicates frontend work inline. Does NOT call `compileFrontend()`.
- `CompileOrchestrator.compileAndSwap()` calls `compile()` → only `CompiledProgramIR` reaches the UI.
- UI reads from static block registry via `getEffectiveDefaultSource()` — bypasses compiled artifacts.
- Canonical Address system exists (`v1:blocks.{name}.inputs.{port}`) — used by expression system and `AddressRegistry`.

### Target State
```
PatchStore (user blocks/edges)
  → compileFrontend() → FrontendResult
    → FrontendSnapshot (stable UI contract, canonical-address-queryable)
      → UI reads snapshot for display
  → compile(patch, { precomputedFrontend }) → CompiledProgramIR
    → Runtime executes program
```

## Work Items

### WI-1: Create FrontendSnapshot type and FrontendResultStore [HIGH]

Create a **stable UI contract** (`FrontendSnapshot`) derived from `FrontendResult`, and a MobX store to hold it. The snapshot is an explicit projection — UI never depends on raw compiler internals.

**Files:**
- `src/stores/FrontendResultStore.ts` (new)

**FrontendSnapshot shape:**
```typescript
interface FrontendSnapshot {
  /** Status of the frontend compilation */
  readonly status: 'none' | 'frontendOk' | 'frontendError';

  /** Patch revision this snapshot was produced from */
  readonly patchRevision: number;

  /** Per-port effective source provenance, keyed by canonical address string */
  readonly portProvenance: ReadonlyMap<string, PortProvenance>;

  /** Per-port resolved type, keyed by canonical address string */
  readonly resolvedPortTypes: ReadonlyMap<string, CanonicalType>;

  /** Frontend errors (present even in partial results) */
  readonly errors: readonly FrontendError[];

  /** Whether the backend can proceed */
  readonly backendReady: boolean;

  /** Cycle summary for UI (future use) */
  readonly cycleSummary: CycleSummary | null;
}

type PortProvenance =
  | { kind: 'userEdge' }
  | { kind: 'defaultSource'; sourceBlockType: string }
  | { kind: 'adapter'; adapterType: string }
  | { kind: 'unresolved' };
```

**FrontendResultStore shape:**
```typescript
class FrontendResultStore {
  // Observable
  snapshot: FrontendSnapshot;  // starts as { status: 'none', ... }

  // Actions
  updateFromFrontendResult(result: FrontendResult, patchRevision: number, patch: Patch): void;
  clear(): void;

  // Queries (canonical address based)
  hasDefaultSource(canonicalAddr: string): boolean;
  getResolvedPortType(canonicalAddr: string): CanonicalType | undefined;
  getPortProvenance(canonicalAddr: string): PortProvenance | undefined;

  // Convenience queries (blockId + portId based, for UI compatibility)
  hasDefaultSourceByIds(blockId: string, portId: string): boolean;
  getResolvedPortTypeByIds(blockId: string, portId: string, dir: 'in' | 'out'): CanonicalType | undefined;
}
```

**Key design decisions:**
- `FrontendSnapshot` is the UI contract — stable, explicit fields, no compiler internals leaking through.
- `updateFromFrontendResult()` builds the snapshot: translates `PortKey` → canonical address, extracts provenance from normalized edges, captures resolved types.
- Canonical addresses are the **external query API**. Internally, the store builds `Map<string, ...>` keyed by canonical address strings (e.g., `"v1:blocks.my_circle.inputs.pos"`).
- The id-based convenience queries (`hasDefaultSourceByIds`) build an internal `blockId→canonicalName` map for translation. This lets the UI incrementally migrate to canonical addresses without a big-bang change.
- Provenance is general — not just default sources. Covers user edges, default sources, adapters, and unresolved ports. This sets the foundation for future provenance features.

**Acceptance Criteria:**
- [ ] `FrontendSnapshot` type is defined with status, revision, provenance, types, errors
- [ ] `FrontendResultStore` is a MobX store with observable `snapshot`
- [ ] `hasDefaultSource("v1:blocks.my_circle.inputs.pos")` returns true when appropriate
- [ ] `getResolvedPortType()` returns compiler-resolved types
- [ ] Convenience id-based queries work correctly
- [ ] Unit test verifies store observability and query methods

### WI-2: Integrate FrontendResultStore into RootStore [HIGH]

**File:** `src/stores/RootStore.ts` (modify)

**Changes:**
- Import and create `FrontendResultStore` instance
- Add `readonly frontend: FrontendResultStore` field

**Acceptance Criteria:**
- [ ] `RootStore.frontend` is accessible
- [ ] Store is created during RootStore construction

### WI-3: Update CompileOrchestrator — frontend-first with precomputed reuse [HIGH]

Modify `compileAndSwap()` to run `compileFrontend()` first, store the snapshot, then pass the pre-computed frontend result to `compile()` to avoid running frontend passes twice.

**File:** `src/services/CompileOrchestrator.ts` (modify)
**File:** `src/compiler/compile.ts` (modify — small change to accept precomputed frontend)

**New flow:**
```
1. compileFrontend(patch) → FrontendCompileResult
2. store.frontend.updateFromFrontendResult(result, revision, patch)
3. if backendReady:
     compile(patch, { precomputedFrontend: result }) → CompiledProgramIR
   else:
     emit failure diagnostics, keep old program
```

**Change to `compile()`:** Add optional `precomputedFrontend` to `CompileOptions`. When present, `compile()` skips its inline normalization + pass1 + pass2 and uses the pre-computed `NormalizedPatch` and `TypedPatch` directly. This is a small, surgical change:
- Extract `normalized` from `precomputedFrontend.normalizedPatch`
- Extract `typeResolved` from `precomputedFrontend.typedPatch` (which extends `TypeResolvedPatch`)
- Skip to pass3 (time topology)

This prevents drift between two frontend implementations (ChatGPT review concern) while keeping the change small. The monolithic `compile()` still works standalone when `precomputedFrontend` is not provided (tests, CLI, etc.).

**Acceptance Criteria:**
- [ ] `compileFrontend()` runs once, result reused by `compile()`
- [ ] `FrontendSnapshot` stored in `store.frontend` on every compilation
- [ ] `compile()` accepts `precomputedFrontend` option and skips inline frontend when provided
- [ ] `compile()` still works without `precomputedFrontend` (backward compatible)
- [ ] All existing tests pass
- [ ] Frontend errors surfaced through existing diagnostic channels

### WI-4: Update UI to read from FrontendResultStore [HIGH]

Replace registry-based lookups with `FrontendResultStore` queries. Port type display and default source indicators now come from the compiler frontend.

**Files:**
- `src/ui/reactFlowEditor/nodes.ts` (modify)
- `src/ui/reactFlowEditor/sync.ts` (modify)

**Changes to `nodes.ts`:**
- `getEffectiveDefaultSource()` checks `FrontendResultStore.hasDefaultSourceByIds()` first. If the store says there's a materialized default, return a `DefaultSource` indicator.
- Port type display (`typeTooltip`, `typeColor`) uses resolved types from `FrontendResultStore.getResolvedPortTypeByIds()` when available, falls back to registry when snapshot status is `'none'`.

**Changes to `sync.ts`:**
- `reconcileNodes()` receives `FrontendResultStore` (add parameter)
- `setupStructureReaction()` observes `store.frontend.snapshot` to trigger re-render when frontend result changes
- Thread `FrontendResultStore` through to `createNodeFromBlock()`

**Changes to `SyncHandle`:**
- Add `frontendResult: FrontendResultStore` to `SyncHandle` interface

**Acceptance Criteria:**
- [ ] Unconnected ports with materialized default sources show the default source indicator
- [ ] Port type colors/tooltips reflect resolved types from the frontend
- [ ] When snapshot status is `'none'` (before first compile), UI falls back to registry data
- [ ] UI only uses snapshot matching current patch revision (revision coherence)

### WI-5: Build canonical address index in FrontendResultStore [HIGH]

The `FrontendSnapshot` maps are keyed by canonical address strings. The `updateFromFrontendResult()` method must translate from `PortKey` (blockIndex-based) to canonical addresses.

**Implementation inside `updateFromFrontendResult()`:**
1. Build `blockIndex → Block` from `normalizedPatch.blocks[]`
2. For each block, compute canonical name using existing `getBlockAddress()` / `getInputAddress()` / `getOutputAddress()` from `src/graph/addressing.ts`
3. For each entry in `TypedPatch.portTypes` (keyed by `PortKey = "${blockIndex}:${portName}:in|out"`):
   - Parse blockIndex, look up block, build canonical address
   - Store in `resolvedPortTypes` map keyed by `addressToString(addr)`
4. For provenance: iterate `normalizedPatch.edges`, identify default-source edges by role, build `portProvenance` entries keyed by canonical address of the target port
5. Build internal `blockId → canonicalName` map for id-based convenience queries

**Acceptance Criteria:**
- [ ] `resolvedPortTypes` map is keyed by canonical address strings (e.g., `"v1:blocks.render_instances_2d.inputs.pos"`)
- [ ] `portProvenance` map correctly identifies default source edges
- [ ] Convenience queries translate `(blockId, portId)` → canonical address → map lookup
- [ ] Derived blocks (e.g., `_ds_...`) get canonical addresses too (they're in normalizedPatch)

### WI-6: Verify provenance edge shapes and test end-to-end [HIGH]

Verify the exact structure of normalized edges for default sources, adapters, and user wires. Write integration test.

**Research (to do during implementation):**
- Read `normalize-default-sources.ts` for edge `role` shapes
- Read `NormalizedEdge` type for field structure
- Confirm block `role` shapes for derived blocks

**Test:**
- Integration test using a patch with unconnected inputs → compile frontend → verify `FrontendSnapshot` has correct default source provenance
- Integration test with connected inputs → verify `userEdge` provenance
- Integration test with adapter edges → verify `adapter` provenance (if present in normalized edges)

**Acceptance Criteria:**
- [ ] Edge/block role shapes documented and verified
- [ ] Integration test: unconnected port → `defaultSource` provenance in snapshot
- [ ] Integration test: connected port → `userEdge` provenance in snapshot
- [ ] All provenance kinds exercised in tests

### WI-7: Commit DefaultSource polymorphism changes [HIGH]

Commit the existing uncommitted changes (DefaultSource polymorphism + field test file) as a separate commit before starting the FrontendSnapshot work.

**Files:**
- `src/blocks/signal/default-source.ts` (modified)
- `src/blocks/__tests__/default-source-field.test.ts` (new)
- `.agent_planning/plan-defaultsource-cardinality-fix.md` (stale, remove or archive)

**Acceptance Criteria:**
- [ ] Changes committed with descriptive message
- [ ] All tests pass after commit
- [ ] Stale plan file cleaned up

## Dependencies

- WI-7 (commit existing changes) should happen first to establish a clean baseline

## Risks

| Risk | Mitigation |
|------|------------|
| `compile()` change to accept precomputed frontend introduces regression | Small change (skip inline frontend when provided). All tests still use standalone `compile()`. |
| Canonical address construction for derived blocks may not work | `getBlockAddress()` works with any Block, including derived ones. Fall back to blockId-based address if canonical name is missing. |
| `FrontendSnapshot` type may need iteration | Explicit status field + general provenance model provides room for evolution without breaking consumers. |
| Stale snapshot displayed after edits | `patchRevision` field + UI checks revision coherence. |

## Non-Goals (Deferred)

- Full refactor of `compile()` into `compileFrontend()` + `compileBackend()` delegation (this sprint does the minimal `precomputedFrontend` shortcut)
- Showing derived blocks in the graph editor
- Cycle summary display in UI
- Replacing `getPortTypeFromBlockType()` in edge adapter label computation
