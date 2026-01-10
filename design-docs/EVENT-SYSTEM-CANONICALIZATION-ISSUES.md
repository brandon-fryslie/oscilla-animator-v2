# Event System Canonicalization Issues

**Date**: 2026-01-10T20:00:00Z
**Status**: NEEDS RESOLUTION
**Severity**: BLOCKER - Integration incomplete, contradictions unresolved

---

## Critical Issues Found

### ISSUE 1: CompileSucceeded/Failed vs CompileFinished

**Contradiction**: Event naming conflict

**Source A** (1-Events.md line 47-49):
```
Compile lifecycle
  • CompileStarted
  • CompileSucceeded
  • CompileFailed
  • ProgramSwapped
```

**Source B** (3.5-Events-and-Payloads-Schema.md line 54-70):
```typescript
CompileFinished (single event, not success/fail split)
Payload:
  • status: ok | failed
```

**What I wrote** (12-event-hub.md):
Used `CompileFinished` (single event with status field)

**Problem**: Two different source files contradict each other. One wants two separate events, one wants a unified event with status field.

**Impact**:
- API surface area (two events vs one)
- Handler complexity (subscribe to two events vs one with branching)
- Event log clarity
- TypeScript discriminated union shape

**Options**:
A. Two events (`CompileSucceeded`, `CompileFailed`) - simpler handlers, more events
B. One event (`CompileFinished` with status) - fewer events, requires branching

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 2: MacroExpanded vs MacroInserted

**Contradiction**: Event naming inconsistency

**Source A** (1-Events.md line 36):
```
• MacroExpanded
```

**Source B** (3-EventEmissions.md line 143-155):
```
D1) MacroInserted vs MacroExpanded

Pick one canonical event. You can keep both, but you don't need both long-term.

Recommendation:
  • Emit MacroInserted once at the end of expansion, with full created ids.
  • Optionally also emit MacroExpanded for legacy listeners (but I'd choose one).
```

**What I wrote** (12-event-hub.md):
Used `MacroInserted` as primary, mentioned `MacroExpanded` as alternative

**Problem**: Source B explicitly says "pick one" but provides a recommendation without making a decision. I followed the recommendation without noting it was a choice.

**Impact**:
- Event name used throughout codebase
- Handler registration
- Documentation/examples

**Options**:
A. `MacroInserted` (emphasizes the result - blocks inserted)
B. `MacroExpanded` (emphasizes the action - macro was expanded)
C. Keep both (discouraged by source)

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 3: BindingAdded vs ListenerAdded/PublisherAdded

**Contradiction**: Granularity mismatch

**Source A** (1-Events.md line 40-41):
```
• BindingAdded (bus listener created)
• BindingRemoved
```

**Source B** (3-EventEmissions.md line 208-224):
```
F2) PublisherAdded / Removed / SortKeyChanged
F3) ListenerAdded / Removed / ChainChanged
```

**What I wrote** (12-event-hub.md):
Used the more specific events:
- `PublisherAdded`
- `ListenerAdded`
- `PublisherRemoved`
- `ListenerRemoved`

**Problem**: Source A uses generic "Binding" term. Source B uses specific Listener/Publisher distinction. These represent different levels of granularity.

**Impact**:
- Number of event types
- Handler specificity
- Whether UI needs to distinguish publisher vs listener

**Options**:
A. Generic `BindingAdded/Removed` (simpler, fewer events, UI must inspect payload to distinguish)
B. Specific `PublisherAdded`, `ListenerAdded`, etc. (more events, type-safe distinction)

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 4: EventHub Ownership - EditorStore vs PatchStore

**Ambiguity**: Unclear architectural placement

**Source** (1-Events.md line 97-98):
```
You want one event dispatcher owned by your top-level store:
  • EditorStore.events (or PatchStore.events, whichever is the true domain root)
```

**What I wrote** (12-event-hub.md):
"EventHub is owned by the top-level store (e.g., `EditorStore.events`)"

**Problem**: Source is ambiguous. I used EditorStore as example but didn't resolve which is the actual owner.

**Impact**:
- Import paths throughout codebase
- Initialization order
- Scope of events (editor-level vs patch-level)
- Multi-patch scenarios

**Options**:
A. EditorStore owns EventHub (editor-wide events, single instance)
B. PatchStore owns EventHub (patch-scoped events, one per patch)

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 5: Missing Event Types

**Gap**: Source documents list events I didn't include in canonical

**Source** (1-Events.md line 33-44):
```
Patch / Graph lifecycle
  • PatchLoaded
  • PatchSaved
  • PatchReset
  • MacroExpanded
  • CompositeEdited / CompositeSaved
  • BlockAdded
  • BlockRemoved
  • BindingAdded
  • BindingRemoved
  • BusCreated
  • BusDeleted
  • TimeRootChanged
```

**What I wrote** (12-event-hub.md):
Only included: GraphCommitted, BlockAdded, BlockRemoved, BusCreated, BusDeleted, MacroInserted, TimeRootChanged

