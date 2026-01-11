# Event-Diagnostics Integration - Indexed Summary

**Tier**: T2 (System Integration)
**Size**: 546 lines → ~120 lines (22% compression)

## Overview [L16-27]
DiagnosticHub is **stateful subscriber** to EventHub. Maintains separate diagnostic snapshots (compile, authoring, runtime), manages lifecycle, provides query interface.

**Distinction**:
- **EventHub**: Stateless stream ("what happened")
- **DiagnosticHub**: Stateful model ("what's currently true/risky/broken")

## The Five-Event Contract [L30-42]

DiagnosticHub subscribes to exactly five events:

| Event | Purpose | Action |
|-------|---------|--------|
| GraphCommitted | Patch changed | Run authoring validators, update snapshot |
| CompileBegin | Compile started | Mark revision "pending" |
| CompileEnd | Compile done | **Replace** compile snapshot (authoritative) |
| ProgramSwapped | Runtime adopted new program | Set active revision |
| RuntimeHealthSnapshot | Periodic health (2-5 Hz) | Update/merge runtime diagnostics |

## Event Handlers [L46-171]

### 1. GraphCommitted → Authoring Validators [L48-71]
Fast, synchronous validators (no compilation):
- Missing TimeRoot
- Multiple TimeRoots
- Disconnected blocks
- Empty buses
- Unbound inputs

Run < 10ms. Update authoring snapshot.

### 2. CompileBegin → Pending State [L75-86]
Mark revision as "compiling". UI can show "compiling..." badge.

### 3. CompileEnd → Snapshot Replacement [L89-114]
**Critical rule**: This is SNAPSHOT REPLACEMENT, not merge.

If CompileEnd has 3 diagnostics, compile snapshot = exactly 3 (even if previous had 10).

**Why replacement**: Fixed diagnostics disappear, compiler knows complete state.

### 4. ProgramSwapped → Active Revision [L118-140]
Set "active revision" pointer (running program). Runtime diagnostics attach to active, not latest edit.

**Example scenario**:
1. Edit → rev 42
2. Compile starts (42)
3. Edit again → rev 43
4. Compile ends (42)
5. Swap to 42 → activeRevision = 42 (NOT 43)
6. Runtime diags attach to 42

Prevents runtime diagnostics from jumping to unstarted program.

### 5. RuntimeHealthSnapshot → Runtime Update [L143-171]
Merge raised/resolved diagnostics, apply expiry (TTL ~10s).

**No spam**: UI shows "P_NAN_DETECTED ×237" not 237 entries.

## DiagnosticHub Internal State [L174-213]
```typescript
class DiagnosticHub {
  private compileSnapshots = Map<number, CompileSnapshot>();
  private authoringSnapshot: AuthoringSnapshot | null;
  private runtimeDiagnostics = Map<string, Diagnostic>();
  private activeRevision: number;
  private pendingCompile: { revision, compileId } | null;
  private mutedDiagnostics = Set<string>();
  private diagnosticsRevision: number;  // Monotonic, for UI reactivity
}
```

## Query Interface [L217-246]
```typescript
getActiveDiagnostics(): Diagnostic[]
getDiagnosticsByRevision(patchRevision): Diagnostic[]
getCompileSnapshot(patchRevision): Diagnostic[] | undefined
getAuthoringSnapshot(): Diagnostic[]
getRuntimeDiagnostics(): Diagnostic[]
isCompilePending(): boolean
getPendingRevision(): number | null
getActiveRevision(): number
getDiagnosticsRevision(): number  // For UI reactivity
```

## Behavior Rules [L250-297]

### Rule 1: Compile Snapshots Are Complete [L252-266]
Replace entirely, don't merge new with old.

### Rule 2: Runtime Diagnostics Aggregate with Expiry [L269-295]
Accumulate with decay. Update occurrence count + lastSeenAt. Auto-expire if not seen in TTL.

### Rule 3: Authoring Validators Run Synchronously [L298-338]
**Fast** (< 10ms) because run on every GraphCommitted.

### Rule 4: Muting Is Per-ID [L341-365]
Users can mute diagnostics. Muted still tracked but filtered from queries.

## UI Integration [L369-413]
MobX store wrapper exposes observables. Observer components react to diagnosticsRevision changes.

Example:
```tsx
const DiagnosticsPanel = observer(() => {
  return (
    <div>
      <h2>Diagnostics ({diagnosticStore.totalCount})</h2>
      {diagnosticStore.activeDiagnostics.map(d => (
        <DiagnosticRow key={d.id} diagnostic={d} />
      ))}
    </div>
  );
});
```

Reactivity via `incrementRevision()` → MobX detects → re-render

## Example: Full Flow [L417-457]
User drops macro (type error):

1. GraphCommitted → authoring validators clean
2. CompileBegin → "pending"
3. CompileEnd(failure) → snapshot = [E_TYPE_MISMATCH]
4. UI shows error
5. User fixes
6. GraphCommitted (rev 43)
7. CompileBegin (rev 43)
8. CompileEnd(success) → snapshot = []
9. Error disappears
10. ProgramSwapped → activeRevision = 43

All via events. No direct coupling.

## Performance Considerations [L463-497]

**Authoring validators** < 10ms (no deep traversals, no compilation)
**Runtime health** throttled 2-5 Hz (not per-frame = 60 Hz)
**Diagnostic revision bumping**: Only when active set changes (compile/authoring/runtime updated, muted/unmuted)

## Testing [L500-534]
Subscribe to events, emit CompileEnd, assert snapshot updated:

```typescript
test('compile error updates snapshot', () => {
  events.emit({
    type: 'CompileEnd',
    patchRevision: 1,
    diagnostics: [{ code: 'E_TYPE_MISMATCH', ... }]
  });
  expect(hub.getCompileSnapshot(1)).toHaveLength(1);
});
```

## Related
- [12-event-hub](./12-event-hub.md) - Event architecture
- [07-diagnostics-system](./07-diagnostics-system.md) - Types, codes
- [04-compilation](./04-compilation.md) - Compile diagnostics origin
- [05-runtime](./05-runtime.md) - Health monitoring
- [Glossary: DiagnosticHub](../GLOSSARY.md#diagnostichub)
