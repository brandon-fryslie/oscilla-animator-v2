---
parent: INDEX.md
---

# Resolution Log

> Record of key decisions made during canonicalization.

This document preserves the rationale for important decisions.
If you're wondering "why is it this way?", check here.

---

## Decision Summary

| ID | Decision | Resolution | Rationale |
|----|----------|------------|-----------|
| D1 | Stateful primitive count | 4 MVP + 1 post-MVP | UnitDelay, Lag, Phasor, SampleAndHold; Accumulator later |
| D2 | Lag status | Primitive | Technically composite but distinction arbitrary |
| D3 | Phasor vs Accumulator | Distinct | Different semantics: wrap vs unbounded |
| D4 | Custom combine modes | Removed | Complexity not worth benefit |
| D5 | Domain on wires | Compile-time resource | Runtime performance, cleaner types |
| D6 | World replacement | Split into 5 axes | Clean separation of concerns |
| D7 | Optional fields | Discriminated unions | TypeScript narrowing, explicit defaults |
| D8 | Block.type naming | Rename to Block.kind | Reserve `type` for type system |
| D9 | Role naming | `derived` not `structural` | Better describes system-generated |
| D10 | Default sources | Useful values not zeros | Animation should move by default |
| D11 | Transform taxonomy | Adapter + Lens subtypes | Adapters = type conversion, Lenses = value transformation |
| D12 | Modulation Table scope | UI view only | Does NOT define system architecture |
| D13 | Historical doc authority | Canonical spec wins | Source docs may reflect outdated systems |
| D14 | Domain definition | Ontological (what kind) | Classification, not topology |
| D15 | Three-stage architecture | Primitive → Array → Layout | Separate concerns for composability |
| D16 | Domain/Instance split | Separate types | DomainSpec + InstanceDecl |
| D17 | Domain subtyping | Adopted | Enables generic operations |
| D18 | Intrinsic access | Deferred | Implementation will determine |

---

## Detailed Decisions

### D1: Stateful Primitive Count (4 vs 5)

**Category**: Critical Contradiction

**The Problem**:
Different documents listed different stateful primitive counts. Some included Accumulator, others didn't.

**Options Considered**:

1. **3 primitives** (UnitDelay, Phasor, SampleAndHold)
   - Pros: Minimal set
   - Cons: Missing smoothing (Lag)

2. **4 primitives** (+ Lag)
   - Pros: Covers common use cases
   - Cons: Lag is technically composite

3. **5 primitives** (+ Accumulator)
   - Pros: Complete set
   - Cons: Can defer Accumulator

**Resolution**: 4 MVP + 1 post-MVP

**Rationale**: UnitDelay, Lag, Phasor, SampleAndHold cover MVP needs. Accumulator (unbounded sum) can wait for post-MVP.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D2: Lag as Primitive vs Composite

**Category**: High-Impact Ambiguity

**The Problem**:
Lag can be implemented using UnitDelay + arithmetic. Should it be a primitive?

**Options Considered**:

1. **Primitive**: First-class stateful block
   - Pros: Common operation, cleaner API
   - Cons: Technically redundant

2. **Composite**: Built from UnitDelay
   - Pros: Minimal primitive set
   - Cons: Harder to optimize, less clear intent

**Resolution**: Lag IS a primitive

**Rationale**: The distinction between "true primitive" and "labeled composite" is arbitrary for this system. Practical value wins.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D3: Phasor vs Accumulator Identity

**Category**: Critical Contradiction

**The Problem**:
Some docs used Phasor and Accumulator interchangeably. Are they the same?

**Options Considered**:

1. **Same block**: Phasor = Accumulator with wrap
   - Pros: Simpler
   - Cons: Conflates different semantics

2. **Distinct blocks**: Different purposes
   - Pros: Clear semantics
   - Cons: Two similar blocks

**Resolution**: Distinct

**Rationale**:
- Phasor: 0..1 phase accumulator with wrap
- Accumulator: `y(t) = y(t-1) + x(t)`, unbounded

Different semantics require different blocks.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D4: Custom Combine Mode Registry

