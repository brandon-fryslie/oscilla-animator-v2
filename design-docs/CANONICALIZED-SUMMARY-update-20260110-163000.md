---
command: /canonicalize-architecture design-docs/debugger/
run_type: UPDATE
timestamp: 2026-01-10T16:30:00Z
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
new_sources: 16
issues_found: 20
critical_blockers: 4
---

# Canonicalization Summary - Debugger Specs Update

## Executive Summary

Analyzed 16 debugger specification files for integration into existing canonical Oscilla v2.5 specification (7 topics, 53 prior resolutions).

**Overall Assessment**: Integration feasible but requires resolving 4 critical blockers first.

**Key Finding**: Debugger specs are high-quality v1 documentation that largely aligns with v2 architecture but has terminology/algorithm mismatches that must be resolved before implementation.

---

## Files Analyzed

| File | Status | Assessment |
|------|--------|------------|
| 1-Diagnostics.md | REDUNDANT | Duplicates canonical 07-diagnostics-system.md |
| Diagnostics-System.md | REDUNDANT | Duplicates canonical 07-diagnostics-system.md |
| 2-EventSystemIntegration.md | REDUNDANT | Covered by canonical 07-diagnostics-system §2 |
| 3-Diagnostic-Events-and-Payloads-Schema.md | INTEGRATE | Resolve Q1, Q3, then merge |
| 4-DiagnosticPayloadSpec.md | INTEGRATE | Resolve Q1, Q2, Q6, then merge |
| 5-DiagnosticsPolish.md | INTEGRATE | Resolve Q2, then merge |
| 1-NonTech-Overview.md | NEW TOPIC | Propose 09-debug-ui-spec.md |
| 2-NonTech-Arch.md | NEW TOPIC | Propose 08-observation-system.md |
| 3-NonTech-LowLevel.md | NEW TOPIC | Merge into 08-observation-system.md |
| 4-NonTech-UI-Spec.md | NEW TOPIC | Propose 09-debug-ui-spec.md |
| 5-NonTech-RulesEngine.md | NEW TOPIC | Propose 08-diagnostic-rules-engine.md |
| 6-NonTech-MainUI.md | NEW TOPIC | Merge into 09-debug-ui-spec.md |
| 10-PowerUser-Overview.md | NEW TOPIC | Propose 10-power-user-debugging.md (post-MVP) |
| 7-NonTech-.md | DELETE | Empty placeholder |
| 8-NonTech-.md | DELETE | Empty placeholder |
| 9-NonTech-.md | DELETE | Empty placeholder |

---

## Issues Summary

### Critical Blockers (4)

Must be resolved before any integration:

1. **Q1: TypeDesc vs SignalType** - Terminology mismatch between debugger specs and canonical five-axis type model
2. **Q2: Diagnostic ID algorithm** - Three conflicting ID generation specs
3. **Q3: CompileFinished semantics** - Optional vs required diagnostics field
4. **Q4: Missing invariants** - References to I28-I29 that don't exist

### High Priority Design Decisions (4)

Should be resolved for quality but don't block:

5. **Q5: Debug level scoping** - Global vs per-tap
6. **Q6: Diagnostic codes overlap** - Merge or keep separate
7. **Q7: DiagnosticHub vs DebugService** - Separation of concerns
8. **Q8: RuntimeHealthSnapshot frequency** - Unify or dual frequencies

### Complementary Content (4)

High-value additions that should be integrated:

9. **Q9: DebugGraph/DebugSnapshot** - Complete observation system spec
10. **Q10: Diagnostic rules engine** - 8 rules with conditions and fixes
11. **Q11: Debug UI specification** - Non-technical UX details
12. **Q12: Power-user tools** - Advanced debugging features

### Gaps (3)

Underspecified areas to clarify:

13-15. Filtering rules, muting persistence, validator triggers (defer to implementation)

### New Topics Proposed (4)