**Missing events**:
- `PatchLoaded`
- `PatchSaved`
- `PatchReset`
- `CompositeEdited`
- `CompositeSaved`

**Problem**: I focused on "five-event diagnostic spine" but omitted patch lifecycle events that were in the source.

**Impact**:
- Incomplete event taxonomy
- Missing coordination points for UI
- Unclear what events are available

**Options**:
A. Add all missing events to canonical list
B. Mark some as "future/optional" vs "core"
C. Define which events are MVP vs post-MVP

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 6: RuntimeHealthSnapshot Frequency Conflict

**Contradiction**: Different frequencies specified

**Source A** (3.5-Events-and-Payloads-Schema.md line 95-96):
```
RuntimeHealthSnapshot
Emitted at a fixed low frequency (e.g. 2–5 Hz), not per frame.
```

**Source B** (from earlier debugger integration, 2-NonTech-Arch.md):
DebugSnapshot emitted at 15 Hz

**What I wrote** (12-event-hub.md and 13-event-diagnostics-integration.md):
Used "2-5 Hz" from Source A

**Problem**: Are RuntimeHealthSnapshot and DebugSnapshot the same thing? Different things? If different, why different frequencies?

**Impact**:
- Event emission rate
- CPU usage
- Diagnostic responsiveness

**Options**:
A. They're the same thing - pick one frequency (2-5 Hz or 15 Hz)
B. They're different things - clarify relationship
C. Make frequency configurable

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 7: Transaction Boundaries - Implementation Unclear

**Ambiguity**: What constitutes a transaction?

**Source** (3-EventEmissions.md line 27-35):
```
A "transaction" is one user intent:
  • Insert macro
  • Create bus
  • Add listener
  • Delete block(s)
  • Change param slider (maybe coalesced)

Within that transaction, you may emit multiple events, but they all share the same tx and the same rev (post-commit).
```

**What I wrote** (12-event-hub.md):
Mentioned transactions but didn't clarify implementation mechanism

**Problem**: "Maybe coalesced" for slider is ambiguous. What determines transaction boundaries in practice?

**Impact**:
- Event metadata consistency
- Revision numbering
- Undo/redo boundaries

**Options**:
A. Explicit `runTx()` wrapper (requires manual wrapping)
B. Automatic detection based on event loop (implicit)
C. UI gesture boundaries (pointerdown to pointerup)

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 8: BlockParamChanged - Coalescing Strategy

**Ambiguity**: Slider drag emission strategy

**Source** (3-EventEmissions.md line 116-126):
```
C4) BlockParamChanged

Important: coalesce slider drags
  • either:
  • emit only on "pointerup"
  • or emit continuously but throttle; your event log gets noisy otherwise
```

**What I wrote** (12-event-hub.md):
Mentioned coalescing principle but didn't specify which approach

**Problem**: Two different strategies, no decision made

**Impact**:
- Event log size during editing
- UI responsiveness during drags
- Undo granularity

**Options**:
A. Emit only on pointerup (cleaner log, delayed feedback)
B. Throttle continuous emissions (responsive, noisier log)
C. Both modes available (complexity)

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 9: Diagnostic ID Includes Timestamp in Source

**Contradiction**: Timestamp in ID or not?

**Source A** (5-DiagnosticPayloadSpec.md line 88-98):
```
Signature rules
  • Include only fields that define the identity of the issue, not transient values.

Explicitly exclude
  • timestamps
  • frame counts
  • random seeds
```

**Source B** (6-DiagnosticsPolish.md - implied in stableHash reference):
No explicit contradiction, but mentions "stableHash"

**Earlier source** (from debugger integration, CANONICALIZED-QUESTIONS Q2):
```
5-DiagnosticsPolish.md: `id = stableHash(code, target.id, timestamp, patchRevision)`
```

**What I wrote** (07-diagnostics-system.md after enhancement):
```typescript
id = hash(code + primaryTarget + signature + patchRevision)
// Explicitly exclude timestamps
```

**Problem**: The earlier canonicalization found this contradiction in debugger docs. Did I correctly resolve it, or is there still ambiguity in event-system docs?

**Impact**:
- Diagnostic deduplication correctness
- Diagnostic lifecycle

**Decision needed**: Confirm timestamp is EXCLUDED from ID

**Status**: Previously resolved in debugger integration (Q2) - timestamp excluded, patchRevision included

---

### ISSUE 10: Event Emission Map Granularity

**Conflict**: Prescriptive vs Principled

**Source** (3-EventEmissions.md):
Very detailed, prescriptive emission map with specific call sites (340 lines)

**User guidance**: "not overly prescriptive... they aren't a ceiling, they are a floor"

**What I wrote** (12-event-hub.md):
"Thinned out" to principles and patterns, removed specific call sites

**Problem**: Did I thin it out TOO much? Are there critical details lost?

**Missing details**:
- Exact order of emissions within a transaction
- Error handling during emission
- What happens if listener throws

