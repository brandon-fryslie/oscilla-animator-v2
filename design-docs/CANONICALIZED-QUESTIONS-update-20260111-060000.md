---
command: /canonicalize-architecture design-docs/ design-docs/final-System-Invariants/
run_type: UPDATE
indexed: true
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-11T06:00:00Z
progress: 100
total_issues: 2
critical: 0
high: 0
medium: 2
low: 0
---

# Canonicalization Questions - Design Docs Update

> **UPDATE RUN**: Integrating design-docs/ sources into existing canonical specification
>
> **Status**: ✅ 2 of 2 items resolved (approval only)
> **Critical blockers**: 0
> **Existing canonical**: CANONICAL-oscilla-v2.5-20260109/ (14 topics, 54 sources, 77 resolutions)

---

## APPROVAL ITEMS (User Confirmation Only)

These are not contradictions or ambiguities - just actions requiring user approval.

### A1: Archive ChatGPT Conversation Exports

**Category**: ADMINISTRATIVE
**Severity**: INFORMATIONAL

**The Situation**:
6 of 7 new source files are ChatGPT conversation exports documenting the design process that produced the v2.5 canonical specification:

- `compiler-changes.md` - "Fundamental Axes in Systems" conversation
- `runtime-changes.md` - Runtime implications discussion
- `IR-and-normalization-5-axes.md` - Detailed IR/normalization spec from conversation
- `later_spec/HANDOFF-ForeverYours-Debug.md` - Debug system handoff
- `later_spec/steel-thread-validation.md` - Validation approach notes
- `later_spec/TUTORIAL.md` - Tutorial notes

**Current Status**: These files contain architectural content ALREADY INTEGRATED into canonical Topics 01, 04, 05, 07-10.

**Value**: These docs show design rationale and decision-making process - valuable as historical context.

**Proposed Action**:
```bash
# Archive as design history
mkdir -p design-docs/conversations-archived-20260111
mv design-docs/compiler-changes.md design-docs/conversations-archived-20260111/
mv design-docs/runtime-changes.md design-docs/conversations-archived-20260111/
mv design-docs/IR-and-normalization-5-axes.md design-docs/conversations-archived-20260111/
mv design-docs/later_spec/ design-docs/conversations-archived-20260111/

# Update appendices/superseded-docs.md
```

**Rationale**: These are design artifacts, not active specifications. Archiving preserves history without treating as canonical sources.

**Impact**: None to canonical spec - purely organizational

**Status**: RESOLVED
**Resolution**: APPROVE - Archive as design history

---

### A2: Add Topic 15 - Graph Editor UI

**Category**: NEW-TOPIC
**Severity**: NORMAL

**Source**: `design-docs/spec/10-linear-graph-editor.md`

**Content**: Complete UI specification for linear auto-layout graph editor with:
- Automatic block positioning (no manual drag-and-drop)
- Chain traversal and focus semantics
- Perspective rotation at pivot blocks
- Focus/dimming visual states
- Keyboard/mouse interaction patterns

**Proposed Integration**:
- **New topic**: `topics/15-graph-editor-ui.md`
- **Tier**: T3 (Optional) - UI implementation detail
- **Dependencies**: None (self-contained UI spec)
- **Conflicts**: None

**Consistency Check**:
- ✅ Aligns with existing UI topics (09: Debug UI, 14: Modulation Table UI)
- ✅ No conflicts with core architecture
- ✅ Self-contained specification
- ✅ Clear acceptance criteria

**Rationale**: This is a genuinely new UI specification not yet in canonical. Adding as T3 (Optional) makes sense - UI implementation can change freely without affecting core architecture.

**Impact**: Additive only - creates new topic, no changes to existing topics

**Status**: RESOLVED
**Resolution**: APPROVE - Add as Topic 15 (T3: Optional)

---

## SUMMARY

### What Was Analyzed

| Category | Count | Status |
|----------|-------|--------|
| Archival conversation exports | 6 | → Archive as design history |
| New UI specifications | 1 | → Add as Topic 15 |
| Contradictions found | 0 | ✅ None |
| Ambiguities found | 0 | ✅ None |
| Gaps found | 0 | ✅ None |

### Integration Plan

**Phase 1: Archive**
1. Move conversation exports to `conversations-archived-20260111/`
2. Update `appendices/superseded-docs.md`

**Phase 2: Add New Topic**
1. Create `topics/15-graph-editor-ui.md` from `spec/10-linear-graph-editor.md`
2. Update INDEX.md:
   - Add Topic 15 to topics table
   - Increment source count to 55
   - Increment topics count to 15
3. Update `appendices/source-map.md`
4. Add terms to GLOSSARY if needed (chain, pivot block, perspective rotation)

**Phase 3: Finalize**
1. Update RESOLUTION-LOG.md with these 2 administrative decisions
2. Set INDEX.md status to CANONICAL
3. Update generated/updated timestamps

---

## Resolution Progress

| Category | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| Approval Items | 2 | 2 | 0 |
| **Total** | **2** | **2** | **0** |

**Progress: 100%**

---

**RECOMMENDATION**: Proceed directly to integration - no actual conflicts or ambiguities exist, only administrative actions requiring approval.

---

**END OF ANALYSIS**
