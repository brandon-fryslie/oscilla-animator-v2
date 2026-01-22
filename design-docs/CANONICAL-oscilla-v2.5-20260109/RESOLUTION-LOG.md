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

---

## Update 5: Cardinality-Generic Block Type Spec Integration (2026-01-22)

**Sources Analyzed**: 1 file (0-CardinalityGeneric-Block-Type-Spec.md)
**Topics Updated**: 2 (02-block-system, 04-compilation)
**Resolutions Made**: 7
**New Terms**: 2 (Cardinality-Generic Block, StateId)

---

### D19: Cardinality-Generic Block Formal Contract

**Date**: 2026-01-22

**Category**: Structural Addition (T2)

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md

**The Problem**:
The canonical spec describes blocks that work on both Signal and Field (e.g., Add, UnitDelay) but never formally defines the contract that makes this possible.

**Resolution**: Add "Cardinality-Generic Block" as a formal concept in Topic 02 (Block System) with 4-property contract: lane-locality, cardinality preservation, instance alignment, deterministic per-lane execution.

**Rationale**: Formalizing an implicit concept enables:
- Compiler validation of block correctness
- Clear classification of which blocks can operate in both modes
- Documentation of what's allowed vs forbidden

**Impact**: Topic 02 new section, GLOSSARY new term

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D20: Block Registry Metadata (Rejected)

**Date**: 2026-01-22

**Category**: Rejected Proposal

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md §8

**The Proposal**: Add compile-time registry metadata (cardinalityMode, laneCoupling, broadcastPolicy) to each block kind.

**Resolution**: **REJECTED** - Unneeded currently. The cardinality-generic contract is sufficient without explicit metadata fields. The compiler can derive these properties from block definitions.

**Rationale**: Over-specified for current needs. Adds complexity without proportional benefit.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D21: IR Expression Forms (T3 Implementation Detail)

**Date**: 2026-01-22

**Category**: T3 Addition

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md §4.2

**The Proposal**: Add explicit intermediate expression forms (SigExprMap, FieldExprMap, FieldExprZipSig, FieldExprBroadcast) to the compilation topic.

**Resolution**: Add as minimal T3 implementation note in Topic 04. Keep low-level detail minimal, focus on conceptual data (explicit broadcast, no implicit runtime broadcast).

**Rationale**: The concept of "explicit broadcast in IR" matters. The specific expression form names are implementation detail.

**Impact**: Topic 04 - minimal section added

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D22: Diagnostic Codes for Cardinality-Generic (Deferred)

**Date**: 2026-01-22

**Category**: Deferred (T3)

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md §7

**The Proposal**: Add 4 new diagnostic codes (CARDINALITY_MISMATCH, INSTANCE_MISMATCH, LANE_COUPLED_BLOCK_DISALLOWED, IMPLICIT_BROADCAST_DISALLOWED).

**Resolution**: Omit for now. T3 implementation detail — codes can be added when implemented.

**Rationale**: Diagnostic codes are implementation detail. Existing type error handling covers the core semantics (instance mismatch is already a type error).

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D23: Cardinality-Transform Naming (Deferred)

**Date**: 2026-01-22

**Category**: Deferred (Future Spec)

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md §1.2, §6.2

**The Proposal**: Formally define "Cardinality-Transform Block" as complement of cardinality-generic.

**Resolution**: Deferred to future spec. Concept exists (Array block, reduce operations) but formal naming postponed.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D24: Broadcast Policy (Deferred)

**Date**: 2026-01-22

**Category**: Deferred (Future Spec)

**Source**: 0-CardinalityGeneric-Block-Type-Spec.md §2.2, §4.2

**The Proposal**: Specify whether compiler uses ZipSig or explicit Broadcast+Zip.

**Resolution**: Omit for now. Implementation decision — both approaches are valid. Future spec may standardize.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D25: Glossary Stale Entry Fix (DomainRef → InstanceRef)

**Date**: 2026-01-22

**Category**: Maintenance (Housekeeping)

