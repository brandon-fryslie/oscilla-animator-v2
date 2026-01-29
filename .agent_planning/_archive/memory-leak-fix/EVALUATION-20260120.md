# Memory Leak Investigation - Evaluation

**Generated:** 2026-01-20
**Topic:** Memory leak investigation and fix
**Verdict:** CONTINUE

## Executive Summary

Investigation identified **1 critical memory leak**, **2 high-severity issues**, and **3 medium-severity concerns**. The most severe leak is the unbounded `_logs` array in DiagnosticsStore that grows without limit during active usage.

## Critical Findings

### 1. CRITICAL: Unbounded Log Array in DiagnosticsStore

**Location:** `src/stores/DiagnosticsStore.ts:73, 246-252, 257-259`

**Problem:**
```typescript
private _logs: LogEntry[] = [];  // Line 73 - NO SIZE LIMIT

log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  this._logs.push({  // Line 247 - Pushes indefinitely
    ...entry,
    id: `log-${this._nextId++}`,
    timestamp: Date.now(),
  });
}

clearLogs(): void {
  this._logs = [];  // Line 258 - Never called in production
}
```

**Impact:**
- Logs generated on every:
  - Parameter change (`main.ts:40` - `log()` called for param changes)
  - Domain change (`main.ts:452` - `log()` called via `logDomainChange`)
  - 2-second intervals (`main.ts:755-786` - performance logging)
  - Compilation events
- **Estimated growth rate:** 1,000+ entries/minute during active editing
- **60-minute session:** ~60,000 entries, ~12-15 MB of logs alone

**Evidence from main.ts:**
```typescript
// Line 40 - called on every log event
function log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  rootStore.diagnostics.log({ level, message: msg });
}

// Line 655 - triggers on every param change
log(`Block params changed, scheduling recompile...`);

// Line 452 - domain change logging
log(`[Continuity] Domain change: ${instanceId} ${oldCount}→${newCount} (${deltaStr})`);
```

### 2. HIGH: MobX Reaction Not Disposed in RootStore

**Location:** `src/stores/RootStore.ts:88-109`

**Problem:**
```typescript
private setupGraphCommittedEmission(): void {
  reaction(  // Line 89 - NO DISPOSAL STORED
    () => ({
      blockCount: this.patch.blocks.size,
      edgeCount: this.patch.edges.length,
    }),
    () => { /* emit event */ }
  );
  // LEAK: reaction disposer is NEVER stored or called
}
```

**Impact:**
- MobX reactions create internal subscriptions
- If RootStore is ever recreated (hot reload, testing), old reactions persist
- Currently mitigated by singleton pattern but latent for future

### 3. HIGH: MobX Reaction in main.ts Not Disposed

**Location:** `src/main.ts:641-663`

**Problem:**
```typescript
function setupLiveRecompileReaction() {
  // ...
  reaction(
    () => { /* tracking */ },
    ({ blockCount, hash }) => { /* recompile */ }
  );
  // LEAK: disposer NOT stored
}
```

**Note:** Guard on line 634 (`if (reactionSetup) return;`) prevents multiple setups in normal flow, but no cleanup mechanism exists.

### 4. MEDIUM: setTimeout Without Cleanup in ReactFlowEditor

**Location:** `src/ui/reactFlowEditor/ReactFlowEditor.tsx:278, 290, 320, 328`

**Problem:**
```typescript
// Line 278, 290 - loose setTimeout calls
setTimeout(() => fitView({ padding: 0.1 }), 50);

// Line 320, 328 - in useEffect without cleanup
useEffect(() => {
  // ...
  setTimeout(() => autoArrangeRef.current(), 100);
  // NO CLEANUP RETURN FUNCTION
}, [nodes.length, isLayouting]);
```

**Impact:**
- If component unmounts before timeout fires, callback references persist
- With frequent re-mounts, these accumulate (slow but cumulative)

### 5. MEDIUM: DiagnosticHub dispose() Never Called

**Location:** `src/stores/RootStore.ts:51-65`, `src/diagnostics/DiagnosticHub.ts` (dispose method exists)

**Problem:**
- DiagnosticHub has a proper `dispose()` method with subscription cleanup
- RootStore creates DiagnosticHub but never stores reference for cleanup
- If RootStore is disposed, DiagnosticHub subscriptions persist

### 6. LOW: ContinuityStore.recentChanges Uses Inefficient unshift()

**Location:** `src/stores/ContinuityStore.ts:301-312`

**Problem:**
```typescript
this.recentChanges.unshift({...});  // O(n) array operation
if (this.recentChanges.length > 10) {
  this.recentChanges.pop();  // Capped at 10 - not a leak
}
```

**Impact:** Not a memory leak (capped at 10 entries), but inefficient O(n) operation.

## Memory Growth Projection

| Component | Growth Rate | 1 Hour Accumulation | Memory Impact |
|-----------|------------|---------------------|---------------|
| DiagnosticsStore._logs | 1,000+/min | 60,000+ entries | ~12-15 MB |
| MobX reactions | static | 2 reactions | <1 KB |
| setTimeout refs | ~10/min | ~600 refs | <100 KB |
| **Total estimated** | - | - | **~13-16 MB/hour** |

After extended sessions (8+ hours), heap can reach 100+ MB from logs alone.

## Ambiguities

**None blocking.** The investigation is clear:
1. Log array is unbounded - needs cap
2. MobX reactions need disposal tracking
3. setTimeout calls need cleanup

## Dependencies

- None external
- All fixes are isolated to specific files/functions

## Risks

1. **Log Cap Too Aggressive:** If we cap too low, users lose diagnostic history
   - Mitigation: 1000-entry cap with clear() available
2. **Reaction Disposal Breaks Hot Reload:** Must ensure disposal doesn't break dev workflow
   - Mitigation: Proper lifecycle management

## Recommendation

**Proceed with HIGH confidence sprint.** All issues are well-understood with clear fixes.
