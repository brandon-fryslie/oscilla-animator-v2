---
command: /canonicalize-architecture design-docs/ design-docs/final-System-Invariants/
run_type: UPDATE
indexed: true
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-11T06:00:00Z
new_sources:
  - design-docs/compiler-changes.md
  - design-docs/runtime-changes.md
  - design-docs/IR-and-normalization-5-axes.md
  - design-docs/spec/10-linear-graph-editor.md
  - design-docs/later_spec/HANDOFF-ForeverYours-Debug.md
  - design-docs/later_spec/steel-thread-validation.md
  - design-docs/later_spec/TUTORIAL.md
---

# Canonicalization Summary - Design Docs Update

**Status**: Analysis complete, minimal integration needed
**Created**: 2026-01-11T06:00:00Z
**Canonical Base**: CANONICAL-oscilla-v2.5-20260109/ (14 topics, 54 sources, 77 resolutions)

---

## Executive Summary

Analyzed 7 new source files from `design-docs/` and `design-docs/later_spec/`.

**Key Finding**: 6 of 7 files are **archival ChatGPT conversation exports** that document the design conversations that PRODUCED the existing canonical v2.5 specification. The content is already integrated.

**Only 1 file requires integration**: `spec/10-linear-graph-editor.md` - a NEW UI specification not yet in canonical.

---

## Document Analysis

### ARCHIVAL (Already Integrated)

These files are ChatGPT conversation exports documenting the v2.5 architecture design process. The resulting architecture is already in the canonical spec:

| File | Content | Canonical Location | Status |
|------|---------|-------------------|--------|
| `compiler-changes.md` | "Fundamental Axes in Systems" - 5-axis type system, compiler pipeline design | Topics 01, 04 | ✅ OVERLAP - design rationale |
| `runtime-changes.md` | Runtime implications of 5-axis compile-time model | Topic 05 | ✅ OVERLAP - design rationale |
| `IR-and-normalization-5-axes.md` | Detailed IR schema (`AxesDescIR`, `TypeDesc`), graph normalization v2.5 | Topics 04, 05 | ✅ OVERLAP - detailed specs match |
| `later_spec/HANDOFF-ForeverYours-Debug.md` | Debug system handoff notes | Topics 07-10 | ✅ OVERLAP - debug already integrated |
| `later_spec/steel-thread-validation.md` | Steel thread validation approach | Planning/methodology | ℹ️ INFORMATIONAL |
| `later_spec/TUTORIAL.md` | Tutorial notes | Documentation | ℹ️ INFORMATIONAL |

**Recommendation**: Archive these as `design-docs/conversations-archived-20260111/` to preserve design history without treating as active specs.

---

### NEW CONTENT (Requires Integration)

| File | Content | Proposed Location | Priority |
|------|---------|------------------|----------|
| `spec/10-linear-graph-editor.md` | Linear auto-layout graph editor UI specification | NEW: Topic 15 "Graph Editor UI" | MEDIUM |

**Details**:
- **What it is**: UI spec for automatic linear layout graph editor with perspective rotation
- **Key concepts**: Chain traversal, pivot blocks, focus/dimming, automatic layout
- **Integration**: Creates new UI-focused topic (similar to Topic 14: Modulation Table UI)
- **Tier**: T3 (Optional) - UI implementation detail, can change freely

---

## Overlap Analysis

### Compiler/IR Architecture (99% Overlap)

The ChatGPT conversation exports document the DESIGN PROCESS that produced:
- Five-axis type system (Topic 01)
- Compile-time-only axes (Topic 04)
- Graph normalization v2.5 (Topic 04)
- `CompiledProgramIR` with `AxesDescIR` and `TypeDesc` (Topic 05)
- Slot planning and `slotMeta` contract (Topic 05)

**Value**: These docs show **WHY** decisions were made, providing rationale behind canonical specs. Worth preserving as design history but NOT as active specification sources.

---

## Proposed Actions

### 1. Archive Conversation Exports

```bash
mkdir design-docs/conversations-archived-20260111
mv design-docs/compiler-changes.md design-docs/conversations-archived-20260111/
mv design-docs/runtime-changes.md design-docs/conversations-archived-20260111/
mv design-docs/IR-and-normalization-5-axes.md design-docs/conversations-archived-20260111/
mv design-docs/later_spec/ design-docs/conversations-archived-20260111/
```

Update `CANONICAL-.../appendices/superseded-docs.md` to note these are archived as design history.

###  2. Integrate Linear Graph Editor Spec

**Create**: `topics/15-graph-editor-ui.md`
**Tier**: T3 (Optional - UI implementation)
**Content**:
- Auto-layout algorithm
- Chain traversal semantics
- Perspective rotation
- Focus/dimming states
- Keyboard/mouse interactions

**No conflicts**: This is purely additive UI specification.

---

## Canonicalization Status

| Category | Count | Details |
|----------|-------|---------|
| **New sources analyzed** | 7 | 6 archival, 1 new spec |
| **Contradictions** | 0 | No conflicts with canonical |
| **Ambiguities** | 0 | Linear editor spec is clear and self-contained |
| **Gaps** | 0 | No missing references |
| **New topics proposed** | 1 | Topic 15: Graph Editor UI |

**Progress**: 100% (no questions require resolution)

---

## Integration Plan

### Immediate (No Blockers)

1. Create `topics/15-graph-editor-ui.md` from `spec/10-linear-graph-editor.md`
2. Add Topic 15 to INDEX.md topics table
3. Archive conversation exports to `conversations-archived-20260111/`
4. Update source map with Topic 15
5. Set INDEX.md status back to CANONICAL

### No User Resolution Required

All content either overlaps (archival) or is additive (graph editor UI). No contradictions or ambiguities to resolve.

---

## Recommendation

**Proceed directly to integration** without generating QUESTIONS file - no conflicts exist.

User approval needed for:
1. ✅ Archiving conversation exports as design history
2. ✅ Adding Topic 15 (Graph Editor UI) as T3 (Optional)

---

**END OF SUMMARY**
