# Definition of Done: Action Executor
Generated: 2026-01-28-070815
Status: PARTIALLY READY (1 MEDIUM confidence item)
Plan: SPRINT-2026-01-28-070815-action-exec-PLAN.md

## Acceptance Criteria

### Action Executor Module
- [ ] File src/diagnostics/actionExecutor.ts exists
- [ ] executeAction function exported with signature: (action, deps) => ActionResult
- [ ] ActionExecutorDeps interface defines patchStore, selectionStore, diagnosticsStore, eventHub
- [ ] ActionResult interface defines success: boolean, error?: string
- [ ] Switch statement on action.kind covers all 7 action kinds
- [ ] Default case uses exhaustiveness check: `const _exhaustive: never = action`
- [ ] TypeScript compilation succeeds with no errors

### goToTarget Handler
- [ ] Function handleGoToTarget implemented
- [ ] Block targets call selectionStore.selectBlock(blockId)
- [ ] Edge targets call selectionStore.selectEdge(edgeId)
- [ ] Port targets select containing block
- [ ] Returns { success: true } on successful navigation
- [ ] Unit test verifies SelectionStore state changes

### createTimeRoot Handler
- [ ] Function handleCreateTimeRoot implemented
- [ ] Calls patchStore.addBlock('InfiniteTimeRoot', {}, { role: 'timeRoot' })
- [ ] Returns blockId from addBlock call
- [ ] Selects newly created block in SelectionStore
- [ ] Returns { success: true }
- [ ] Unit test verifies block exists in patch
- [ ] Integration test verifies E_TIME_ROOT_MISSING diagnostic resolves

### removeBlock Handler
- [ ] Function handleRemoveBlock implemented
- [ ] Validates block exists before calling patchStore.removeBlock()
- [ ] Returns { success: false, error: 'Block not found' } if validation fails
- [ ] Calls patchStore.removeBlock(blockId) if block exists
- [ ] Returns { success: true } on successful removal
- [ ] Unit test verifies block removed from patch
- [ ] Unit test verifies error handling for non-existent block

### insertBlock Handler (MEDIUM confidence)
- [ ] Function handleInsertBlock implemented
- [ ] Calls patchStore.addBlock(blockType, {}, options)
- [ ] Selects newly created block
- [ ] Returns { success: true }
- [ ] Documentation comments note position/nearBlockId limitations
- [ ] Unit test verifies block creation
- [ ] OR: Implementation deferred with documented blocker if layout system required

### Remaining Handlers
- [ ] Function handleAddAdapter implemented (basic version)
- [ ] Function handleMuteDiagnostic implemented
- [ ] Function handleOpenDocs implemented
- [ ] All return ActionResult with success flag
- [ ] Unit tests verify each handler's core behavior

## Exit Criteria

### For insertBlock (MEDIUM → HIGH)
- [ ] Layout system existence confirmed (or absence confirmed)
- [ ] Decision documented: implement positioning, defer, or not needed
- [ ] Implementation matches decision

## Verification
```bash
# Compile TypeScript
npm run build

# Verify exports
grep "export.*executeAction" src/diagnostics/actionExecutor.ts

# Run unit tests
npm test -- actionExecutor.test.ts

# Check exhaustiveness
npx tsc --noEmit
```

## Integration Verification
```typescript
// Test in console or integration test
import { executeAction } from './src/diagnostics/actionExecutor';
import { rootStore } from './src/stores/RootStore';

const action = {
  kind: 'createTimeRoot',
  label: 'Add InfiniteTimeRoot',
  timeRootKind: 'Infinite',
};

const result = executeAction(action, {
  patchStore: rootStore.patchStore,
  selectionStore: rootStore.selectionStore,
  diagnosticsStore: rootStore.diagnosticsStore,
  eventHub: rootStore.eventHub,
});

console.log(result); // { success: true }
```
