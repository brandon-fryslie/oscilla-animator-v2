---
command: /canonicalize-architecture design-docs/debugger/
run_type: UPDATE
indexed: true
source_files:
  - design-docs/debugger/*.md (16 files)
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-10T16:30:00Z
progress: 0
total_issues: 20
critical: 4
high: 4
medium: 9
low: 3
---

# Canonicalization Questions - Debugger Specs Update

> **UPDATE RUN**: Integrating debugger specs into existing canonical specification
>
> **Status**: 0 of 20 items resolved
> **Critical blockers**: 4 must be resolved before integration
> **Existing canonical**: CANONICAL-oscilla-v2.5-20260109/ (7 topics, 53 prior resolutions)

---

## CRITICAL CONFLICTS (MUST RESOLVE)

These contradict existing canonical specification and must be resolved before integration.

### Q1: TypeDesc Terminology Mismatch

**Category**: CONTRADICTION-CANONICAL
**Severity**: BLOCKER
**Source**: design-docs/debugger/4-DiagnosticPayloadSpec.md §7, 3-Diagnostic-Events-and-Payloads-Schema.md
**Canonical Reference**: topics/01-type-system.md (five-axis model)

**The Problem**:
Debugger specs use "TypeDesc" generically to describe types in diagnostic payloads. Canonical v2.5 uses five-axis model: `SignalType = PayloadType + Extent` where Extent has 5 axes (cardinality, temporality, binding, perspective, branch). These are incompatible without mapping.

**Example from debugger spec**:
```typescript
interface E_TYPE_MISMATCH_Data {
  expected: TypeDesc;
  actual: TypeDesc;
}
```

**Canonical equivalent should be**:
```typescript
interface E_TYPE_MISMATCH_Data {
  expected: SignalType;  // PayloadType + 5-axis Extent
  actual: SignalType;
  mismatchedAxes: AxisTag[];  // Which axes differ
}
```

**Options**:

A. **Replace TypeDesc with SignalType everywhere** (align with canonical)
   - Pros: Consistent, leverages five-axis precision
   - Cons: Requires rewriting all debugger type references

B. **Define TypeDesc as alias for SignalType** (bridge)
   - Pros: Preserves debugger terminology, maps to canonical
   - Cons: Two names for same thing

C. **Keep both, define mapping** (explicit translation)
   - Pros: Debugger specs unchanged, clear translation rules
   - Cons: Ongoing maintenance burden

**Recommendation**: Option A - Replace with SignalType

**Status**: approve

**Assigned to**: _______
**Resolution deadline**: _______

---

### Q2: Diagnostic ID Stability Algorithm Conflict

**Category**: CONTRADICTION-INTERNAL
**Severity**: BLOCKER
**Source**: topics/07-diagnostics-system.md §4.2 vs. debugger/4-DiagnosticPayloadSpec.md §2 vs. debugger/5-DiagnosticsPolish.md

**The Problem**:
Three conflicting specifications for how diagnostic IDs are generated:

1. **Canonical 07-diagnostics-system.md**: `id = hash(code + primaryTarget.key + signature)`
2. **Debugger 4-DiagnosticPayloadSpec.md**: `id = hash(code + primaryTarget.key + signature)` (same)
3. **Debugger 5-DiagnosticsPolish.md**: `id = stableHash(code, target.id, timestamp, patchRevision)`

Spec 3 includes timestamp and patchRevision in hash, which violates dedupe semantics (same root cause would produce different IDs across runs).

**Impact**: Deduplication breaks, diagnostics spam UI

**Options**:

A. **Use canonical algorithm (1/2)** - Exclude timestamp/patchRevision from ID
   - Pros: Correct dedupe behavior
   - Cons: 5-DiagnosticsPolish must be corrected

B. **Use 5-DiagnosticsPolish algorithm** - Include timestamp/patchRevision
   - Pros: Preserves polish doc as-written
   - Cons: Violates dedupe invariant, wrong behavior

**Recommendation**: Option A - Use canonical algorithm, mark 5-DiagnosticsPolish as errata

**Status**: Agree with caveat- using patch revision is smart, because we want to get the message again whenever the patch changes.  it is NOT the same error if it is two different patches

**Assigned to**: _______
**Resolution deadline**: _______

---

### Q3: CompileFinished Diagnostics Snapshot Semantics

**Category**: CONTRADICTION-CANONICAL
**Severity**: BLOCKER
**Source**: topics/07-diagnostics-system.md §2.2 vs. debugger/3-Diagnostic-Events-Payloads-Schema.md

**The Problem**:
Canonical says CompileFinished event must include complete diagnostics snapshot (even if empty array when ok). Debugger spec allows omitting diagnostics when status='failed'.

**Canonical**:
```typescript
interface CompileFinishedEvent {
  status: 'ok' | 'failed';
  diagnostics: Diagnostic[];  // ALWAYS present
}
```

**Debugger spec**:
```typescript
interface CompileFinishedEvent {
  status: 'ok' | 'failed';
  diagnostics?: Diagnostic[];  // Optional when failed
}
```

**Impact**: DiagnosticHub cannot rely on diagnostics field existing, breaks snapshot replacement logic

**Options**:

A. **Diagnostics always present (canonical)** - Required field, empty array if none
   - Pros: Predictable, simplifies DiagnosticHub logic
   - Cons: Debugger spec must change

B. **Diagnostics optional (debugger spec)** - Allow undefined
   - Pros: Preserves debugger spec
   - Cons: Hub logic more complex, undefined behavior

**Recommendation**: Option A - Always present (empty array is valid)

**Status**: Agreed, A.  No optional properies

**Assigned to**: _______
**Resolution deadline**: _______

---

### Q4: Missing Invariants I28-I29

**Category**: GAP
**Severity**: BLOCKER
**Source**: topics/07-diagnostics-system.md references INVARIANTS.md entries I28, I29
**Canonical Reference**: INVARIANTS.md (stops at I27)

**The Problem**:
Canonical 07-diagnostics-system.md references invariants I28 and I29:
- I28: Diagnostic attribution
- I29: Error taxonomy

But INVARIANTS.md only goes up to I27. These invariants don't exist.

**Options**:

A. **Add I28-I29 to INVARIANTS.md** - Define them based on 07-diagnostics-system intent
   - Pros: Completes the invariants set
   - Cons: Requires defining new invariants

B. **Remove references from 07-diagnostics-system.md** - Don't reference non-existent invariants
   - Pros: No broken references
   - Cons: Loses architectural connection

C. **Renumber/merge into existing invariants** - Fold into I19-I21 (error-related)
   - Pros: No new invariants needed
   - Cons: May not fit cleanly

**Recommendation**: Option A - Add I28-I29 with proper definitions

**Proposed I28**: "Diagnostic Attribution - Every diagnostic must be attributable to a specific graph element via TargetRef"

**Proposed I29**: "Error Taxonomy - Errors are categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint)"

**Status**: Option A

**Assigned to**: _______
**Resolution deadline**: _______

---

## HIGH PRIORITY DESIGN DECISIONS

These require architectural decisions but don't block immediate work.

### Q5: Debug Level Scoping - Global vs Per-Tap

**Category**: AMBIGUITY
**Severity**: HIGH
**Source**: debugger/2-NonTech-Arch.md §2.2, debugger/3-NonTech-LowLevel.md §1

**The Problem**:
Two specs describe debug level differently:
- 2-NonTech-Arch says "global debug level" (one setting for entire system)
- 3-NonTech-LowLevel says "per-tap debug level" (each DebugTap has its own level)

**Options**:

A. **Global level with internal method guards** (simpler)
   - Pros: Easier to implement, single control
   - Cons: Less granular

B. **Per-tap level** (more flexible)
   - Pros: Fine-grained control
   - Cons: More complex, harder to reason about

C. **Hybrid**: Global minimum + per-tap override
   - Pros: Flexible and safe
   - Cons: Most complex

**Recommendation**: Option A - Global level (simplicity wins for MVP)

**Status**: Need more info - explain technica details + pros/cons

---

### Q6: Diagnostic Codes Overlap - Merge or Keep Separate?

**Category**: OVERLAP
**Severity**: HIGH
**Source**: topics/07-diagnostics-system.md §8 vs. debugger/4-DiagnosticPayloadSpec.md §6

**The Problem**:
Both specs define diagnostic codes with overlap:
- Canonical defines E_DOMAIN_MISMATCH
- Debugger defines E_FIELD_DOMAIN_MISMATCH

Are these the same or different? If same, which name is canonical?

**Similar overlaps**:
- E_CYCLE_ILLEGAL vs E_GRAPH_CYCLE_ILLEGAL
- W_BUS_EMPTY vs W_BUS_EMPTY_SILENT
- P_FRAME_BUDGET_EXCEEDED vs P_JANK_DETECTED

**Options**:

A. **Merge overlapping codes** - One canonical code per concept
   - Pros: No duplication
   - Cons: Requires choosing which name wins

B. **Keep both as aliases** - Map multiple codes to same handler
   - Pros: Backward compat
   - Cons: Code bloat

C. **Reject debugger codes, use only canonical**
   - Pros: Single source of truth
   - Cons: Debugger specs lose precision

**Recommendation**: Option A - Merge, use more specific names (e.g., E_FIELD_DOMAIN_MISMATCH over E_DOMAIN_MISMATCH)

**Status**: Merge (option A).  do not keep overlapping.  just use your judgement, it's not rocket science

---

### Q7: DiagnosticHub vs DebugService Separation

**Category**: AMBIGUITY
**Severity**: HIGH
**Source**: topics/07-diagnostics-system.md vs. debugger/2-NonTech-Arch.md §3

**The Problem**:
Canonical DiagnosticHub manages compile/authoring/runtime diagnostics (metadata about problems). Debugger DebugService manages runtime observation (value snapshots, trace, taps). Should these be:

A. **Same service** - DiagnosticHub does both
   - Pros: Simpler, fewer moving parts
   - Cons: Mixing concerns (problems vs observation)

B. **Separate services** - DiagnosticHub + DebugService
   - Pros: Clean separation
   - Cons: More complexity, coordination needed

C. **Layered** - DebugService uses DiagnosticHub
   - Pros: Reuses diagnostic infrastructure
   - Cons: Couples observability to problems

**Recommendation**: Option B - Separate services (diagnostics ≠ observation)

**Status**: Sure OptionB.  IF you do narrow it to one, I like the DiagnosticHub name better

---

### Q8: RuntimeHealthSnapshot Frequency

**Category**: CONTRADICTION-INTERNAL
**Severity**: HIGH
**Source**: topics/07-diagnostics-system.md §2.2 vs. debugger/2-NonTech-Arch.md §2.3

**The Problem**:
Canonical says RuntimeHealthSnapshot emitted at 2-5 Hz. Debugger says DebugSnapshot emitted at 15 Hz. Different frequencies for potentially same data.

**Options**:

A. **Unify to single frequency** (e.g., 5 Hz)
   - Pros: Simpler
   - Cons: May be too slow for debugging

B. **Dual frequencies** - Health at 2-5 Hz, Debug at 15 Hz
   - Pros: Optimized for each use case
   - Cons: More events

C. **Configurable frequency** - User/developer sets rate
   - Pros: Flexible
   - Cons: More complex

**Recommendation**: Option B - Dual frequencies with separate event types (RuntimeHealthSnapshot ≠ DebugSnapshot)

**Status**: Configurable by user

---

## COMPLEMENTARY (High Value, Should Integrate)

These add valuable detail to canonical spec.

### Q9: DebugGraph & DebugSnapshot Structures

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)
**Source**: debugger/2-NonTech-Arch.md §2-3

**Value**: Debugger spec defines complete DebugGraph (compile-time metadata) and DebugSnapshot (runtime sampling) structures not in canonical. These should be integrated.

**Proposed action**: Create new canonical topic 08-observation-system.md incorporating DebugGraph, DebugSnapshot, DebugTap

**Status**: PENDING (pending resolution of Q1-Q8)

Yes - but PLEASE note that it should be updated as needed to work optimally in our system

---

### Q10: Diagnostic Rules Engine

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)
**Source**: debugger/5-NonTech-RulesEngine.md

**Value**: Complete spec for 8 diagnostic rules (NaN, silent, conflicts, flatline, sharp, clip, heavy) with conditions and suggested fixes. Not in canonical.

**Proposed action**: Create new canonical topic 08-diagnostic-rules-engine.md

**Status**: Yes - but PLEASE note that it should be updated as needed to work optimally in our system

---

### Q11: Debug UI Specification

**Category**: COMPLEMENT
**Severity**: MEDIUM (high value)
**Source**: debugger/4-NonTech-UI-Spec.md, 6-NonTech-MainUI.md

**Value**: Non-technical debug UX (Probe mode, Trace view, diagnostics drawer, buses tab)

**Proposed action**: Create new canonical topic 09-debug-ui-spec.md

**Status**: Yes - but PLEASE note that it should be updated as needed to work optimally in our system

---

### Q12: Power-User Debugging Tools

**Category**: COMPLEMENT
**Severity**: MEDIUM (defer to post-MVP)
**Source**: debugger/10-PowerUser-Overview.md

**Value**: TraceEvents, Diff tab, FieldPlan, jank risk classification

**Proposed action**: Create canonical topic 10-power-user-debugging.md (mark as post-MVP)

**Status**: Yes - but PLEASE note that it should be updated as needed to work optimally in our system

---

## GAPS (Underspecified, Should Clarify)

### Q13: Filtering Rules for TimeRoot Diagnostics

**Category**: GAP
**Severity**: LOW
**Source**: topics/07-diagnostics-system.md mentions filtering, but no spec for how

**The Problem**: Should timeRoot block errors be shown to users or hidden as system-internal?

**Status**: Depends on the error.  Is it something caused by the user, or that the user can fix?  then show it to the user.  Otherwise don't

---

### Q14: Diagnostic Muting Persistence

**Category**: GAP
**Severity**: LOW
**Source**: Muting mentioned, but not where mute state is stored (localStorage? patch metadata?)

**Status**: Literally doesn't matter

---

### Q15: Authoring Validator Trigger Conditions

**Category**: GAP
**Severity**: LOW
**Source**: topics/07-diagnostics-system.md §5.4 lists validators but not when they run

**The Problem**: Does "missing TimeRoot" validator run on every GraphCommitted? Or only when TimeRoot count changes?

**Status**: no need to run it if we know it hasn't broken

---

## PROPOSED NEW TOPICS

### Q16: Create topic 08-observation-system.md?

**Source**: debugger/2-NonTech-Arch.md, 3-NonTech-LowLevel.md
**Content**: DebugGraph, DebugSnapshot, DebugTap, sampling, ring buffer
**Justification**: Observation is distinct from diagnostics (watching values vs detecting problems)

**Approve?**: yes

---

### Q17: Create topic yes

**Source**: debugger/5-NonTech-RulesEngine.md
**Content**: 8 rules (NaN, silent, conflicts, flatline, sharp, clip, heavy), conditions, fixes
**Justification**: Rules engine is substantial system not in 07-diagnostics-system

**Approve?**: ☐ Yes ☐ No ☐ Defer

---

### Q18: Create topic 09-debug-ui-spec.md?

**Source**: debugger/4-NonTech-UI-Spec.md, 6-NonTech-MainUI.md
**Content**: Non-technical debug UX, probe mode, trace view, drawer
**Justification**: UI spec is distinct from system architecture

**Approve?**: yes

---

### Q19: Create topic 10-power-user-debugging.md?

**Source**: debugger/10-PowerUser-Overview.md
**Content**: TraceEvents, Diff tab, FieldPlan, jank classification
**Justification**: Power-user tools are post-MVP but worth specifying

**Approve?**: yes

---

### Q20: Archive redundant debugger files?

**Files to archive**:
- 1-Diagnostics.md - duplicates canonical 07-diagnostics-system
- Diagnostics-System.md - duplicates canonical 07-diagnostics-system
- 2-EventSystemIntegration.md - covered by canonical 07-diagnostics-system §2
- 7-NonTech-.md, 8-NonTech-.md, 9-NonTech-.md - empty placeholder files

**Action**: Move to design-docs/spec-archived-YYYYMMDD/ after integration complete?

**Approve?**: yes

---

## Resolution Instructions

To resolve an item, edit this file and add:

```markdown
### Q1: <title>

**Status**: RESOLVED

**Resolution**: <chosen option with rationale>

**Impact**: <which canonical files will be updated>

**Approved by**: <name>
**Approved at**: <timestamp>
```

Then re-run `/canonicalize-architecture design-docs/debugger/` to continue integration.

---

## Progress Tracking

- [ ] Q1: TypeDesc terminology (BLOCKER)
- [ ] Q2: Diagnostic ID algorithm (BLOCKER)
- [ ] Q3: CompileFinished semantics (BLOCKER)
- [ ] Q4: Missing invariants I28-I29 (BLOCKER)
- [ ] Q5: Debug level scoping (HIGH)
- [ ] Q6: Diagnostic codes overlap (HIGH)
- [ ] Q7: DiagnosticHub vs DebugService (HIGH)
- [ ] Q8: RuntimeHealthSnapshot frequency (HIGH)
- [ ] Q9: DebugGraph/DebugSnapshot (COMPLEMENT)
- [ ] Q10: Rules engine (COMPLEMENT)
- [ ] Q11: Debug UI spec (COMPLEMENT)
- [ ] Q12: Power-user tools (COMPLEMENT)
- [ ] Q13-Q15: Gaps (defer)
- [ ] Q16-Q19: New topics approval
- [ ] Q20: Archive redundant files

**Next step**: Resolve Q1-Q4 (blockers), then re-run this command.