**Source**: GLOSSARY.md Cardinality entry vs. D16 resolution

**The Problem**: GLOSSARY Cardinality entry used deprecated `domain: DomainRef` instead of `instance: InstanceRef` per D16.

**Resolution**: Fixed. Updated to `instance: InstanceRef` with note clarifying that InstanceRef points to the actual instantiation of domain objects.

**Impact**: GLOSSARY.md only

**Approved**: 2026-01-22 by Brandon Fryslie

---

---

## Update 6: Payload-Generic Blocks & State Mapping Refinement (2026-01-22, second pass)

**Sources Analyzed**: 2 files (0-CardinalityGeneric-Block-Types-Impact.md, 0-PayloadGeneriic-Block-Type-Spec.md)
**Topics Updated**: 3 (02-block-system, 04-compilation, 05-runtime)
**Resolutions Made**: 5
**New Terms**: 6 (Payload-Generic Block, StateMappingScalar, StateMappingField, Lane, Stride; vec3 added to PayloadType)
**Deprecated**: Polymorphism/Monomorphization section (replaced by Payload-Generic concept), StateKey type

---

### D26: Range-Based State Mappings (Replace StateKey)

**Date**: 2026-01-22

**Category**: Structural Update (T2)

**Source**: 0-CardinalityGeneric-Block-Types-Impact.md vs Topic 05 StateKey

**The Problem**:
Topic 05 used `StateKey { blockId, laneIndex }` which embeds lane index as semantic identity. D19 introduced StateId but the code examples weren't updated. The source document argues lane index is positional (can be remapped by continuity) and should NOT be part of identity.

**Resolution**: Replace StateKey with range-based StateMappingScalar and StateMappingField types. StateId identifies the state array; lane index is a buffer offset. Field-state migration uses continuity's lane mapping when identity is stable.

**Impact**:
- Topic 05: Complete rewrite of State Management section
- Topic 02: Updated state allocation text to reference StateMappings
- Topic 04: Updated State Slot Allocation to show mapping types
- GLOSSARY: StateId updated, StateKey deprecated, StateMappingScalar/Field added

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D27: Payload-Generic Block Formalization

**Date**: 2026-01-22

**Category**: Structural Addition (T2)

**Source**: 0-PayloadGeneriic-Block-Type-Spec.md

**The Problem**:
The system has blocks that work across multiple payload types (Add works for float, vec2, vec3) but this was modeled as generic "Polymorphism" with type variables. The new source formalizes this as "Payload-Generic" — a block classification property with a 4-property contract, parallel to Cardinality-Generic.

**Resolution**: Add "Payload-Generic Blocks" section to Topic 02. Remove deprecated "Polymorphism" section from Topic 04. The payload-generic contract is: closed payload set, total specialization, no implicit coercions, deterministic resolution.

**Registry metadata (§8 of source doc) REJECTED** per D20 precedent — unneeded currently.

**Impact**:
- Topic 02: New section parallel to Cardinality-Generic
- Topic 04: Polymorphism section replaced with Payload Specialization
- GLOSSARY: Payload-Generic Block term added, Polymorphism deprecated

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D28: Add `vec3` to PayloadType

**Date**: 2026-01-22

**Category**: Type System Extension (T2)

**Source**: 0-PayloadGeneriic-Block-Type-Spec.md

**The Problem**:
PayloadType did not include `vec3`. Source doc uses vec3 throughout for 3D operations (normalize, length, cross product). 3D is in spec scope (full spec incoming).

**Resolution**: Add `vec3` to PayloadType. Stride = 3 floats.

**Impact**: GLOSSARY PayloadType values updated. Stride table extended.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D29: Stride Concept in State/Slot Allocation

**Date**: 2026-01-22

**Category**: Structural Addition (T2)

**Source**: Both source documents

**The Problem**:
The spec said "one state cell" and "N state cells" without specifying how multi-component payloads (vec2, vec3, color) affect buffer size. Stride is fundamental to correct allocation.

