# Sprint Plan: Diagnostics Display & Logging

**Topic**: compilation-pipeline
**Sprint**: diagnostics-logging
**Confidence**: HIGH
**Created**: 2026-01-18 04:14:09

---

## Sprint Goal

Fix DiagnosticConsole to display compilation errors and establish robust logging infrastructure.

**Scope (User Directive):**
- Fix diagnostics display (P0)
- Implement robust in-app logging (P1)
- DO NOT implement missing block registrations (explicitly out of scope)

---

## Problem Statement

DiagnosticConsole is not showing compiler diagnostics despite:
- Sound architecture (event-driven + MobX observation)
- Debug logging confirms component renders
- LogPanel works (uses legacy API)

**Most Likely Causes:**
1. PatchId mismatch (`compile.ts` uses `'unknown'`, hub expects `'patch-0'`)
2. MobX observation chain broken
3. Diagnostics array is empty when emitted
4. Event subscription timing issue

---

## Implementation Tasks

### P0: Debug and Fix Diagnostic Display

**Task 0.1: Add Debug Logging Throughout Chain**
- Add console.log in `compile.ts` CompileEnd emission (show diagnostics count)
- Add console.log in `DiagnosticHub.handleCompileEnd()` (show received diagnostics)
- Add console.log in `DiagnosticsStore.incrementRevision()` (show revision change)
- Add console.log in `DiagnosticConsole` render (show diagnostics count + revision)

**Task 0.2: Verify PatchId Consistency**
- Check what patchId is passed to `compile()` in main.ts or test code
- Verify DiagnosticHub is created with matching patchId
- If mismatch, fix compile call to pass correct patchId

**Task 0.3: Verify Event Subscription Timing**
- Check if DiagnosticHub is created BEFORE first compile() call
- Verify EventHub instance is shared (same instance in RootStore and compile options)
- Add defensive check: hub should log "Subscribed to EventHub" on construction

**Task 0.4: Verify MobX Observation Chain**
- Confirm `DiagnosticConsole` is wrapped in `observer()`
- Verify `activeDiagnostics` computed depends on `this.revision`
- Test: manually call `diagnostics.incrementRevision()` and check UI updates

**Task 0.5: Root Cause Fix**
Based on debug findings, apply fix:
- If patchId mismatch: Fix compile options to use 'patch-0'
- If observation broken: Ensure computed property tracks revision dependency
- If diagnostics empty: Fix diagnosticConversion or event payload
- If timing issue: Ensure hub subscribed before compile

---

### P1: Comprehensive Logging Infrastructure

**Task 1.1: Add Compiler Pipeline Logging**
- Log entry/exit for each pass with timing
- Log intermediate data sizes (block count, edge count)
- Log errors before throwing

**Task 1.2: Add DiagnosticHub Logging**
- Log every event received (type, patchId, patchRevision)
- Log snapshot replacements (old count → new count)
- Log getActive() calls with result count

**Task 1.3: Add Error Context Logging**
- Wrap compile() try/catch with detailed logging
- Log full error stack traces to console
- Log pass-specific context on failure

**Task 1.4: Console Log Categorization**
Format: `[Category] Message`
- `[Compile]` - Compiler pipeline events
- `[DiagnosticHub]` - Hub state changes
- `[DiagnosticsStore]` - MobX store updates
- `[DiagnosticConsole]` - UI component renders
- `[EventHub]` - Event emissions

---

### P2: Verify End-to-End Diagnostic Flow

**Task 2.1: Create Test Patch with Known Error**
- Load patch with missing TimeRoot
- Trigger compile
- Verify CompileEnd event emitted with E_TIME_ROOT_MISSING
- Verify DiagnosticHub stores diagnostic
- Verify DiagnosticConsole displays error

**Task 2.2: Verify Diagnostic Deduplication**
- Trigger two compiles with same error
- Verify same diagnostic ID
- Verify only one entry shown in console

**Task 2.3: Verify MobX Reactivity**
- Clear diagnostics (clear compile snapshots)
- Verify DiagnosticConsole updates to "No diagnostics"
- Add new diagnostic
- Verify DiagnosticConsole updates with new error

---

### P3: Add Defensive Error Handling

**Task 3.1: Defensive Event Handling**
- Wrap all DiagnosticHub event handlers in try/catch
- Log errors but don't crash
- Track failed event count

**Task 3.2: Defensive MobX Computed**
- Add error boundary around `activeDiagnostics` getter
- Return empty array on error, log warning
- Prevent crash from malformed diagnostic data

**Task 3.3: Defensive Rendering**
- Add error boundary component around DiagnosticConsole
- Fallback UI: "Diagnostics unavailable (error logged)"
- Log full error to console

---

## Implementation Order

1. P0.1: Add debug logging throughout chain
2. P0.2: Verify patchId consistency (likely root cause)
3. P0.3: Verify event subscription timing
4. P0.4: Verify MobX observation chain
5. P0.5: Apply root cause fix
6. P2: End-to-end verification with test patch
7. P1: Add comprehensive logging
8. P3: Add defensive error handling

**Run `npm run dev` after each step to verify in browser.**

---

## Success Criteria

See `SPRINT-20260118-diagnostics-logging-DOD.md`

---

## Files to Modify

**P0 (Debug & Fix):**
- `src/compiler/compile.ts` - Add logging, verify patchId
- `src/diagnostics/DiagnosticHub.ts` - Add logging to event handlers
- `src/stores/DiagnosticsStore.ts` - Add logging to incrementRevision
- `src/ui/components/app/DiagnosticConsole.tsx` - Add logging to render
- `src/stores/RootStore.ts` - Verify hub creation and patchId
- `src/main.ts` - Verify compile options include correct patchId

**P1 (Logging):**
- `src/compiler/compile.ts` - Pipeline logging
- `src/compiler/passes-v2/*.ts` - Pass entry/exit logging
- `src/diagnostics/DiagnosticHub.ts` - Event logging

**P3 (Defensive):**
- `src/diagnostics/DiagnosticHub.ts` - Error boundaries
- `src/stores/DiagnosticsStore.ts` - Error boundaries
- `src/ui/components/app/DiagnosticConsole.tsx` - Error boundary component

---

## Out of Scope

- Missing block registrations (will be addressed in separate sprint)
- Runtime diagnostics (deferred to Sprint 2)
- Advanced diagnostic filtering UI
- Diagnostic history/timeline view

---

## Confidence Assessment: HIGH

**Why HIGH confidence:**
- Architecture is already sound (verified through code reading)
- Problem is likely simple (patchId mismatch or observation setup)
- Debug logging will immediately reveal root cause
- Fix is localized (1-2 files at most)
- MobX patterns are already correct (just need verification)

**Risks:**
- None identified (architecture is solid, just needs debugging)

---

## Dependencies

- RootStore must be initialized before compile() calls
- EventHub must be shared between RootStore and compile options
- DiagnosticHub must use matching patchId

---

## Verification

After implementation:
1. `npm run dev` - Start dev server
2. Load patch with error (e.g., missing TimeRoot)
3. Open DiagnosticConsole panel
4. Verify error appears with correct details
5. Check console for 7-step verification logs
6. `npm run typecheck` - Zero errors
7. `npm run test` - All tests pass
