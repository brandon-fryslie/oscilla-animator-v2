# Sprint: deprecated-removal - Remove All Deprecated Types and Functions

**Generated:** 2026-01-27T12:00:00
**Confidence:** HIGH: 6, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Remove all deprecated types, functions, and legacy patterns identified in the codebase to achieve the epic's success criteria: no @deprecated comments, single clear APIs, no unused re-exports.

## Scope

**Deliverables:**
- Remove NumericUnit type alias (tk2.1)
- Remove getStateSlots() method (tk2.2)
- Remove CompileError legacy fields (tk2.3)
- Remove createRuntimeState() function (tk2.4)
- Remove TypeEnv and typecheck overload (6n6)
- Remove PAYLOAD_STRIDE constant (new - discovered during evaluation)

## Work Items

### P0: Remove NumericUnit type alias (tk2.1)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] NumericUnit type alias removed from src/core/canonical-types.ts
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- Lines 150-152 in canonical-types.ts
- Grep confirms zero usages - safe to delete
- Simplest item, do first as warmup

---

### P1: Remove PAYLOAD_STRIDE constant (new)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] PAYLOAD_STRIDE constant removed from src/core/canonical-types.ts
- [ ] PAYLOAD_STRIDE removed from src/types/index.ts exports
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- Lines 278-292 in canonical-types.ts
- Exported in src/types/index.ts but no importers found
- Comment says "use payload.stride directly" - consumers already migrated

---

### P2: Remove getStateSlots() method (tk2.2)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] pass7-schedule.ts updated to use getStateMappings() instead
- [ ] StateSlotDef usage reviewed and updated if needed
- [ ] getStateSlots() removed from IRBuilderImpl.ts
- [ ] getStateSlots() removed from IRBuilder.ts interface
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- Single usage in pass7-schedule.ts:27
- Method in IRBuilderImpl.ts:844-863
- Interface declaration in IRBuilder.ts
- Need to verify schedule generation works with StateMapping format

---

### P3: Remove CompileError legacy fields (tk2.3)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] diagnosticConversion.ts updated to use error.code instead of error.kind
- [ ] compileError() factory updated to not populate kind field
- [ ] Fields kind, location, severity removed from CompileError interface
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- Interface in src/compiler/types.ts:62-68
- Factory in src/compiler/types.ts:80
- diagnosticConversion.ts uses kind at lines 109, 115, 119
- The code field already contains the same value as kind

---

### P4: Remove createRuntimeState() function (tk2.4)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] event-blocks.test.ts updated to use createSessionState() + createProgramState()
- [ ] stateful-primitives.test.ts updated to use createSessionState() + createProgramState()
- [ ] createRuntimeState() removed from src/runtime/RuntimeState.ts
- [ ] createRuntimeState removed from src/runtime/index.ts exports
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- Function at RuntimeState.ts:590-612
- Test files have ~18 total usages to update
- Pattern: `createSessionState()` + `createProgramState()` then spread/compose
- Tests will be more explicit about what state they initialize

---

### P5: Remove TypeEnv and typecheck overload (6n6)

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] All callers verified to use TypeCheckContext (not TypeEnv)
- [ ] Deprecated typecheck(node, TypeEnv) overload removed
- [ ] TypeEnv type alias removed
- [ ] isTypeEnv() type guard removed
- [ ] extractPayloadTypes() returns Map<string, PayloadType> (if it returns TypeEnv now)
- [ ] No TypeScript errors after removal
- [ ] All tests pass

**Technical Notes:**
- All TypeEnv usage is internal to src/expr/typecheck.ts
- No external imports of TypeEnv found
- typecheck() function has two overloads - remove legacy one
- Keep TypeCheckContext as the canonical interface

## Dependencies

None - all items are independent and can be done in any order.

## Risks

| Risk | Mitigation |
|------|------------|
| Hidden usages of deprecated items | Grep thoroughly before removing; TypeScript will catch missing references |
| Test failures after state creation changes | Update tests incrementally; run tests after each file change |
| Schedule generation breaks after getStateSlots removal | Verify StateMapping format works; may need schedule test updates |

## Execution Order (Suggested)

1. **tk2.1** (NumericUnit) - Simplest, zero usages
2. **PAYLOAD_STRIDE** - Also zero usages
3. **tk2.3** (CompileError) - Contained to compiler/
4. **tk2.2** (getStateSlots) - Single usage point
5. **6n6** (TypeEnv) - Contained to single file
6. **tk2.4** (createRuntimeState) - Most test changes, save for last

This order minimizes risk by starting with zero-usage items and building confidence.