**Category**: High-Impact Ambiguity

**The Problem**:
Should users be able to define custom combine modes?

**Options Considered**:

1. **Allow custom**: User-defined combine functions
   - Pros: Flexibility
   - Cons: Complexity, testing burden, performance

2. **Built-in only**: Fixed set of combine modes
   - Pros: Predictable, optimizable
   - Cons: Less flexible

**Resolution**: Built-in only, no custom registry

**Rationale**: The complexity of custom combine modes is not worth the marginal benefit. Built-in modes cover practical cases.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D5: Domain as Wire Value vs Compile-Time Resource

**Category**: High-Impact Ambiguity

**The Problem**:
Should Domain flow on wires like other values?

**Options Considered**:

1. **Wire value**: Domain can be connected and passed
   - Pros: Uniform model
   - Cons: Runtime overhead, unclear semantics

2. **Compile-time resource**: Domain is patch-level declaration
   - Pros: No runtime overhead, clear semantics
   - Cons: Less dynamic

**Resolution**: Compile-time resource

**Rationale**: Domain defines topology, not data flow. Runtime performance requires domain to be loop bounds, not objects.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D6: World Replacement Strategy

**Category**: Type System (v2.5)

**The Problem**:
The `World` enum conflated multiple concerns (cardinality, temporality).

**Options Considered**:

1. **Keep World**: Add more variants
   - Pros: Minimal change
   - Cons: Continues conflation

2. **Split into axes**: 5 independent coordinates
   - Pros: Clean separation
   - Cons: More complex type

**Resolution**: Split into 5 axes (Cardinality, Temporality, Binding, Perspective, Branch)

**Rationale**: Orthogonal axes allow independent evolution and cleaner reasoning. Binding/Perspective/Branch are defaults-only in v0 but enable future features.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D7: Optional Fields vs Discriminated Unions

**Category**: Type System (v2.5)

**The Problem**:
How to represent "default unless specified"?

**Options Considered**:

1. **Optional fields**: `domain?: DomainRef`
   - Pros: Simple syntax
   - Cons: No type narrowing, unclear semantics

2. **Discriminated unions**: `AxisTag<T>`
   - Pros: Type narrowing, explicit defaults
   - Cons: More verbose

**Resolution**: Discriminated unions (AxisTag pattern)

**Rationale**: TypeScript type narrowing makes discriminated unions safer. "default" is an explicit choice, not absence of data.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D8: Block.type Naming

**Category**: Terminology

**The Problem**:
`Block.type` conflicts with the type system terminology.

**Options Considered**:

1. **Keep Block.type**: Accept ambiguity
   - Pros: No change
   - Cons: Confusing

2. **Rename to Block.kind**: Clear distinction
   - Pros: `type` reserved for type system
   - Cons: Migration needed

**Resolution**: Rename to `Block.kind`

**Rationale**: Reserve `type` for the type system. `kind` is a common pattern for discriminated unions.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D9: Role Naming (structural vs derived)

**Category**: Terminology

**The Problem**:
What to call system-generated blocks?

**Options Considered**:

1. **structural**: Emphasizes graph structure
   - Pros: Technical accuracy
   - Cons: Obscure meaning

2. **derived**: Emphasizes derivation from user intent
   - Pros: Clearer meaning
   - Cons: Could imply "derived type"

**Resolution**: `derived`

**Rationale**: "Derived" better describes that these blocks are generated to satisfy invariants, not user-authored.

**Approved**: 2026-01-09 by Brandon Fryslie

---

### D10: Default Source Values

**Category**: Gap

**The Problem**:
What should default source blocks output?

**Options Considered**:

1. **Zeros**: 0, false, black
   - Pros: Predictable
   - Cons: Static, boring defaults

2. **Useful values**: phaseA rail, 0.5, etc.
   - Pros: Animations move by default
   - Cons: Less predictable

**Resolution**: Useful values, not zeros

**Rationale**: This is an animation system. Defaults should make things move. Prefer rails (phaseA) where sensible.

