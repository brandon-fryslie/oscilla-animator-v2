# Definition of Done: Action Attachment
Generated: 2026-01-28-070815
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-070815-action-attach-PLAN.md

## Acceptance Criteria

### E_TIME_ROOT_MISSING Action
- [ ] Diagnostic object includes `actions` array field
- [ ] Array contains exactly one action of kind 'createTimeRoot'
- [ ] Action has label 'Add InfiniteTimeRoot'
- [ ] Action has timeRootKind field set to 'Infinite'
- [ ] TypeScript compilation succeeds with no type errors
- [ ] Unit test creates E_TIME_ROOT_MISSING and verifies action exists
- [ ] Unit test verifies action.kind === 'createTimeRoot'

### W_GRAPH_DISCONNECTED_BLOCK Actions
- [ ] All 3 diagnostic creation sites include actions array
- [ ] Instance 1 (disconnected TimeRoot, lines ~183-197): has 2 actions
- [ ] Instance 2 (disconnected Render, lines ~203-217): has 2 actions
- [ ] Instance 3 (regular disconnected block, lines ~220+): has 2 actions
- [ ] First action in each is kind 'goToTarget' with correct blockId in target
- [ ] Second action in each is kind 'removeBlock' with correct blockId
- [ ] Action labels are clear: "Go to Block" and "Remove Block"
- [ ] Unit test verifies action count and kinds for each instance

### Type Mismatch Actions (if attempted)
- [ ] Type mismatch diagnostics from compiler have addAdapter action
- [ ] Action fromPort field correctly references source port
- [ ] Action adapterType field specifies correct adapter (SignalToValue, etc.)
- [ ] Action label explains what will be inserted
- [ ] Integration test: create type mismatch, verify action present
- [ ] OR: P1 work item deferred with documented blockers if compiler context insufficient

## Exit Criteria
Not applicable - HIGH confidence sprint requires no research.

## Verification
```bash
# Run diagnostic validator tests
npm test -- validators

# Check type compilation
npx tsc --noEmit

# Verify action arrays exist
grep -A 5 "actions:" src/diagnostics/validators/authoringValidators.ts

# Verify action types are imported
grep "import.*DiagnosticAction" src/diagnostics/validators/authoringValidators.ts
```
