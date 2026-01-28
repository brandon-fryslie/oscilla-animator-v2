# Sprint: Action Attachment - Add Actions to Diagnostics
Generated: 2026-01-28-070815
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-070441.md

## Sprint Goal
Attach action arrays to relevant diagnostics at their creation sites, starting with obvious high-value candidates.

## Scope
**Deliverables:**
- E_TIME_ROOT_MISSING gets createTimeRoot action
- W_GRAPH_DISCONNECTED_BLOCK gets goToTarget and removeBlock actions
- Compile-time type errors get addAdapter action (type mismatch diagnostics)

## Work Items

### P0: Add createTimeRoot Action to E_TIME_ROOT_MISSING
**Confidence**: HIGH
**Dependencies**: Sprint 1 (Type Definitions)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 71-89

#### Description
The `E_TIME_ROOT_MISSING` diagnostic (authoringValidators.ts:87-103) currently has no actions. It explicitly says "Add an InfiniteTimeRoot" in the message but doesn't provide a one-click action. This is the highest-value action attachment - users always want to add a TimeRoot when this error appears.

Current code creates diagnostic without actions array. Add:
```typescript
actions: [
  {
    kind: 'createTimeRoot',
    label: 'Add InfiniteTimeRoot',
    timeRootKind: 'Infinite',
  }
]
```

#### Acceptance Criteria
- [ ] E_TIME_ROOT_MISSING diagnostic includes actions array with createTimeRoot action
- [ ] Action label is user-friendly ("Add InfiniteTimeRoot")
- [ ] timeRootKind is 'Infinite' (only supported kind currently)
- [ ] TypeScript compilation succeeds with correct action type
- [ ] Unit test verifies action array is present in diagnostic

#### Technical Notes
- File: `src/diagnostics/validators/authoringValidators.ts:87-103`
- Import DiagnosticAction types from `../types`
- Action is "automated" - one-click fix with no user input needed
- This is a P0 error - patch cannot execute without TimeRoot

---

### P0: Add Actions to W_GRAPH_DISCONNECTED_BLOCK
**Confidence**: HIGH
**Dependencies**: Sprint 1 (Type Definitions)
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 241-248

#### Description
The `W_GRAPH_DISCONNECTED_BLOCK` diagnostic (authoringValidators.ts:183-217, appears 3x) warns about blocks with no connections. Users typically want to either:
1. Navigate to the block to fix connections (goToTarget)
2. Remove the useless block (removeBlock)

Add both actions to give users choice. This diagnostic appears in 3 locations (disconnected TimeRoot, disconnected Render, regular disconnected block) - add actions to all 3.

```typescript
actions: [
  {
    kind: 'goToTarget',
    label: 'Go to Block',
    target: { kind: 'block', blockId },
  },
  {
    kind: 'removeBlock',
    label: 'Remove Block',
    blockId,
  }
]
```

#### Acceptance Criteria
- [ ] All 3 instances of W_GRAPH_DISCONNECTED_BLOCK include actions array
- [ ] First action is goToTarget (navigate to fix)
- [ ] Second action is removeBlock (delete if unwanted)
- [ ] Action labels are contextual and clear
- [ ] TypeScript compilation succeeds
- [ ] Unit tests verify both actions present in each diagnostic instance

#### Technical Notes
- File: `src/diagnostics/validators/authoringValidators.ts`
- Lines: 183-197 (disconnected TimeRoot), 203-217 (disconnected Render), 220+ (regular disconnected)
- blockId is already available in scope at each location
- target already constructed, reuse for goToTarget action
- Order matters: goToTarget first (less destructive), removeBlock second

---

### P1: Add addAdapter Action to Type Mismatch Diagnostics
**Confidence**: HIGH
**Dependencies**: Sprint 1 (Type Definitions), Research on diagnostic conversion
**Spec Reference**: 07-diagnostics-system.md:368-379 • **Status Reference**: EVALUATION-2026-01-28-070441.md lines 249-256

#### Description
Type mismatch errors from the compiler (diagnosticConversion.ts:173-189) convert compile errors to diagnostics but don't attach actions. When a Signal port is connected to a Value port (or vice versa), the obvious fix is to insert an adapter block.

This requires:
1. Detecting type mismatch errors in converted diagnostics
2. Identifying fromPort and toPort from error context
3. Determining appropriate adapterType (SignalToValue or ValueToSignal)
4. Attaching addAdapter action

**Challenge**: Error information may not include structured port references - may need to extract from error message or metadata.

#### Acceptance Criteria
- [ ] Type mismatch diagnostics from compiler include addAdapter action when applicable
- [ ] Action specifies correct fromPort (PortTargetRef with blockId, portId, portKind)
- [ ] Action specifies correct adapterType (SignalToValue, ValueToSignal, etc.)
- [ ] Action label explains what adapter will be inserted
- [ ] TypeScript compilation succeeds
- [ ] Integration test: create type mismatch, verify action appears

#### Technical Notes
- File: `src/compiler/diagnosticConversion.ts:173-189`
- May require enhancing compiler error context to include port references
- Not all compile errors are type mismatches - only attach action to relevant ones
- If error context is insufficient, defer to MEDIUM confidence sprint
- Adapter types: Check block registry for available adapter blocks

#### Unknowns to Resolve
1. Does compiler error include structured port references? If not, how to extract?
2. What are the available adapter block types? (Check block registry)
3. Can we reliably detect type mismatches vs other compile errors?

#### Exit Criteria (if lowered to MEDIUM)
- [ ] Compiler error structure is documented
- [ ] Port reference extraction strategy is validated
- [ ] Adapter block types are enumerated

---

## Dependencies
- **Sprint 1 (Type Definitions)** - MUST be complete before this sprint
  - New DiagnosticAction types must exist
  - Type guards must be available for testing

## Risks
**Risk**: Action attachment breaks existing diagnostic creation  
**Mitigation**: Actions field is optional - existing code continues to work  
**Likelihood**: Very Low

**Risk**: Type mismatch actions require compiler changes  
**Mitigation**: Start with P0/P0, defer P1 if compiler context insufficient  
**Likelihood**: Medium - may need to adjust confidence level

**Risk**: Wrong blockId/portId in actions leads to runtime errors  
**Mitigation**: Action executor (Sprint 3) will validate IDs and handle gracefully  
**Likelihood**: Low - IDs come from diagnostic creation, should be valid