**Approved**: 2026-01-09 by Brandon Fryslie

---

## Diagnostics System (2026-01-10 Update)

### D11: Diagnostic Addressing for V2

**Category**: Adaptation

**The Problem**:
V1 diagnostics are bus-centric. V2 has edges, not buses (though buses still exist as compile concept). How should TargetRef adapt?

**Options Considered**:

1. **Remove bus targets**: Edge-only addressing
   - Pros: Matches runtime model
   - Cons: Buses still exist at compile time, need to diagnose bus-level issues

2. **Keep bus targets, add edge targets**: Both coexist
   - Pros: Can diagnose both bus-level (combine mode conflicts) and edge-level (type mismatches) issues
   - Cons: More TargetRef variants

**Resolution**: Keep bus targets, add edge targets

**Rationale**: Diagnostics span compile + runtime. Buses are real at compile time (combine mode, empty bus warnings). Edges are real everywhere. TargetRef needs both.

**Approved**: 2026-01-10 by Brandon Fryslie (implicit via update approval)

---

### D12: Five-Axis Types in Diagnostic Payloads

**Category**: Adaptation

**The Problem**:
V1 type mismatch diagnostics show `TypeDesc`. V2 uses five-axis `SignalType` (payload + extent). How should diagnostics display type errors?

**Options Considered**:

1. **Show full SignalType**: All 5 axes
   - Pros: Complete information
   - Cons: Verbose, may confuse non-technical users

2. **Show payload + resolved axes**: Only non-default axes
   - Pros: Concise, focuses on what matters
   - Cons: Hides some information

**Resolution**: Show payload + resolved axes

**Rationale**: Most type mismatches involve payload or one axis (cardinality, temporality). Showing all 5 axes when 4 are default wastes space. Diagnostic payload includes resolved axes only.

**Approved**: 2026-01-10 by Brandon Fryslie (implicit via update approval)

---

### D13: Power-User Debug Scope

**Category**: Gap

**The Problem**:
V1 has extensive power-user debug specs (DebugGraph, TraceEvents, FieldPlan, DebugDrawer). Should these be in topic 07 (diagnostics) or deferred?

**Options Considered**:

1. **Include in topic 07**: Comprehensive observability topic
   - Pros: Everything in one place
   - Cons: Mixes MVP (diagnostics) with post-MVP (power tools)

2. **Defer to topic 08**: Separate power-user debug topic later
   - Pros: Clear MVP scope, power tools can evolve independently
   - Cons: Two related topics

**Resolution**: Defer to topic 08 (post-MVP)

**Rationale**: Diagnostics (compile/authoring/runtime errors) are MVP. Power-user debug (trace, snapshots, DebugGraph) is valuable but not blocking. Keep topic 07 focused on what exists now.

**Approved**: 2026-01-10 by Brandon Fryslie (implicit via update approval)

---

## Debugger Specification Integration (2026-01-10 Update)

### Q1: TypeDesc Terminology Mismatch

**Category**: CONTRADICTION-CANONICAL
**Severity**: BLOCKER
**Source**: debugger specs vs. 01-type-system.md

**The Problem**:
Debugger specs use generic "TypeDesc". Canonical v2.5 uses five-axis SignalType model (PayloadType + Extent with 5 axes).

**Resolution**: Option A - Replace TypeDesc with SignalType everywhere

**Rationale**: Alignment with canonical five-axis type model. All debugger type references in diagnostic payloads now use SignalType + axes specification.

**Impact**:
- Diagnostic payload types updated to use SignalType
- GLOSSARY.md updated: SignalType now includes diagnostic context

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q2: Diagnostic ID Stability Algorithm

**Category**: CONTRADICTION-INTERNAL
**Severity**: BLOCKER
**Source**: 07-diagnostics-system.md vs. debugger/5-DiagnosticsPolish.md

**The Problem**:
Three conflicting ID generation algorithms. Spec 3 includes timestamp/patchRevision, breaking dedup semantics.

**Resolution**: Use canonical algorithm with patch revision addition

