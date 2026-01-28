# Sprint: Action Executor - Dispatch and Execute
Generated: 2026-01-28-070815
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-2026-01-28-070441.md

## Sprint Goal
Create central action execution dispatcher that routes DiagnosticAction objects to appropriate store mutations and navigation methods.

## Scope
**Deliverables:**
- Action executor module with executeAction function
- Handlers for all 7 action kinds
- Error handling for invalid IDs or failed mutations
- Event emission for graph mutations

## Work Items

### P0: Create Action Executor Module Structure
**Confidence**: HIGH
**Dependencies**: Sprint 1 (Type Definitions), Sprint 2 (Action Attachment)
**Spec Reference**: 07-diagnostics-system.md:835-854 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 102-135

#### Description
Create new file `src/diagnostics/actionExecutor.ts` with central dispatch function. This module receives a DiagnosticAction and routes it to appropriate store methods based on action.kind discriminator.

Core architecture:
- Single executeAction() function with switch on action.kind
- Dependency injection of store references (PatchStore, SelectionStore, etc.)
- Returns success/failure status
- Validates IDs before mutations (blockId exists, etc.)

```typescript
export interface ActionExecutorDeps {
  patchStore: PatchStore;
  selectionStore: SelectionStore;
  diagnosticsStore: DiagnosticsStore;
  eventHub: EventHub;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export function executeAction(
  action: DiagnosticAction,
  deps: ActionExecutorDeps
): ActionResult {
  switch (action.kind) {
    case 'goToTarget': return handleGoToTarget(action, deps);
    case 'insertBlock': return handleInsertBlock(action, deps);
    case 'removeBlock': return handleRemoveBlock(action, deps);
    case 'addAdapter': return handleAddAdapter(action, deps);
    case 'createTimeRoot': return handleCreateTimeRoot(action, deps);
    case 'muteDiagnostic': return handleMuteDiagnostic(action, deps);
    case 'openDocs': return handleOpenDocs(action, deps);
    default:
      const _exhaustive: never = action;
      return { success: false, error: 'Unknown action kind' };
  }
}
```

#### Acceptance Criteria
- [ ] File src/diagnostics/actionExecutor.ts exists
- [ ] executeAction function exported with correct signature
- [ ] Switch statement covers all 7 action kinds
- [ ] TypeScript exhaustiveness check catches missing cases (default: never)
- [ ] Dependencies injected via ActionExecutorDeps interface
- [ ] Returns ActionResult with success/error fields

#### Technical Notes
- Use discriminated union exhaustiveness checking (default: never)
- Keep executeAction pure - all side effects in handler functions
- Validate deps at runtime (throw if null/undefined)
- File location: src/diagnostics/actionExecutor.ts (new file)

---

### P0: Implement goToTarget Handler
**Confidence**: HIGH
**Dependencies**: P0 (Action Executor Module Structure)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 137-145

#### Description
Navigate to a target in the UI using SelectionStore. Target can be block, port, edge, or patch. Most common case is block navigation.

```typescript
function handleGoToTarget(
  action: GoToTargetAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { selectionStore } = deps;
  const { target } = action;

  switch (target.kind) {
    case 'block':
      selectionStore.selectBlock(target.blockId);
      return { success: true };
    case 'port':
      // Select block and highlight port
      selectionStore.selectBlock(target.blockId);
      // TODO: Add port highlighting if supported
      return { success: true };
    case 'edge':
      selectionStore.selectEdge(target.edgeId);
      return { success: true };
    default:
      return { success: false, error: `Unsupported target kind: ${target.kind}` };
  }
}
```

#### Acceptance Criteria
- [ ] goToTarget action selects block using SelectionStore.selectBlock()
- [ ] goToTarget with port target selects containing block
- [ ] goToTarget with edge target uses SelectionStore.selectEdge()
- [ ] Returns success: true on successful navigation
- [ ] Returns success: false with error if target kind unsupported
- [ ] Unit test verifies selection changes after goToTarget execution

#### Technical Notes
- SelectionStore.selectBlock() at line 297
- SelectionStore.selectEdge() exists (check file for exact name)
- No validation needed - selection can fail silently
- UI will scroll/highlight based on SelectionStore state

---

### P0: Implement createTimeRoot Handler
**Confidence**: HIGH
**Dependencies**: P0 (Action Executor Module Structure)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 214-226

#### Description
Create an InfiniteTimeRoot block using PatchStore.addBlock(). This is the highest-value action - fixes E_TIME_ROOT_MISSING error.

```typescript
function handleCreateTimeRoot(
  action: CreateTimeRootAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  if (action.timeRootKind !== 'Infinite') {
    return { success: false, error: `Unsupported timeRootKind: ${action.timeRootKind}` };
  }

  const blockId = patchStore.addBlock('InfiniteTimeRoot', {}, {
    label: 'Time Root',
    role: 'timeRoot',
  });

  // Select newly created block
  selectionStore.selectBlock(blockId);

  return { success: true };
}
```

#### Acceptance Criteria
- [ ] Creates InfiniteTimeRoot block using PatchStore.addBlock()
- [ ] Block has role 'timeRoot' in options
- [ ] Newly created block is selected in SelectionStore
- [ ] Returns success: true with no error
- [ ] Unit test verifies block exists after execution
- [ ] Integration test verifies E_TIME_ROOT_MISSING resolves after action

#### Technical Notes
- PatchStore.addBlock() signature: (type, params, options?) => BlockId
- BlockOptions interface has role field (line 32 in PatchStore.ts)
- 'InfiniteTimeRoot' is block type name - verify in block registry
- Action is idempotent-ish: creates new block each time (safe, but multiple clicks = multiple blocks)

---

