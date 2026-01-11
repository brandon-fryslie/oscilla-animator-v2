# Modulation Table - Resolution Summary

**Date**: 2026-01-10
**Status**: RESOLVED (except Q3 - deferred to user)
**Source**: design-docs/8.5-Modulation-Table/

---

## Critical Contradictions - RESOLVED

### C1: Binding Model ✅
**Resolution**: Multiple influences allowed per port (canonical spec CombineMode wins)
**Action**: Remove "at most one listener per input port" language from Modulation Table docs

### C2: Event Terminology ✅
**Resolution**: EventHub spec is authoritative; ignore all event definitions from 3-Canonical-Typed-Events.md
**Action**: Do not integrate event definitions from Modulation Table docs

### C3: Direct Bindings ✅
**Resolution**: Direct bindings are just edges; remove/ignore separate "DirectBinding" concept
**Action**: Simplify to unified edge model

---

## Design Questions - RESOLVED

### Q1: UI Paradigm Replacement ✅
**Resolution**: Modulation Table does NOT replace existing UI; remove replacement language
**Action**: Frame as additive UI view, not replacement

### Q2: Bus Publishing Model ✅
**Resolution**: No such thing as "publishers"; remove this language
**Action**: Clarify that buses have inputs (from blocks) not "publishers"

### Q3: Domain Row Identity ⚠️ DEFERRED
**Status**: USER TO DECIDE
**Question**: Should domain parameters (spacing, density, etc.) be runtime-modulated?
**Context**: Current spec has domains as compile-time topology declarations
**Options**:
1. Keep domains compile-time only (recompile required for param changes)
2. Allow runtime modulation of domain params (requires architecture extension)
3. Hybrid: some params compile-time, some runtime

**User Input Needed**: Final decision on domain parameter modulation

### Q4: Recipe View ✅
**Resolution**: Explicitly rejected; do not add Recipe View to canonical spec
**Action**: Omit Recipe View from integration

### Q5: TimeRoot Representation ✅
**Resolution**: TimeRoot has no inputs; loopDuration/playbackSpeed do not exist as TimeRoot properties
**Action**: Reject this section as fundamentally misaligned with canonical spec

---

## Ambiguities - RESOLVED

### A1: Cell Lens Chain Ordering ✅
**Resolution**: Deferred; remove language for now
**Action**: Omit lens chain ordering details from canonical spec

### A2: Compatible Buses Filtering ✅
**Resolution**: "What's a bus?" - needs baseline research first
**Action**: Defer to post-integration research

### A3: Table Ordering ✅
**Resolution**: Not specified; user doesn't care
**Action**: Leave as implementation detail

### A4: Muted Bindings ✅
**Resolution**:
- Muted = `enabled: false`
- Difference from deleted: muted can be re-enabled, deleted must be recreated
**Action**: Add to canonical spec

### A5: Bus Activity Indicator ✅
**Resolution**: Not relevant; discard
**Action**: Omit from canonical spec

---

## Terminology - RESOLVED

### T1: Adapter vs Lens ✅
**Resolution**: Two types of transforms:
- **Adapters**: Type conversion (mechanical port compatibility, no value change)
- **Lenses**: Value transformation (scale, offset, etc. - may or may not change type)
- **Transforms**: Umbrella term = Adapters + Lenses
**Action**: Add to GLOSSARY.md

### T2: Port Terminology ✅
**Resolution**: Canonical spec wins; use PortBinding consistently
**Action**: Adopt canonical language

### T3: Row/Target ✅
**Resolution**: No collision; use "row" for table, "target" for diagnostics
**Action**: No change needed

### T4: Direct Binding ✅
**Resolution**: Binding = Connection = Edge (all synonyms)
**Action**: Standardize on "Edge" in canonical spec

---

## Integration Questions - RESOLVED

### I1: Modulation Table to NormalizedGraph ✅
**Resolution**: Table is UI for modifying patches; does NOT serialize to separate IR
**Action**: Clarify that table modifies patch, which then normalizes to NormalizedGraph

### I2: Lens Registry ✅
**Resolution**: Coming soon; add to TODO/roadmap
**Action**: Note as future work

### I3: CombineMode Visibility ✅
**Resolution**: Read existing spec (multiple influences allowed)
**Action**: Ensure table UI can display CombineMode

### I4: Bus Creation Flow ✅
**Resolution**: Needs baseline research on current architecture
**Action**: Defer details to implementation planning

### I5: Rails in Table ✅
**Resolution**:
- Rails appear as columns only (not rows)
- Remove `time.secondary` references
- Rails visually distinguished in "Rails" section vs "Buses" section
**Action**: Add to canonical spec

---

## Missing Specs - RESOLVED

### M1: Undo/Redo ✅
**Resolution**: Deferred (undo/redo/transactions all deferred)

### M2: Clipboard ✅
**Resolution**: Ignore/discard

### M3: Table View State ✅
**Resolution**: Irrelevant for now

### M4: Block Lifecycle ✅
**Resolution**: Irrelevant; ignore

### M5: Type Conversion UX ✅
**Resolution**: Leave out of spec for now

---

## Actions Required

1. Create new canonical topic: `14-modulation-table.md`
2. Update GLOSSARY.md with:
   - Adapter (transform type)
   - Lens (transform type)
   - Transform (umbrella term)
   - Muted binding
3. Update RESOLUTION-LOG.md with all decisions
4. Archive source files to `design-docs/spec-archived-YYYYMMDD-HHMMSS/`
5. Mark Q3 (Domain Parameters) as OPEN QUESTION in canonical spec

---

## Open Question for User

**Q3: Domain Parameter Modulation**

Should domain parameters be runtime-modulated? This affects:
- Whether domains are pure compile-time topology
- Whether domain params can be bound to buses/signals
- Compilation model (recompile on domain changes?)

**Recommendation**: Defer to Phase 2; keep domains compile-time only for v1

**User Decision**: [PENDING]