**Rationale**: Primary hash is `hash(code + primaryTarget.key + signature)`. Include patchRevision because the same error in different patches IS a different diagnostic (users should see it again when patch changes).

**Impact**:
- Diagnostic ID algorithm: `hash(code + primaryTarget.key + signature + patchRevision)`
- Ensures deduplication within patch, re-notification on patch changes
- Timestamp NOT included (would break dedup)

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q3: CompileFinished Diagnostics Field

**Category**: CONTRADICTION-CANONICAL
**Severity**: BLOCKER

**The Problem**:
Canonical says diagnostics always present. Debugger spec makes it optional on failure.

**Resolution**: Option A - Diagnostics ALWAYS present (empty array if none)

**Rationale**: Predictable API. DiagnosticHub snapshot logic depends on field existence.

**Impact**:
- CompileFinishedEvent.diagnostics: Diagnostic[] (required, never undefined)
- Even when status='failed', diagnostics array is present and complete

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q4: Missing Invariants I28-I29

**Category**: GAP
**Severity**: BLOCKER

**The Problem**:
07-diagnostics-system.md references I28, I29 that don't exist.

**Resolution**: Option A - Add I28-I29 to INVARIANTS.md

**Rationale**: Complete the invariant set. These are fundamental to diagnostic architecture.

**Impact**:
- I28 added: "Diagnostic Attribution - Every diagnostic must be attributable to a specific graph element via TargetRef"
- I29 added: "Error Taxonomy - Errors are categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint)"
- INVARIANTS.md updated with definitions and enforcement notes

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q5: Debug Level Scoping

**Category**: AMBIGUITY
**Severity**: HIGH

**The Problem**:
Global debug level vs. per-tap debug level.

**Resolution**: Option A - Global debug level with per-service granularity

**Rationale**: Simplicity for MVP. Single setting is easier to understand/test. Zero overhead when OFF. Per-tap can be added later if needed.

**Impact**:
- DebugService.setLevel(level) sets global level
- All DebugTap instances receive same level
- Implemention: `tap.level = debugService.getLevel()`
- Future enhancement possible: per-component level override

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q6: Diagnostic Codes Overlap

**Category**: OVERLAP
**Severity**: HIGH

**The Problem**:
Canonical and debugger specs define overlapping codes (E_DOMAIN_MISMATCH vs E_FIELD_DOMAIN_MISMATCH, etc.)

**Resolution**: Option A - Merge overlapping codes, use more specific names

**Rationale**: Single source of truth. Use the more precise name in each case.

**Impact**:
- Canonical codes retained where more specific
- Debugger codes merged into canonical set
- E_FIELD_DOMAIN_MISMATCH is canonical (more precise than E_DOMAIN_MISMATCH)
- Similar pattern applied to all overlaps

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q7: DiagnosticHub vs DebugService Separation

**Category**: AMBIGUITY
**Severity**: HIGH

**The Problem**:
Should diagnostics (error facts) and observation (value snapshots) be in same service?

**Resolution**: Option B - Separate services (DiagnosticHub + DebugService)

**Rationale**: Clean separation of concerns. DiagnosticHub manages problems. DebugService manages observation.

**Impact**:
- DiagnosticHub: Compile/authoring/runtime diagnostics
- DebugService: DebugGraph, snapshots, observation queries
- Preference: Keep DiagnosticHub name (more descriptive than DebugHub)
- Services can coordinate but have distinct responsibilities

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q8: RuntimeHealthSnapshot Frequency

**Category**: CONTRADICTION-INTERNAL
**Severity**: HIGH

**The Problem**:
Canonical says 2-5 Hz. Debugger says 15 Hz for DebugSnapshot.

**Resolution**: Configurable frequency by user/developer

**Rationale**: Different use cases need different rates. Health monitor can run slow. Debug observation needs fast updates.

**Impact**:
- RuntimeHealthSnapshot: 2-5 Hz (default), user-configurable
- DebugSnapshot: 10-15 Hz (default), user-configurable
- Separate event types (not merged)
- DebugService.setSnapshotFrequency(hz) allows override

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q9: DebugGraph & DebugSnapshot Structures

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)