**Impact**:
- Implementation guidance quality
- Risk of missing edge cases

**Decision needed**: Review what was cut and decide if any details should be restored

---

### ISSUE 11: WireConnected/WireDisconnected Events

**Gap**: Mentioned in source but unclear status

**Source** (3-EventEmissions.md line 128-137):
```
C5) WireConnected / WireDisconnected

If you are keeping wires for now, emit at wire mutation points

Even if you plan to remove wires later, this event map still works during transition.
```

**What I wrote** (12-event-hub.md):
Did NOT include WireConnected/WireDisconnected in event list

**Problem**: Source says "if you are keeping wires" - are we keeping wires or not? This relates to architecture decisions about how edges are represented.

**Impact**:
- Event taxonomy completeness
- Transition strategy clarity

**Options**:
A. Include wire events (supports current/transition state)
B. Exclude wire events (wires are deprecated)
C. Mark as deprecated/transitional

**Decision needed**: ___________

**Rationale**: ___________

---

---

### ISSUE 12: Missing Scope Field in Diagnostic Interface

**Gap**: Diagnostic interface missing scope field from source

**Source** (5-DiagnosticPayloadSpec.md line 71-76):
```
G) Scope
  • scope: where it applies
  • patchRevision: integer
  • compileId?: for compile-only
  • runtimeSessionId?: for runtime-only
  • exportTarget?: svg | video | server
```

**What I wrote** (07-diagnostics-system.md):
Diagnostic interface has `metadata.patchRevision` but no explicit `scope` object with `compileId`, `runtimeSessionId`, `exportTarget`

**Problem**: The scope field provides important context about which compilation/runtime session a diagnostic belongs to. Without it, hard to track diagnostics across multiple compile attempts or runtime sessions.

**Impact**:
- Ambiguity about which compile pass produced a diagnostic
- Can't distinguish diagnostics from different runtime sessions
- Export-specific diagnostics not clearly scoped

**Options**:
A. Add full scope object as in source
B. Keep patchRevision in metadata, add compileId/runtimeSessionId there too
C. Clarify that scope is tracked at DiagnosticHub level, not in Diagnostic itself

**Decision needed**: ___________

**Rationale**: ___________

---

### ISSUE 13: Event Metadata vs Diagnostic Metadata Overlap

**Ambiguity**: Relationship between EventMeta and Diagnostic scope/metadata

**Source A** (3-EventEmissions.md line 17-24):
```typescript
interface EventMeta {
  patchId: string;
  rev: number;             // Increments on every committed transaction
  tx: string;              // Transaction ID (UUID)
  origin: 'ui' | 'import' | 'system' | 'remote' | 'migration';
  at: number;              // performance.now() or Date.now()
}
```

**Source B** (5-DiagnosticPayloadSpec.md):
Diagnostic has its own metadata/scope fields

**What I wrote**:
Kept them separate, but unclear how they relate

**Problem**:
- Does a Diagnostic emitted during a transaction inherit tx/origin from EventMeta?
- Is Diagnostic.metadata.patchRevision the same as EventMeta.rev?
- Potential for inconsistency if both track similar info

**Impact**:
- Data duplication
- Potential for metadata to drift between event and diagnostic
- Unclear which is source of truth

**Options**:
A. Diagnostic inherits some metadata from event context
B. Keep completely separate (diagnostic metadata is independent)
C. Diagnostic references event tx/origin explicitly

**Decision needed**: ___________

**Rationale**: ___________

---

## Summary Statistics

- **Total Issues Found**: 13
- **Critical Contradictions**: 3 (ISSUE 1, 2, 3)
- **Architectural Ambiguities**: 3 (ISSUE 4, 7, 13)
- **Missing Specifications**: 3 (ISSUE 5, 11, 12)
- **Implementation Ambiguities**: 4 (ISSUE 6, 8, 9, 10)

---

## Resolution Status

- [ ] ISSUE 1: CompileSucceeded/Failed vs CompileFinished
- [ ] ISSUE 2: MacroExpanded vs MacroInserted
- [ ] ISSUE 3: BindingAdded vs ListenerAdded/PublisherAdded
- [ ] ISSUE 4: EventHub ownership
- [ ] ISSUE 5: Missing event types
- [ ] ISSUE 6: RuntimeHealthSnapshot frequency
- [ ] ISSUE 7: Transaction boundaries
- [ ] ISSUE 8: BlockParamChanged coalescing
- [x] ISSUE 9: Timestamp in diagnostic ID (resolved in earlier integration)
- [ ] ISSUE 10: Event emission map granularity review
- [ ] ISSUE 11: Wire events status
- [ ] ISSUE 12: Missing scope field in Diagnostic interface
- [ ] ISSUE 13: Event metadata vs Diagnostic metadata overlap

---

## Next Steps

1. User reviews issues
2. User makes decisions for each unresolved issue
3. Update canonical topics based on resolutions
4. Document resolution rationale in RESOLUTION-LOG.md