**Resolution**: Add stride concept to Topic 04 slot allocation and Topic 05 state management. Stride = number of floats per element. State stride may exceed payload stride for multi-value primitives.

**Impact**: Topic 04 + 05 updated with stride tables and concepts. GLOSSARY: Stride term added.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D30: Unit Constraints (NumericUnit) — Deferred

**Date**: 2026-01-22

**Category**: Deferred (Future Spec)

**Source**: 0-PayloadGeneriic-Block-Type-Spec.md §2.2

**The Proposal**: Add `unit?: NumericUnit` to SignalType for dimensional analysis (e.g., Sin requires radians).

**Resolution**: Deferred. Full spec incoming — will be integrated when provided.

**Approved**: 2026-01-22 by Brandon Fryslie

---

---

## Update 7: Kernel Roadmap & Local-Space Geometry Integration (2026-01-22, third pass)

**Sources Analyzed**: 7 files (kernel-roadmap/0-kernel-roadmap.md, 1-local-space.md, 2-local-space-end-to-end-spec.md, 3-local-space-spec-deeper.md, 5-opcode-interpreter.md, 6-signal-kernel.md, 7-field-kernel.md)
**Topics Created**: 1 (16-coordinate-spaces)
**Topics Updated**: 3 (01-type-system, 05-runtime, 06-renderer)
**Resolutions Made**: 7
**New Terms**: ~15 (Local Space, World Space, Viewport Space, scale, scale2, shape2d, RenderFrameIR, DrawPathInstancesOp, PathGeometryTemplate, PathInstanceSet, PathStyle, Opcode Layer, Signal Kernel, Field Kernel, Materializer)
**Deprecated**: RenderIR (instance-centric), RenderInstance, GeometryAsset, MaterialAsset, `size` (renamed to `scale`)

---

### D31: Coordinate Space Model — New Topic 16

**Date**: 2026-01-22

**Category**: Structural Addition (T2)

**Source**: 1-local-space.md, 2-local-space-end-to-end-spec.md, 3-local-space-spec-deeper.md

**The Problem**:
The canonical spec had NO formal definition of coordinate spaces. Layout blocks produce positions in [0..1], the renderer maps to pixels, but the three-space model was never formally defined.

**Resolution**: Create new Topic 16 (Coordinate Spaces & Transforms) defining:
- Local Space (L): Geometry/control points, centered at (0,0), magnitude O(1)
- World Space (W): Instance placement, normalized [0..1]
- Viewport Space (V): Backend-specific pixels/viewBox units
- Transform chain: `pW = positionW + R(θ) · (scale × pL)`

**Rationale**: Cross-cutting concern affecting blocks, compilation, runtime, and rendering. Deserves its own topic to prevent fragmentation.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D32: `scale` Semantics (renamed from `size`)

**Date**: 2026-01-22

**Category**: Structural Addition (T2)

**Source**: 2-local-space-end-to-end-spec.md, 3-local-space-spec-deeper.md

**The Problem**:
The source documents defined `size` as the isotropic local→world scale factor. User requested renaming to `scale` for clarity.

**Resolution**: Accept the canonical definition with terminology change:
- `scale` (was `size`): Isotropic local→world scale factor, `Signal<float>` or `Field<float>`
- `scale2`: Optional anisotropic, `Signal<vec2>` or `Field<vec2>`
- Reference dimension: `min(viewportWidth, viewportHeight)`
- Combination: `S_effective = (scale × scale2.x, scale × scale2.y)`
- Transform order: translate → rotate → scale → draw

**Rationale**: Structural decision that propagates everywhere. "scale" is more precise than "size" for a scale factor.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D33: Three-Layer Execution Architecture

**Date**: 2026-01-22

**Category**: Structural Addition (T2 boundary rules, T3 specifics)

**Source**: 0-kernel-roadmap.md, 5-opcode-interpreter.md, 6-signal-kernel.md, 7-field-kernel.md

**The Problem**:
The canonical spec described runtime execution (Steps/Ops) but didn't specify the internal execution architecture. The source documents propose a strict three-layer model with boundary rules.