**Resolution**: Create new canonical topic 08-observation-system.md

**Rationale**: Complete observation system spec (DebugGraph, DebugSnapshot, DebugTap, sampling).

**Impact**:
- New topic created with full specification from debugger docs
- Cross-linked from 07-diagnostics-system.md
- Subject to update as needed for optimal system integration

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q10: Diagnostic Rules Engine

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)

**Resolution**: Create new canonical topic 08-diagnostic-rules-engine.md (or merge into 08-observation-system.md)

**Rationale**: 8 rules (NaN, silent, conflicts, flatline, sharp, clip, heavy) with conditions/fixes.

**Impact**:
- Rules engine documented as standalone topic
- Conditions and suggested fixes specified
- Subject to update as needed for optimal integration

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q11: Debug UI Specification

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)

**Resolution**: Create new canonical topic 09-debug-ui-spec.md

**Rationale**: Non-technical debug UX (Probe mode, Trace view, diagnostics drawer).

**Impact**:
- New topic documents debug UI without implementation details
- Separate from architecture topics
- Subject to update as needed for optimal integration

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q12: Power-User Debugging Tools

**Category**: COMPLEMENT
**Severity**: MEDIUM (defer to post-MVP)

**Resolution**: Create new canonical topic 10-power-user-debugging.md (post-MVP)

**Rationale**: TraceEvents, Diff tab, FieldPlan valuable but not MVP blocking.

**Impact**:
- New topic created for post-MVP features
- Marked as not-for-implementation-yet
- Subject to update as needed

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q13: Filtering Rules for TimeRoot Diagnostics

**Category**: GAP
**Severity**: LOW

**The Problem**:
Should TimeRoot block errors be shown to users or hidden as system-internal?

**Resolution**: Show only if user-caused or user-fixable

**Rationale**: If it's a system-internal invariant, hide it. If the user caused it or can fix it, show it.

**Impact**:
- Filter logic in diagnostic producers
- Part of authoring validators in 07-diagnostics-system.md

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q14: Diagnostic Muting Persistence

**Category**: GAP
**Severity**: LOW

**The Problem**:
Where to store diagnostic mute state?

**Resolution**: Not critical for MVP

**Rationale**: Implementation detail. Can use localStorage, patch metadata, or session state as appropriate.

**Impact**:
- Deferred to implementation phase
- UI responsibility, not spec responsibility

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q15: Authoring Validator Trigger Conditions

**Category**: GAP
**Severity**: LOW

**The Problem**:
When do authoring validators run? Every GraphCommitted or selectively?

**Resolution**: Run selectively—only if state has actually changed

**Rationale**: No need to re-run if nothing changed. Avoid unnecessary CPU.

**Impact**:
- Authoring validators check if affected state changed before running
- Example: "missing TimeRoot" validator only runs if TimeRoot count might have changed

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q16-Q19: New Topic Approvals

**Resolution**: All approved - Create following new canonical topics:
- Q16: 08-observation-system.md ✅
- Q17: 08-diagnostic-rules-engine.md ✅ (or merge into 08-observation)
- Q18: 09-debug-ui-spec.md ✅
- Q19: 10-power-user-debugging.md ✅ (post-MVP)

**Impact**: Canonical specification extends to 10-11 topics (from 7)

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

### Q20: Archive Redundant Files

**Category**: Housekeeping
**Severity**: LOW

**Resolution**: Archive redundant debugger files after integration

**Rationale**: Reduce source file clutter. Files duplicating canonical content should be archived.

**Files to archive**:
- debugger/1-Diagnostics.md
- debugger/Diagnostics-System.md
- debugger/2-EventSystemIntegration.md
- debugger/7-NonTech-.md, 8-NonTech-.md, 9-NonTech-.md (empty placeholders)

**Impact**:
- Move to design-docs/spec-archived-20260110/
- Appendices/superseded-docs.md updated

**Approved by**: Brandon Fryslie
**Approved at**: 2026-01-10T18:00:00Z

---

## Category Totals

