---
command: /canonicalize-architecture @design-docs/debugger/
run_type: UPDATE
timestamp: 2026-01-10T18:30:00Z
status: INTEGRATED
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
---

# Debugger Specification Integration - COMPLETE

**Status**: ✅ ALL 20 RESOLUTIONS INTEGRATED INTO CANONICAL

---

## Summary

Successfully integrated debugger specifications into the canonical Oscilla v2.5 specification. All 20 questions resolved and incorporated into canonical files.

### Files Updated

1. **INVARIANTS.md**
   - Added I28: Diagnostic Attribution
   - Added I29: Error Taxonomy
   - Updated quick reference table

2. **RESOLUTION-LOG.md**
   - Added Q1-Q20 resolutions (20 items, 73 total)
   - Updated approval record
   - Updated category totals

3. **GLOSSARY.md**
   - Added DebugGraph definition
   - Added DebugSnapshot definition
   - Added DebugTap definition
   - Added DebugService definition
   - Added ValueSummary definition
   - Updated deprecated terms table

### Topics to Create (New)

The following topics should be created based on approved resolutions:

- **08-observation-system.md** - DebugGraph, DebugSnapshot, DebugTap, sampling, ring buffers
- **08-diagnostic-rules-engine.md** - 8 diagnostic rules (NaN, silent, conflicts, flatline, sharp, clip, heavy)
- **09-debug-ui-spec.md** - Debug UI (Probe mode, Trace view, diagnostics drawer)
- **10-power-user-debugging.md** - Power-user tools (post-MVP: TraceEvents, Diff tab, FieldPlan)

---

## Resolutions at a Glance

### Blockers (4) - ALL RESOLVED ✅

| Q | Title | Resolution |
|---|-------|-----------|
| Q1 | TypeDesc Terminology | Replace with SignalType (canonical 5-axis model) |
| Q2 | Diagnostic ID Algorithm | `hash(code + primaryTarget.key + signature + patchRevision)` |
| Q3 | CompileFinished Diagnostics | Always present (required field, never undefined) |
| Q4 | Missing Invariants I28-I29 | Added to INVARIANTS.md |

### High-Priority Design (4) - ALL RESOLVED ✅

| Q | Title | Resolution |
|---|-------|-----------|
| Q5 | Debug Level Scoping | Global level (Option A) - simple for MVP |
| Q6 | Diagnostic Codes Overlap | Merge, use more specific names |
| Q7 | DiagnosticHub vs DebugService | Separate services (Option B) |
| Q8 | RuntimeHealthSnapshot Frequency | Configurable by user (separate from DebugSnapshot) |

### Complements (4) - ALL APPROVED ✅

| Q | Title | Resolution |
|---|-------|-----------|
| Q9 | DebugGraph & DebugSnapshot | Create 08-observation-system.md |
| Q10 | Diagnostic Rules Engine | Create 08-diagnostic-rules-engine.md |
| Q11 | Debug UI Specification | Create 09-debug-ui-spec.md |
| Q12 | Power-User Tools | Create 10-power-user-debugging.md (post-MVP) |

### Gaps (3) - ALL RESOLVED ✅

| Q | Title | Resolution |
|---|-------|-----------|
| Q13 | TimeRoot Error Filtering | Show only if user-caused or fixable |
| Q14 | Diagnostic Muting Persistence | Not critical for MVP |
| Q15 | Authoring Validator Triggers | Run only on relevant state changes |

### Approvals (4) - ALL APPROVED ✅

| Q | Title | Resolution |
|---|-------|-----------|
| Q16-Q19 | New Topics | All 4 approved |
| Q20 | Archive Redundant Files | Move to spec-archived-20260110/ |

---

## Impact Summary

### Canonical Specification Evolution

- **Topics**: 7 → 10-11 (add observation, rules, UI, power-user)
- **Invariants**: 27 → 29 (add I28, I29)
- **Glossary terms**: +5 new debug/observation terms
- **Resolutions**: 53 → 73 (+20 debugger integration)

### Key Architectural Decisions

1. **Observation System**: Separate from diagnostics (DebugService ≠ DiagnosticHub)
2. **Type Representation**: All diagnostic payloads use SignalType (five-axis model)
3. **Debug Levels**: Single global level for MVP (per-tap enhancement later)
4. **Snapshot Frequency**: User-configurable, separate from health monitoring
5. **Diagnostic IDs**: Stable within patch, re-notified on patch change

---

## Next Steps

### Immediate

1. Create the 4 new canonical topic files (08-observation, 08-rules, 09-ui, 10-power-user)
2. Archive redundant debugger files per Q20
3. Update INDEX.md with new topic list
4. Update source-map.md with debugger contributions

### Near-term (Implementation Phase)

1. Implement DebugService + DebugTap interfaces
2. Add instrumentation hooks to compiler (onDebugGraph)
3. Add runtime taps (bus evaluation, binding evaluation, materialization)
4. Implement snapshot ring buffers
5. Implement probe mode UI

### Post-MVP

1. Implement rules engine (Q10)
2. Implement power-user debug features (Q12)
3. Advanced observation modes (FULL level, per-stage values)

---

## Approval Record

- **All 20 items**: APPROVED by Brandon Fryslie
- **Approved at**: 2026-01-10T18:00:00Z
- **Integrated into canonical**: 2026-01-10T18:30:00Z
- **Canonical status**: UPDATING (awaiting new topic creation)
- **Transition to CANONICAL**: After new topics created + INDEX updated

---

## Working Documents Superseded

The following working documents are now superseded by this integration:

- `CANONICALIZED-SUMMARY-update-20260110-163000.md`
- `CANONICALIZED-QUESTIONS-update-20260110-163000.md`

Archive location: `design-docs/canonicalization-archive-20260110/`

---

## Files Modified

```
CANONICAL-oscilla-v2.5-20260109/
├── INVARIANTS.md ...................... +2 invariants (I28, I29)
├── RESOLUTION-LOG.md .................. +20 resolutions (Q1-Q20)
└── GLOSSARY.md ........................ +5 observation terms
```

---

## Verification Checklist

- [x] All 4 blockers resolved
- [x] All 4 design decisions made
- [x] All 4 complements approved
- [x] All 3 gaps addressed
- [x] All 4 topic approvals recorded
- [x] I28-I29 added to INVARIANTS
- [x] Diagnostic ID algorithm finalized
- [x] CompileFinished semantics clarified
- [x] Debug level strategy established
- [x] Observation system architecture defined
- [x] GLOSSARY updated with new terms
- [x] RESOLUTION-LOG complete
- [x] No blocking contradictions remain

---

**Integration Status**: ✅ COMPLETE AND APPROVED

All architectural questions resolved. Canonical specification ready for new topic creation phase.
