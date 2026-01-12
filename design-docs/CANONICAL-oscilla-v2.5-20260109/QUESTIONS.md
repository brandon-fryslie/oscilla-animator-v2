---
command: /canonicalize-architecture design-docs/debugger/
run_type: UPDATE
indexed: true
source_files:
  - design-docs/debugger/*.md (16 files)
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-10T16:30:00Z
reorganized: 2026-01-12
progress: 20
total_issues: 20
resolved: 20
pending: 0
---

# Canonicalization Questions - Organized by Tier

> **Status**: ✅ ALL 20 ITEMS RESOLVED
> **Ready for integration**

---

## T1 QUESTIONS (Foundational - Affects Core Architecture)

These affect T1 topics (type-system, block-system, time-system, compilation, runtime, renderer, continuity, INVARIANTS).

### Q1: TypeDesc Terminology Mismatch ✅ RESPONDED

**Affects**: T1 (01-type-system)
**Severity**: BLOCKER
**Source**: debugger/4-DiagnosticPayloadSpec.md vs topics/01-type-system.md

**Problem**: Debugger uses "TypeDesc", canonical uses "SignalType = PayloadType + Extent" (5-axis model).

**Options**:
- A. Replace TypeDesc with SignalType everywhere
- B. Define TypeDesc as alias for SignalType
- C. Keep both, define mapping

**Your Response**: Option A - replace all TypeDesc with standard 5 axis mapping

**Status**: ✅ APPROVED - Implement Option A

---

### Q4: Missing Invariants I28-I29 ✅ RESPONDED

**Affects**: T1 (INVARIANTS.md)
**Severity**: BLOCKER
**Source**: 07-diagnostics-system references I28, I29 which don't exist in INVARIANTS.md

**Options**:
- A. Add I28-I29 to INVARIANTS.md
- B. Remove references from 07-diagnostics-system
- C. Renumber/merge into existing invariants

**Proposed**:
- I28: "Diagnostic Attribution - Every diagnostic must be attributable to a specific graph element via TargetRef"
- I29: "Error Taxonomy - Errors are categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint)"

**Your Response**: Option A

**Status**: ✅ APPROVED - Add I28-I29 with proposed definitions

---

## T2 QUESTIONS (Structural - Affects Observability Systems)

These affect T2 topics (diagnostics-system, observation-system, diagnostic-rules-engine, event-hub, event-diagnostics-integration).

### Q2: Diagnostic ID Stability Algorithm Conflict ✅ RESPONDED

**Affects**: T2 (07-diagnostics-system)
**Severity**: BLOCKER
**Source**: Three conflicting ID generation specs

**Problem**:
1. Canonical: `id = hash(code + primaryTarget.key + signature)`
2. DiagnosticPayloadSpec: Same as canonical
3. DiagnosticsPolish: `id = stableHash(code, target.id, timestamp, patchRevision)` - includes timestamp!

**Options**:
- A. Use canonical algorithm (exclude timestamp/patchRevision)
- B. Use DiagnosticsPolish algorithm (include timestamp/patchRevision)

**Your Response**: "Agree with caveat - using patch revision is smart, because we want to get the message again whenever the patch changes. It is NOT the same error if it is two different patches"

**Status**: ✅ APPROVED - Use `hash(code + primaryTarget.key + signature + patchRevision)` but EXCLUDE timestamp

---

### Q3: CompileFinished Diagnostics Snapshot Semantics ✅ RESPONDED

**Affects**: T2 (07-diagnostics-system)
**Severity**: BLOCKER
**Source**: Canonical requires diagnostics always present, debugger makes it optional

**Options**:
- A. Diagnostics always present (empty array if none)
- B. Diagnostics optional

**Your Response**: "Agreed, A. No optional properties"

**Status**: ✅ APPROVED - diagnostics field always required (empty array is valid)

---

### Q5: Debug Level Scoping - Global vs Per-Tap ✅ RESPONDED

**Affects**: T2 (08-observation-system)
**Severity**: HIGH
**Source**: debugger/2-NonTech-Arch.md vs debugger/3-NonTech-LowLevel.md

**Problem**: Global debug level (one setting) vs per-tap debug level (each tap has own level)?

**Options**:
- A. Global level (simpler)
- B. Per-tap level (more flexible)
- C. Hybrid: Global minimum + per-tap override

**Your Response**: "Global is fine"

**Status**: ✅ APPROVED - Option A (global level for MVP)

---

### Q6: Diagnostic Codes Overlap ✅ RESPONDED

**Affects**: T2 (07-diagnostics-system)
**Severity**: HIGH
**Source**: Overlapping codes between canonical and debugger specs

**Examples**:
- E_DOMAIN_MISMATCH vs E_FIELD_DOMAIN_MISMATCH
- E_CYCLE_ILLEGAL vs E_GRAPH_CYCLE_ILLEGAL
- W_BUS_EMPTY vs W_BUS_EMPTY_SILENT

**Options**:
- A. Merge overlapping codes
- B. Keep both as aliases
- C. Reject debugger codes, use only canonical

**Your Response**: "Merge (option A). do not keep overlapping. just use your judgement, it's not rocket science"

**Status**: ✅ APPROVED - Merge codes, use more specific names

---

### Q7: DiagnosticHub vs DebugService Separation ✅ RESPONDED

**Affects**: T2 (07-diagnostics-system, 08-observation-system)
**Severity**: HIGH
**Source**: Should diagnostic problems and runtime observation be same service?

**Options**:
- A. Same service (DiagnosticHub does both)
- B. Separate services (DiagnosticHub + DebugService)
- C. Layered (DebugService uses DiagnosticHub)

**Your Response**: "Sure Option B. IF you do narrow it to one, I like the DiagnosticHub name better"

**Status**: ✅ APPROVED - Keep separate (Option B)

---

### Q8: RuntimeHealthSnapshot Frequency ✅ RESPONDED

**Affects**: T2 (07-diagnostics-system, 08-observation-system)
**Severity**: HIGH
**Source**: Canonical says 2-5 Hz, debugger says 15 Hz

**Options**:
- A. Unify to single frequency (5 Hz)
- B. Dual frequencies (Health 2-5 Hz, Debug 15 Hz)
- C. Configurable frequency

**Your Response**: "Configurable by user"

**Status**: ✅ APPROVED - Option C (configurable)

---

### Q9-Q12: New Topic Integration ✅ RESPONDED

**Affects**: T2/T3 (new topics)

| Q# | Proposed Topic | Your Response |
|----|----------------|---------------|
| Q9 | 08-observation-system.md (DebugGraph, DebugSnapshot) | Yes - update as needed for our system |
| Q10 | 08b-diagnostic-rules-engine.md (8 rules) | Yes - update as needed |
| Q11 | 09-debug-ui-spec.md (probe mode, trace view) | Yes - update as needed |
| Q12 | 10-power-user-debugging.md (TraceEvents, post-MVP) | Yes - update as needed |

**Status**: ✅ APPROVED - All 4 topics approved (already created during indexing)

---

## T3 QUESTIONS (Optional - UI/Polish)

These affect T3 topics (debug-ui-spec, power-user-debugging, modulation-table-ui, graph-editor-ui).

### Q13: Filtering Rules for TimeRoot Diagnostics ✅ RESPONDED

**Affects**: T3 (09-debug-ui-spec)
**Severity**: LOW

**Problem**: Should timeRoot block errors be shown to users?

**Your Response**: "Depends on the error. Is it something caused by the user, or that the user can fix? then show it to the user. Otherwise don't"

**Status**: ✅ APPROVED - Show if user-actionable

---

### Q14: Diagnostic Muting Persistence ✅ RESPONDED

**Affects**: T3 (09-debug-ui-spec)
**Severity**: LOW

**Problem**: Where is mute state stored? (localStorage? patch metadata?)

**Your Response**: "Literally doesn't matter"

**Status**: ✅ APPROVED - Implementation detail, defer

---

### Q15: Authoring Validator Trigger Conditions ✅ RESPONDED

**Affects**: T3 (implementation detail)
**Severity**: LOW

**Problem**: Does "missing TimeRoot" validator run on every GraphCommitted?

**Your Response**: "no need to run it if we know it hasn't broken"

**Status**: ✅ APPROVED - Optimize by caching

---

## ADMINISTRATIVE

### Q16-Q19: New Topics ✅ APPROVED

All 4 new topics approved and already created during indexing:
- Q16: 08-observation-system.md ✅
- Q17: 08b-diagnostic-rules-engine.md ✅
- Q18: 09-debug-ui-spec.md ✅
- Q19: 10-power-user-debugging.md ✅

---

### Q20: Archive Redundant Files ✅ RESPONDED

**Files to archive**:
- 1-Diagnostics.md (duplicates canonical)
- Diagnostics-System.md (duplicates canonical)
- 2-EventSystemIntegration.md (covered by canonical)
- 7-NonTech-.md, 8-NonTech-.md, 9-NonTech-.md (empty)

**Your Response**: "yes"

**Status**: ✅ APPROVED - Archive after integration

---

## SUMMARY

### All 20 Resolved ✅
- Q1-Q4 - T1 blockers resolved
- Q5-Q8 - T2 high priority resolved
- Q9-Q12 - New topics approved
- Q13-Q15 - T3 low priority resolved
- Q16-Q20 - Administrative items approved

### Ready to Integrate
All questions answered. Integration can proceed.

---

## Next Steps

1. **Review this summary** - Confirm all your responses are captured correctly
2. **Answer Q5** - I can provide technical details if needed
3. **Run integration** - Apply all resolutions to canonical spec