| Category | Count |
|----------|-------|
| Quick Wins | 5 |
| Critical Contradictions | 4 |
| High-Impact Ambiguities | 6 |
| Type System (v2.5) | 10 |
| Terminology | 12 |
| Gaps | 9 |
| Low-Impact | 5 |
| Adaptation | 2 |
| Debugger Integration Blockers | 4 |
| Debugger Integration Design | 4 |
| Debugger Integration Complements | 4 |
| Debugger Integration Gaps | 3 |
| Debugger Integration Approvals | 4 |
| **Total** | **73** |

---

## Approval Record

- **Total items reviewed**: 73
- **Approved as-is**: 73
- **Approved with modifications**: 0
- **Rejected/deferred**: 0

**Approved by**: Brandon Fryslie
**Method**: Full walkthrough (original), integrated debugger update approval (debugger specs)
**Original Timestamp**: 2026-01-09T15:00:00Z
**Debugger Update Timestamp**: 2026-01-10T18:00:00Z
**Canonical Update Completed**: 2026-01-10T18:30:00Z
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

### D11: Transform Taxonomy

**Date**: 2026-01-10

**Category**: Terminology Clarification

**Source**: Modulation Table integration (design-docs/8.5-Modulation-Table/)

**The Problem**:
Source documents used "adapter" and "lens" interchangeably without clear distinction.

**Resolution**:
- **Transform**: Umbrella term for both adapters and lenses
- **Adapter**: Type conversion only (mechanical port compatibility, no value change)
- **Lens**: Value transformation (scale, offset, ease, etc. - may or may not change type)

**Rationale**:
Clear distinction between "making ports compatible" (adapter) vs "transforming values" (lens).

**Impact**:
- GLOSSARY updated with all three terms
- Both compile to blocks in underlying patch
- Transform registry system deferred to roadmap

---

### D12: Modulation Table Scope

**Date**: 2026-01-10

**Category**: Integration Boundary

**Source**: Modulation Table integration (design-docs/8.5-Modulation-Table/)

**The Problem**:
UI specification document made authoritative claims about system architecture (domains, events, buses).

**Resolution**:
Modulation Table is **UI view only**. It describes interaction patterns and visual organization, NOT system architecture.

**Rationale**:
- UI specs have no authority over canonical architecture definitions
- Canonical Block System, Type System, etc. remain authoritative
- Prevents UI documents from introducing architectural drift

**Impact**:
- Topic 14-modulation-table-ui.md clearly scoped as UI only
- Prominent warning: "This topic describes a UI view, not authoritative system architecture"
- Rejected claims: invented domain parameters, publisher/listener model, recipe view system

---

### D13: Historical Document Authority

**Date**: 2026-01-10

**Category**: Canonicalization Process

**Source**: Modulation Table integration lessons learned

**The Problem**:
Source documents may have been written for previous system iterations and contain outdated assumptions.

**Resolution**:
When integrating source documents:
1. **Extract architectural intent** where it aligns with current canonical spec
2. **Reject outdated assumptions** from previous system iterations
3. **Identify useful patterns** (UI flows, interaction models) that can be adapted
4. **Not treat every detail as authoritative** just because it's written down

**Principle**: **Canonical spec wins** - always prefer existing canonical definitions over source document claims.

**Rationale**:
- Systems evolve; old docs may describe old architectures
- Treating all docs as equally authoritative causes contradictions
- Value extraction (useful patterns) vs blind acceptance (all claims)

**Impact**:
- Updated /canonicalize-architecture skill with this guidance
- Prevents future integration of obsolete concepts
- Focuses canonicalization on extracting value, not preserving history

---

## Next Steps

1. ✅ Modulation Table integrated as topic 14
2. ✅ GLOSSARY updated with Transform/Adapter/Lens
3. Update INDEX with new topic
4. Archive Modulation Table source files

---

## Update 3: Graph Editor UI Integration (2026-01-11)

**Sources Analyzed**: 7 files from design-docs/
**New Topics**: 1 (Graph Editor UI)
**Resolutions Made**: 2
**Administrative Actions**: Archived 6 conversation exports