**Resolution**: Add to Topic 05 (Runtime) as a new section defining:
- Opcode Layer: Pure generic math, `number[] → number`, no domain semantics
- Signal Kernel Layer: Domain-specific `scalar → scalar`, fixed arity, documented domain/range
- Field Kernel Layer: Vec2/color/field ops, lane-wise application
- Materializer as orchestrator (not a layer)
- Boundary rules defining what belongs in each layer

**Rationale**: The boundary rules (what belongs where) are architectural value. Specific kernel names are T3 implementation detail.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D34: RenderIR Replacement — DrawPathInstancesOp

**Date**: 2026-01-22

**Category**: Structural Replacement (T2)

**Source**: 3-local-space-spec-deeper.md vs Topic 06

**The Problem**:
The existing RenderIR was instance-centric (each instance references geometry, material, transform). The source proposes a draw-op-centric model where shared geometry + style is the grouping unit.

**Resolution**: Replace old RenderIR with `RenderFrameIR` using `DrawPathInstancesOp`:
- `PathGeometryTemplate`: Local-space points + topology
- `PathInstanceSet`: World-space transforms (SoA layout)
- `PathStyle`: Fill/stroke/opacity per draw-op

**Rationale**: Old RenderIR was abstract/aspirational and never implemented. New model is concrete, supports natural batching, aligns with SVG `<defs>/<use>`, and integrates with the coordinate space architecture.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D35: `shape2d` Added to PayloadType

**Date**: 2026-01-22

**Category**: Type System Extension (T2)

**Source**: 3-local-space-spec-deeper.md

**The Problem**:
The source documents describe `shape2d` as a packed 8-word type for referencing geometry. The question was whether it belongs in PayloadType or as a separate concept.

**Resolution**: Add `shape2d` to PayloadType as a **handle type**. Stride = 8 (u32 words). Handle types are distinct from arithmetic types: no add, mul, or interpolation. Valid operations: equality, assignment, pass-through.

**Note**: The recommendation was Option B (keep separate), but user chose Option A. This works because shape2d is clearly documented as a handle type with restricted operations.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D36: Typed Scalar/Field Banks (T3 Implementation Note)

**Date**: 2026-01-22

**Category**: T3 Addition (Implementation Detail)

**Source**: 3-local-space-spec-deeper.md

**The Problem**:
The source proposes typed banks (scalarsF32, scalarsI32, scalarsShape2D, etc.) instead of a single Float32Array.

**Resolution**: Add as T3 implementation note in Topic 05. The abstract RuntimeState (single `scalars: Float32Array`) remains canonical. Typed banks are documented as a valid optimization that implementations may choose.

**Rationale**: Typed banks are an optimization, not architecture. The abstract model is simpler and sufficient for specification purposes.

**Approved**: 2026-01-22 by Brandon Fryslie

---

### D37: Coordinate-Space Enforcement (Convention-Based)

**Date**: 2026-01-22

**Category**: Design Decision

**Source**: 1-local-space.md, 3-local-space-spec-deeper.md

**The Problem**:
Should coordinate spaces be enforced via type-level axis or block-level naming conventions?

**Resolution**: Convention-based enforcement for current version. Block ports document which coordinate space they operate in via naming patterns (`controlPoints` = local, `position` = world). Future: type-level `coordSpace` axis may be added if convention proves insufficient.

**Rationale**: Convention + block contracts are sufficient for v2. Adding a type axis is expensive and can be done later if needed.

**Approved**: 2026-01-22 by Brandon Fryslie

---

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
| **Phase 5 (Cardinality-Generic)** | 2026-01-22 | +1 | +0 | +7 |
| **Phase 6 (Payload-Generic + State)** | 2026-01-22 | +2 | +0 | +5 |
| **Phase 7 (Kernel Roadmap + Local-Space)** | 2026-01-22 | +7 | +1 | +7 |
| **Total** | — | **67** | **16** | **103** |

