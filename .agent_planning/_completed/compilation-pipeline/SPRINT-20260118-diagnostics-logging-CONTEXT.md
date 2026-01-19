# Implementation Context: Diagnostics Display & Logging

**Topic**: compilation-pipeline
**Sprint**: diagnostics-logging
**Created**: 2026-01-18 04:14:09

---

## Executive Summary

The DiagnosticConsole is not displaying compilation errors despite having a sound event-driven architecture. This document provides complete context for debugging and fixing the issue, plus implementing comprehensive logging.

---

## Architecture: Event-Driven Diagnostic Flow

### Flow Diagram

```
Compiler (compile.ts)
    │
    │ events.emit({ type: 'CompileEnd', diagnostics: [...] })
    ▼
EventHub
    │
    │ event subscribers notified
    ▼
DiagnosticHub.handleCompileEnd(event)
    │
    │ compileSnapshots.set(patchRevision, diagnostics)
    │ incrementRevision()
    ▼
DiagnosticHub.incrementRevision()
    │
    │ diagnosticsRevision++
    │ onRevisionChange() callback
    ▼
DiagnosticsStore.incrementRevision()
    │
    │ _revision++ (observable)
    ▼
MobX tracks _revision change
    │
    │ Invalidates computed properties
    ▼
DiagnosticsStore.activeDiagnostics (computed)
    │
    │ Reads hub.getActive() + depends on this.revision
    ▼
DiagnosticConsole (observer)
    │
    │ Re-renders when activeDiagnostics changes
    ▼
UI displays diagnostics
```

### Key Points

1. **Event-Driven**: Compiler doesn't know about DiagnosticHub, just emits events
2. **Snapshot Semantics**: CompileEnd **REPLACES** snapshot (not merges)
3. **MobX Reactivity**: Store._revision triggers computed recomputation
4. **Deduplication**: By diagnostic ID (includes patchRevision)

---

## Seven-Step Verification Checklist

Use this checklist to debug the diagnostic flow. See EVALUATION-diagnostics-logging-<timestamp>.md for full details.

1. **Verify Event Emission** (compile.ts:164-189)
2. **Verify Event Reception** (DiagnosticHub.ts:166-184)
3. **Verify Snapshot Storage** (DiagnosticHub.ts:174-175)
4. **Verify Revision Increment** (DiagnosticHub.ts:395-401)
5. **Verify MobX Store Update** (DiagnosticsStore.ts:119-122)
6. **Verify Computed Property** (DiagnosticsStore.ts:141-146)
7. **Verify Component Render** (DiagnosticConsole.tsx:33-42)

---

## Common Issues and Fixes

### Issue 1: PatchId Mismatch

**Symptom**: DiagnosticHub.handleCompileEnd() logs "PatchId mismatch - event ignored!"

**Root Cause**: `compile.ts` emits events with `patchId: 'unknown'`, but DiagnosticHub expects `'patch-0'`

**Fix**: Ensure compile options include correct patchId

```typescript
// Correct:
const result = compile(patch, {
  patchId: 'patch-0',
  patchRevision: rootStore.getPatchRevision(),
  events: rootStore.events,
});
```

---

### Issue 2: MobX Not Tracking Revision

**Symptom**: Revision increments but component doesn't re-render

**Fix**: Already correct in code (DiagnosticsStore.ts:144)

---

### Issue 3: Event Subscription Timing

**Symptom**: Events emitted before hub subscribed

**Fix**: Ensure RootStore created before any compile calls

---

### Issue 4: Diagnostics Array Empty

**Symptom**: Event emitted but diagnostics.length === 0

**Fix**: Verify diagnostic conversion logic in diagnosticConversion.ts

---

## File Reference

### Critical Files for Debugging

| File | Purpose | Lines to Check |
|------|---------|----------------|
| `src/compiler/compile.ts` | Event emission | 164-189 (CompileEnd emit) |
| `src/diagnostics/DiagnosticHub.ts` | Event reception | 166-184 (handleCompileEnd) |
| `src/diagnostics/DiagnosticHub.ts` | Revision increment | 395-401 (incrementRevision) |
| `src/stores/DiagnosticsStore.ts` | MobX store | 119-122, 141-146 |
| `src/ui/components/app/DiagnosticConsole.tsx` | UI component | 33-42 (render logging) |
| `src/stores/RootStore.ts` | Hub creation | 46-54 (DiagnosticHub setup) |

---

## Out of Scope (Deferred)

### Missing Block Registrations

The evaluation identified missing block registrations (E_UNKNOWN_BLOCK_TYPE errors). These are **explicitly out of scope** for this sprint per user directive.

**Why deferred:**
- Diagnostic display is blocking for all error types
- Block registration is a separate concern
- Should be addressed in dedicated sprint after diagnostics work

**Deferred to**: Future sprint "block-registry-completion"

---

### Runtime Diagnostics

Runtime diagnostics (NaN/Inf detection, performance warnings) are **deferred to Sprint 2** per the original diagnostics system design.

**Why deferred:**
- Compile diagnostics are higher priority
- Runtime system requires more infrastructure
- Sprint 1 focused on compile + authoring only

**Deferred to**: diagnostics-system Sprint 2

---

## Testing Strategy

### Manual Testing

1. **Load patch with error**
   - Use test patches from `src/compiler/__tests__/compile.test.ts`
   - Patch without TimeRoot should show E_TIME_ROOT_MISSING

2. **Verify in browser**
   - Run `npm run dev`
   - Open DiagnosticConsole panel
   - Trigger compile (via toolbar or auto-compile)
   - Check console logs for 7-step verification

3. **Test deduplication**
   - Compile twice without fixing error
   - Verify single diagnostic entry
   - Check diagnostic ID in console

### Automated Testing

**Existing tests should pass:**
```bash
npm run test -- src/diagnostics/__tests__/DiagnosticHub.test.ts
npm run test -- src/compiler/__tests__/compile.test.ts
```

**No new tests required** (architecture is already correct, just debugging)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to fix | < 2 hours (high confidence) |
| Diagnostics displayed | 100% of compile errors |
| UI update latency | < 100ms |
| Console log verbosity | Sufficient for debugging, not excessive |
| Test pass rate | 100% (all existing tests) |

---

## References

### Evaluation Document
- `.agent_planning/compilation-pipeline/EVALUATION-diagnostics-logging-<timestamp>.md` - Full evaluation with all details

### Related Files
- `src/diagnostics/CLAUDE.md` - Diagnostics system architecture overview