### P0: Implement removeBlock Handler
**Confidence**: HIGH
**Dependencies**: P0 (Action Executor Module Structure)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 265-272

#### Description
Remove a block using PatchStore.removeBlock(). Validates block exists before removal.

```typescript
function handleRemoveBlock(
  action: RemoveBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore } = deps;
  const { blockId } = action;

  // Validate block exists
  const patch = patchStore.snapshot;
  if (!patch.blocks[blockId]) {
    return { success: false, error: `Block ${blockId} not found` };
  }

  patchStore.removeBlock(blockId);
  return { success: true };
}
```

#### Acceptance Criteria
- [ ] Validates block exists before removal
- [ ] Returns success: false if block not found
- [ ] Calls PatchStore.removeBlock() if block exists
- [ ] Returns success: true after successful removal
- [ ] Unit test verifies block removed from patch
- [ ] Unit test verifies error when block doesn't exist

#### Technical Notes
- PatchStore.removeBlock() at line 330
- Method already handles edge cascade (removes connected edges)
- Method already emits BlockRemoved events
- No need to clear selection - SelectionStore listens to BlockRemoved events

---

### P1: Implement insertBlock Handler
**Confidence**: MEDIUM
**Dependencies**: P0 (Action Executor Module Structure)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 260-272

#### Description
Insert a new block with optional positioning relative to another block. Position can be 'before' or 'after' nearBlockId.

**Challenge**: PatchStore.addBlock() doesn't support positioning - blocks are added without layout constraints. May need to:
1. Add block normally, then set position metadata
2. Use separate layout system (if exists)
3. Defer positioning to future layout enhancement

```typescript
function handleInsertBlock(
  action: InsertBlockAction,
  deps: ActionExecutorDeps
): ActionResult {
  const { patchStore, selectionStore } = deps;

  // Basic implementation: add block without positioning
  const blockId = patchStore.addBlock(action.blockType, {}, {
    label: action.blockType,
  });

  // TODO: Handle position/nearBlockId if layout system exists

  selectionStore.selectBlock(blockId);
  return { success: true };
}
```

#### Acceptance Criteria
- [ ] Creates block using PatchStore.addBlock()
- [ ] Newly created block is selected
- [ ] Returns success: true
- [ ] Unit test verifies block creation
- [ ] Documentation notes that position/nearBlockId are not yet implemented

#### Technical Notes
- PatchStore has no layout/positioning methods currently
- position and nearBlockId fields may be unused initially
- Consider adding TODO comment for future layout integration
- This is MEDIUM confidence because positioning is unclear

#### Unknowns to Resolve
1. Does oscilla have a layout system for block positioning?
2. Should position be stored as metadata, or is it purely visual (UI-only)?
3. Is position/nearBlockId essential, or can we defer it?

#### Exit Criteria (to reach HIGH confidence)
- [ ] Layout system is documented (or confirmed absent)
- [ ] Decision made: implement positioning, store as metadata, or defer
- [ ] If deferred, acceptance criteria updated to remove positioning requirement

---

### P0: Implement Remaining Handlers (addAdapter, muteDiagnostic, openDocs)
**Confidence**: HIGH (muteDiagnostic, openDocs), MEDIUM (addAdapter)
**Dependencies**: P0 (Action Executor Module Structure)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md

#### Description
Implement the remaining 3 action handlers:

**addAdapter** (MEDIUM):
- Similar to insertBlock - create adapter block between two ports
- Challenge: Requires edge manipulation (remove old edge, add adapter, add 2 new edges)
- May need helper function to find edge between ports

**muteDiagnostic** (HIGH):
- Mark diagnostic as muted in DiagnosticsStore
- Requires adding muted diagnostics tracking to DiagnosticsStore

**openDocs** (HIGH):
- Open URL in browser using window.open() or similar
- Purely UI action, no graph mutation

#### Acceptance Criteria (addAdapter)
- [ ] Finds existing edge between fromPort and target
- [ ] Creates adapter block of specified adapterType
- [ ] Creates edges: source → adapter → target
- [ ] Removes old direct edge
- [ ] Returns success: true
- [ ] Unit test verifies adapter inserted in edge path

#### Acceptance Criteria (muteDiagnostic)
- [ ] Adds diagnosticId to DiagnosticsStore muted list
- [ ] Diagnostic no longer appears in UI
- [ ] Returns success: true
- [ ] Unit test verifies diagnostic muted

#### Acceptance Criteria (openDocs)
- [ ] Opens docUrl in new browser tab
- [ ] Returns success: true
- [ ] Unit test mocks window.open and verifies call

#### Technical Notes
- addAdapter is complex - may warrant separate work item
- muteDiagnostic requires DiagnosticsStore enhancement (add muted set)
- openDocs is trivial: `window.open(action.docUrl, '_blank')`

---

## Dependencies
- **Sprint 1 (Type Definitions)** - MUST be complete (provides DiagnosticAction types)
- **Sprint 2 (Action Attachment)** - Should be complete (provides actions to execute)
- **PatchStore** - Ready (lines 250, 330)
- **SelectionStore** - Ready (line 297)
- **EventHub** - Ready (already integrated in PatchStore)

## Risks
**Risk**: Undo/redo integration unclear  
**Mitigation**: Implement basic execution first, add undo/redo in Sprint 5  
**Likelihood**: High - evaluation notes this as uncertainty

**Risk**: Block positioning (insertBlock) not supported  
**Mitigation**: Create block without position, document limitation  
**Likelihood**: Medium - no layout system found in evaluation

**Risk**: addAdapter complexity underestimated  
**Mitigation**: Mark as MEDIUM confidence, may split into separate work item  
**Likelihood**: Medium - requires edge manipulation logic