16. **08-observation-system.md** - DebugGraph, DebugSnapshot, DebugTap
17. **08-diagnostic-rules-engine.md** - Rules + conditions + fixes (OR merge into 08-observation)
18. **09-debug-ui-spec.md** - Non-technical debug UX
19. **10-power-user-debugging.md** - TraceEvents, Diff tab, FieldPlan (post-MVP)

---

## Affected Canonical Topics

### Will be Updated

- **07-diagnostics-system.md**: Merge resolved content from debugger specs 3-5
- **INVARIANTS.md**: Add I28-I29 (diagnostic attribution, error taxonomy)
- **GLOSSARY.md**: Add DebugGraph, DebugSnapshot, DebugTap, DebugService terms
- **RESOLUTION-LOG.md**: Add Q1-Q20 resolutions

### Will be Created (if approved)

- **08-observation-system.md**: New topic for runtime observation
- **08-diagnostic-rules-engine.md**: New topic for rules (OR merge into 08-observation)
- **09-debug-ui-spec.md**: New topic for debug UX
- **10-power-user-debugging.md**: New topic for advanced debugging

---

## Recommended Integration Path

### Phase 1: Resolve Blockers (Required)

1. Resolve Q1-Q4 in CANONICALIZED-QUESTIONS file
2. Re-run canonicalization to validate resolutions
3. Update affected canonical files per resolutions

### Phase 2: Design Decisions (Recommended)

1. Resolve Q5-Q8 design decisions
2. Update canonical topics with chosen approaches
3. Update RESOLUTION-LOG with rationale

### Phase 3: Integration (High Value)

1. Approve/reject proposed new topics (Q16-Q19)
2. Create approved new topic files
3. Merge complementary content (Q9-Q12)
4. Update cross-references throughout encyclopedia

### Phase 4: Finalization

1. Archive redundant files (Q20)
2. Update INDEX.md (source count, topic count, search hints)
3. Update appendices/source-map.md
4. Upgrade status from UPDATING → CANONICAL

---

## Next Actions

**Immediate (User)**:
1. Review CANONICALIZED-QUESTIONS-update-20260110-163000.md
2. Resolve Q1-Q4 (critical blockers)
3. Decide on Q16-Q19 (new topic approvals)

**After Resolution (Re-run Canonicalization)**:
1. Run `/canonicalize-architecture design-docs/debugger/`
2. Tool will detect resolutions and proceed to integration phase
3. Tool will create/update canonical files per resolutions

**Upon Completion**:
- INDEX.md status: UPDATING → CANONICAL
- Source count: 27 → 43 (add 16 debugger files)
- Topic count: 7 → 10 or 11 (depending on approvals)
- Resolution count: 53 → 73 (add 20 resolutions)

---

## Quality Assessment

**Debugger Specs Quality**: HIGH
- Well-structured, thorough documentation
- Clear separation of technical vs non-technical concerns
- Good coverage of both MVP and post-MVP features

**Alignment with Canonical**: GOOD with caveats
- Core concepts align well
- Terminology needs mapping (TypeDesc → SignalType)
- Algorithm conflicts are resolvable
- Valuable complementary detail

**Integration Effort**: MODERATE
- 4 critical blockers (1-2 hours to resolve)
- 4 design decisions (architectural review session)
- 4 new topics to create (~8-12 hours total)
- Merge work (~4-6 hours)

**Total Estimated Effort**: 15-20 hours (spread across resolution + integration + review)

---

## Risks

**Low Risk**:
- Debugger specs are v1 but concepts transfer to v2
- No fundamental architectural conflicts
- Resolutions are straightforward (choose one option)

**Medium Risk**:
- New topics may introduce maintenance burden
- DiagnosticHub vs DebugService separation needs clear boundaries

**Mitigation**:
- Resolve blockers with stakeholder input (don't guess)
- Keep new topics focused (don't bloat)
- Document all resolution rationale in RESOLUTION-LOG

---

## Files Created

1. `CANONICALIZED-QUESTIONS-update-20260110-163000.md` - 20 items to resolve
2. `CANONICALIZED-SUMMARY-update-20260110-163000.md` - This file

**Status**: INDEX.md status set to UPDATING, awaiting user resolution of Q1-Q4.
