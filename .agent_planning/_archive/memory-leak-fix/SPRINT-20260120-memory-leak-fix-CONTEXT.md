# Implementation Context: memory-leak-fix

**Sprint:** memory-leak-fix
**Generated:** 2026-01-20

## File Locations & Line Numbers

### DiagnosticsStore (`src/stores/DiagnosticsStore.ts`)

| Line | Code | Issue |
|------|------|-------|
| 73 | `private _logs: LogEntry[] = [];` | Unbounded array |
| 246-252 | `log()` method | Pushes without limit |
| 257-259 | `clearLogs()` method | Never called in production |

**Fix Location:** Inside `log()` method, after push, add cap check.

### RootStore (`src/stores/RootStore.ts`)

| Line | Code | Issue |
|------|------|-------|
| 51-56 | DiagnosticHub creation | Reference not stored |
| 88-109 | `setupGraphCommittedEmission()` | Reaction disposer not stored |

**Fix Location:**
1. Store DiagnosticHub as class property
2. Store reaction disposer as class property
3. Add `dispose()` method

### main.ts (`src/main.ts`)

| Line | Code | Issue |
|------|------|-------|
| 641-663 | `setupLiveRecompileReaction()` | Disposer not stored |
| 628 | `let reactionSetup = false;` | Guard exists, needs disposal |

**Fix Location:** Store disposer at module scope, expose cleanup.

### ReactFlowEditor (`src/ui/reactFlowEditor/ReactFlowEditor.tsx`)

| Line | Code | Issue |
|------|------|-------|
| 278 | `setTimeout(() => fitView(...), 50);` | No cleanup |
| 290 | `setTimeout(() => fitView(...), 50);` | No cleanup |
| 320 | `setTimeout(() => autoArrangeRef.current(), 100);` | In useEffect, no cleanup |
| 328 | `setTimeout(() => autoArrangeRef.current(), 50);` | In useEffect, no cleanup |

**Fix Location:**
- Lines 320, 328 are in same useEffect (312-333) - add cleanup return
- Lines 278, 290 are in handleAutoArrange callback - track in ref

## Code Patterns

### Log Cap Pattern (DiagnosticsStore)
```typescript
private static readonly MAX_LOGS = 1000;

log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  this._logs.push({
    ...entry,
    id: `log-${this._nextId++}`,
    timestamp: Date.now(),
  });
  // ADD: Cap enforcement
  if (this._logs.length > DiagnosticsStore.MAX_LOGS) {
    this._logs.shift();
  }
}
```

### MobX Reaction Disposal Pattern (RootStore)
```typescript
private graphCommittedDisposer: (() => void) | null = null;
private diagnosticHub: DiagnosticHub;

constructor() {
  // ... existing code ...
  this.diagnosticHub = new DiagnosticHub(...);
  this.diagnostics = new DiagnosticsStore(this.diagnosticHub);
  // ...
}

private setupGraphCommittedEmission(): void {
  this.graphCommittedDisposer = reaction(...);  // STORE disposer
}

dispose(): void {
  this.graphCommittedDisposer?.();
  this.diagnosticHub.dispose();
}
```

### setTimeout Cleanup Pattern (ReactFlowEditor)
```typescript
// In useEffect:
useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (condition) {
    timeoutId = setTimeout(() => autoArrangeRef.current(), 100);
  }

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [deps]);
```

## Testing Hints

1. **Verify log cap:**
   - Open console, run: `rootStore.diagnostics._logs.length`
   - Should never exceed 1000

2. **Verify reaction disposal:**
   - Add console.log in dispose() during development
   - Call rootStore.dispose() manually to test

3. **Verify setTimeout cleanup:**
   - Add console.log in cleanup function during development
   - Unmount component to trigger cleanup