---

### A1: Archive ChatGPT Conversation Exports

**Date**: 2026-01-11

**Category**: Administrative

**Source**: design-docs/ update (compiler-changes.md, runtime-changes.md, IR-and-normalization-5-axes.md, later_spec/*)

**The Situation**:
6 of 7 new source files are ChatGPT conversation exports documenting the design process that produced the v2.5 canonical specification (5-axis type system, compiler pipeline, IR schema, graph normalization).

**Resolution**:
Archive as design history to `conversations-archived-20260111/`. These documents show design rationale and decision-making process - valuable as historical context. The architectural content is already integrated into canonical Topics 01, 04, 05, 07-10.

**Rationale**:
- These are design artifacts, not active specifications
- Archiving preserves history without treating as canonical sources
- Content already integrated; keeping active would create confusion

**Impact**: Organizational only - no changes to canonical spec

---

### A2: Add Topic 15 - Graph Editor UI

**Date**: 2026-01-11

**Category**: New Topic (Additive)

**Source**: design-docs/spec/10-linear-graph-editor.md

**Content**:
Complete UI specification for linear auto-layout graph editor:
- Automatic block positioning (no manual drag-and-drop)
- Chain traversal and focus semantics (no-reversal rule)
- Perspective rotation at pivot blocks
- Focus/dimming visual states
- Keyboard/mouse interaction patterns

**Resolution**:
Add as Topic 15 (T3: Optional - UI implementation detail). Self-contained UI specification with no dependencies or conflicts.

**Rationale**:
- Genuinely new UI specification not yet in canonical
- T3 tier appropriate - UI implementation can change freely without affecting core architecture
- Aligns with existing UI topics (09: Debug UI, 14: Modulation Table UI)

**Impact**:
- Created `topics/15-graph-editor-ui.md`
- Added 5 new terms to GLOSSARY (Chain, Pivot Block, Focused Subgraph, Dimmed Subgraph, Perspective Rotation)
- Updated INDEX, source-map, search hints

---

---

## Update 4: Domain System Reconceptualization (2026-01-18)

**Sources Analyzed**: 2 files (WHAT-IS-A-DOMAIN.md, WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md)
**Topics Updated**: 2 (01-type-system, 02-block-system)
**Resolutions Made**: 5
**New Terms**: 10 (DomainSpec, DomainTypeId, Instance, InstanceDecl, InstanceId, InstanceRef, Primitive Block, Array Block, Layout Block)

This is a **major architectural update** that redefines the core concept of "Domain" and introduces the three-stage architecture.

---

### D14: Domain Definition (Ontological vs Topological)

**Date**: 2026-01-18

**Category**: Critical Restructuring (T2)

**The Problem**:
The canonical spec defined "Domain" as a compile-time index set (topology/cardinality), but WHAT-IS-A-DOMAIN.md proposed "Domain" as an ontological classification (what kind of thing).

**Options Considered**:

1. **Option A: Adopt new ontological definition**
   - Domain = classification (shape, circle, particle)
   - Instance = collection (count, lifecycle)
   - Requires type system restructuring

2. **Option B: Keep topological definition**
   - Reject new conceptual expansion
   - Simpler but loses conceptual power

3. **Option C: Two-level system**
   - Domain has kind + shape
   - Compromise with added complexity

**Resolution**: **Option A** - Adopt ontological definition

**Rationale**:
- Cleaner separation of concerns (what vs how many vs where)
- Enables composability (same primitive, different layouts)
- Better type safety (domain subtyping)
- The implementation had already adopted this direction

**Impact**:
- `Domain` now means "ontological classification"
- `DomainDecl` deprecated, replaced by `InstanceDecl`
- `DomainSpec` introduced for domain type definitions
- Topic 01 major restructuring

**Approved**: 2026-01-18 by Brandon Fryslie (via QUESTIONS file annotation)

---

### D15: Three-Stage Architecture (Primitive → Array → Layout)

**Date**: 2026-01-18

**Category**: Critical Architecture (T2)

**The Problem**:
The system conflated three orthogonal concerns: what kind of element, how many elements, and where elements are positioned.

**Options Considered**:

1. **Option A: Adopt three-stage architecture**
   - Primitive blocks create one element (Signal)
   - Array block transforms one → many (Field)
   - Layout blocks compute positions

2. **Option B: Keep existing DomainN pattern**
   - Single block creates domain with count and layout

3. **Option C: Incremental adoption**
   - Support both patterns during transition

**Resolution**: **Option A** - Adopt three-stage architecture

**Rationale**:
- Maximum composability (same elements, different layouts, reuse)
- Clean type system (cardinality transform is explicit)
- Pool-based performance (allocate once, toggle visibility)
- Already adopted in implementation

**Impact**:
- New block categories: Primitive, Instance, Layout
- `DomainN` and `GridDomain` deprecated
- `Array` block is fundamental cardinality transform
- Topic 02 major restructuring

**Approved**: 2026-01-18 by Brandon Fryslie

---

### D16: Domain/Instance Type Split

**Date**: 2026-01-18

**Category**: Type System (T2)

**The Problem**:
`DomainDecl` conflated domain classification with instantiation details.

**Resolution**: Split into separate types

**Types Introduced**:
- `DomainSpec` - Ontological classification (id, parent, intrinsics)
- `DomainTypeId` - Branded string for domain types
- `InstanceDecl` - Per-patch collection (domainType, maxCount, lifecycle)
- `InstanceId` - Branded string for instances
- `InstanceRef` - Reference including both domainType and instanceId

**Rationale**: Orthogonal concerns should have orthogonal types.

**Impact**: Major type system restructuring in Topic 01

**Approved**: 2026-01-18 by Brandon Fryslie

---

### D17: Domain Subtyping Hierarchy

**Date**: 2026-01-18

**Category**: Type System (T2)

**The Problem**:
Should domains support inheritance/subtyping?

**Resolution**: **Adopted** - Domains form a subtyping hierarchy

**Semantics**:
- `shape` is base domain for geometric primitives
- `circle`, `rectangle`, `polygon` extend `shape`
- Operations valid for parent are valid for subtypes
- `Field<circle>` can be passed where `Field<shape>` expected (covariance)

**Rationale**: Enables generic operations on domain categories.

**User Note**: "In what way does this increase complexity?" - Subtyping rules for type checking, but the benefit outweighs the cost.

**Approved**: 2026-01-18 by Brandon Fryslie

---

### D18: Intrinsic Properties Access (Deferred)

**Date**: 2026-01-18

**Category**: Design Decision (Deferred)

**The Problem**:
How should users access domain-provided intrinsic properties?

**Options Discussed**:
1. Outputs on Array block (explicit wiring)
2. "Get Property" blocks (context-aware)
3. Inline expression syntax
4. Hybrid approach

**Resolution**: **Deferred** - Canonical decision postponed

**User Guidance**:
> They will not be explicit block outputs, but more likely intrinsic values that can be referenced from within any block of that domain type. There is no need to 'wire' an intrinsic value as they are intrinsic. i.e., rendering a Circle does not need a wire to transmit the value of radius from the circle block - the circle has an intrinsic radius already.

**Impact**: To be determined during implementation

---

## Statistics

| Phase | Date | Sources | Topics | Resolutions |
|-------|------|---------|--------|-------------|
| **Phase 1** | 2026-01-09 | 27 | 7 | 53 |
| **Phase 2 (Debugger)** | 2026-01-10 | +16 | +7 | +20 |
| **Phase 2 (Events)** | 2026-01-10 | +6 | +0 | +1 |
| **Phase 2 (Continuity)** | 2026-01-10 | +1 | +1 | +1 |
| **Phase 2 (Modulation)** | 2026-01-10 | +3 | +1 | +3 |
| **Phase 3 (Graph Editor)** | 2026-01-11 | +1 | +1 | +2 |
| **Phase 4 (Domain System)** | 2026-01-18 | +2 | +0 | +5 |
| **Total** | — | **57** | **15** | **84** |

