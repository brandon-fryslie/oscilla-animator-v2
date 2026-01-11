# Event System Canonicalization Resolutions

**Date**: 2026-01-10T20:15:00Z
**Status**: RESOLVED
**Approved by**: Brandon Fryslie

---

## Issue Resolutions

### ISSUE 1: CompileSucceeded/Failed vs CompileFinished

**Decision**: Use `CompileBegin` and `CompileEnd` with status field

**Canonical events**:
- `CompileBegin` (was CompileStarted)
- `CompileEnd` with `status: 'success' | 'failure'` (was CompileFinished)

**Rationale**: Single event for completion simplifies DiagnosticHub logic. Renamed to Begin/End for consistency.

---

### ISSUE 2: MacroExpanded vs MacroInserted

**Decision**: Use `MacroExpanded`

**Rationale**: "Macros don't get inserted" - they expand. Use the semantically correct term.

---

### ISSUE 3: BindingAdded vs ListenerAdded/PublisherAdded

**Decision**: Use `BindingAdded` and `BindingRemoved`

**Rationale**: No such thing as publishers/listeners in the canonical model. Bindings are the correct abstraction. SortKey changes can be added later if needed.

---

### ISSUE 4: EventHub Ownership - EditorStore vs PatchStore

**Decision**: Either is fine - EventStore is also acceptable

**Rationale**: Not architecturally critical. Implementation can choose.

---

### ISSUE 5: Missing Event Types

**Decision**: Include all listed events EXCEPT BusCreated/BusDeleted

**Canonical event list**:
- `PatchLoaded`
- `PatchSaved`
- `PatchReset`
- `MacroExpanded`
- `CompositeEdited`
- `CompositeSaved`
- `BlockAdded`
- `BlockRemoved`
- `BindingAdded`
- `BindingRemoved`
- ~~`BusCreated`~~ (removed)
- ~~`BusDeleted`~~ (removed)
- `TimeRootChanged`

**Rationale**: Buses are not first-class lifecycle entities in event taxonomy.

---

### ISSUE 6: RuntimeHealthSnapshot Frequency Conflict

**Decision**: Not architecturally critical - document both options or remove

**Resolution**: Keep as configurable. If no decision can be made, document as open question.

---

### ISSUE 7: Transaction Boundaries

**Decision**: Remove transaction information entirely

**Rationale**: This is "branch axis" stuff in the new system. We do not have a design for this yet.

**Impact**: Remove `tx` field from EventMeta. Remove all transaction-related documentation.

---

### ISSUE 8: BlockParamChanged - Coalescing Strategy

**Decision**: Remove this event entirely

**Rationale**: Blocks don't have parameters. This event doesn't exist in the canonical model.

---

### ISSUE 9: Diagnostic ID Includes Timestamp

**Decision**: Confirmed - exclude timestamp from ID

**Status**: Already correctly resolved in earlier integration.

---

### ISSUE 10: Event Emission Map Granularity

**Decision**: Current level of detail is correct

**Rationale**: Principles-based approach is appropriate. Not overly prescriptive.

---

### ISSUE 11: Wire Events Status

**Decision**: Use `EdgeAdded` and `EdgeRemoved`

**Rationale**: `edge == wire == binding`. Edges have replaced wires. Use consistent terminology: `EdgeAdded` = `BindingAdded` = `WireAdded` (all the same concept).

**Canonical names**: `EdgeAdded`, `EdgeRemoved`

---

### ISSUE 12: Missing Scope Field in Diagnostic Interface

**Decision**: Add scope field to Diagnostic interface

**Canonical structure**:
```typescript
interface Diagnostic {
  // ... existing fields ...

  scope: {
    patchRevision: number;
    compileId?: string;
    runtimeSessionId?: string;
    exportTarget?: 'svg' | 'video' | 'server';
  };

  // ... rest of interface ...
}
```

---

### ISSUE 13: Event Metadata vs Diagnostic Metadata Overlap

**Decision**: Keep separate - they're different things with different consumers

**Rationale**: Overlap is irrelevant. EventMeta serves event consumers. Diagnostic scope/metadata serves diagnostic consumers. No need to force alignment.

---

## Summary of Changes Required

### EventHub (12-event-hub.md)

1. **Rename events**:
   - `CompileStarted` → `CompileBegin`
   - `CompileFinished` → `CompileEnd` (with status: 'success' | 'failure')
   - `MacroInserted` → `MacroExpanded`
   - `PublisherAdded/ListenerAdded` → `BindingAdded`
   - `PublisherRemoved/ListenerRemoved` → `BindingRemoved`

2. **Add events**:
   - `PatchLoaded`
   - `PatchSaved`
   - `PatchReset`
   - `CompositeEdited`
   - `CompositeSaved`
   - `EdgeAdded`
   - `EdgeRemoved`

3. **Remove events**:
   - `BusCreated`
   - `BusDeleted`
   - `BlockParamChanged`

4. **Update EventMeta**: Remove `tx` field (transaction concept removed)

### Diagnostics System (07-diagnostics-system.md)

1. **Add scope field** to Diagnostic interface
2. **Update event references**: CompileStarted→CompileBegin, CompileFinished→CompileEnd
3. **Clarify metadata independence** from EventMeta

### Event-Diagnostics Integration (13-event-diagnostics-integration.md)

1. **Update all event names** to match canonical
2. **Update CompileFinished handler** to CompileEnd handler
3. **Document scope field usage** in diagnostic lifecycle

### GLOSSARY

1. **Update event term definitions** with canonical names
2. **Add EdgeAdded/EdgeRemoved** terms
3. **Update CompileFinished** → **CompileEnd**
4. **Update MacroInserted** → **MacroExpanded**

### INDEX

No changes needed (topic count and structure remain the same)

---

## Implementation Priority

1. **CRITICAL** (breaks existing integration):
   - Rename events in all topics
   - Add scope field to Diagnostic
   - Remove transaction references

2. **HIGH** (missing events):
   - Add patch lifecycle events
   - Add edge events
   - Remove bus events

3. **MEDIUM** (cleanup):
   - Update GLOSSARY
   - Update cross-references

---

## Next Steps

1. Apply changes to canonical topics (12, 13, 07)
2. Update GLOSSARY with new terms
3. Update INDEX if needed
4. Archive this resolution document to RESOLUTION-LOG.md
