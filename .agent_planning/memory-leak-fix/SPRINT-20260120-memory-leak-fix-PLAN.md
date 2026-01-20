# Sprint: memory-leak-fix - Fix Memory Leaks

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Fix all identified memory leaks to prevent unbounded memory growth during extended editing sessions.

## Scope

**Deliverables:**
1. Add log rotation to DiagnosticsStore (cap at 1000 entries)
2. Store and dispose MobX reactions in RootStore and main.ts
3. Clean up setTimeout calls in ReactFlowEditor

## Work Items

### P0: DiagnosticsStore Log Cap

**Files:** `src/stores/DiagnosticsStore.ts`

**Acceptance Criteria:**
- [ ] `_logs` array capped at 1000 entries
- [ ] Oldest entries removed when cap exceeded (FIFO)
- [ ] `clearLogs()` still works
- [ ] No change to public API

**Technical Notes:**
```typescript
private static readonly MAX_LOGS = 1000;

log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  this._logs.push({ ... });
  if (this._logs.length > DiagnosticsStore.MAX_LOGS) {
    this._logs.shift();  // Remove oldest
  }
}
```

### P1: RootStore Reaction Disposal

**Files:** `src/stores/RootStore.ts`

**Acceptance Criteria:**
- [ ] Reaction disposer stored as class property
- [ ] `dispose()` method added to RootStore
- [ ] Reaction disposed in `dispose()` method
- [ ] DiagnosticHub reference stored for disposal

**Technical Notes:**
```typescript
private graphCommittedDisposer: (() => void) | null = null;
private diagnosticHub: DiagnosticHub;

private setupGraphCommittedEmission(): void {
  this.graphCommittedDisposer = reaction(...);
}

dispose(): void {
  this.graphCommittedDisposer?.();
  this.diagnosticHub.dispose();
}
```

### P2: main.ts Reaction Disposal

**Files:** `src/main.ts`

**Acceptance Criteria:**
- [ ] Reaction disposer stored in module scope
- [ ] Cleanup function available for testing/hot reload

**Technical Notes:**
```typescript
let reactionDisposer: (() => void) | null = null;

function setupLiveRecompileReaction() {
  if (reactionSetup) return;
  reactionSetup = true;

  reactionDisposer = reaction(...);
}

// For testing/cleanup
export function cleanupReaction() {
  reactionDisposer?.();
  reactionDisposer = null;
  reactionSetup = false;
}
```

### P3: ReactFlowEditor setTimeout Cleanup

**Files:** `src/ui/reactFlowEditor/ReactFlowEditor.tsx`

**Acceptance Criteria:**
- [ ] All setTimeout calls tracked with refs
- [ ] useEffect cleanup functions clear timeouts
- [ ] No orphaned timeout references on unmount

**Technical Notes:**
```typescript
// Pattern for setTimeout in useEffect:
useEffect(() => {
  const timeoutId = setTimeout(() => autoArrangeRef.current(), 100);
  return () => clearTimeout(timeoutId);
}, [nodes.length, isLayouting]);

// For non-effect setTimeout (line 278, 290):
// Store timeout ID in ref and clear on effect cleanup
```

## Dependencies

- None. All fixes are isolated.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Log cap too aggressive | Low | Users lose history | 1000 entries = ~15min of active use, clearLogs() available |
| Breaking hot reload | Low | DX impact | Test hot reload after changes |
| Missing cleanup paths | Low | Incomplete fix | Verify with Chrome DevTools heap snapshots |

## Verification Strategy

1. **Chrome DevTools Memory Profiler:**
   - Take heap snapshot before test
   - Perform 100 parameter edits (slider drags)
   - Take heap snapshot after
   - Verify LogEntry count stays ≤ 1000

2. **Before/After Heap Growth:**
   - Run app for 10 minutes with active editing
   - Before fix: Heap should grow ~2MB+ from logs
   - After fix: Heap should stay stable (logs capped)

3. **Hot Reload Test:**
   - Edit source file, save
   - Verify app doesn't crash or leak reactions
