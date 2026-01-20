# Index: Auto-Arrange Layout Planning

**Issue:** oscilla-animator-v2-8fp
**Epic:** patch-editor-ui Sprint 2B Phase 1
**Status:** PLANNING
**Date:** 2026-01-19

---

## Planning Documents

### Core Planning
- **PLAN-20260119.md** - Implementation plan with step-by-step tasks
- **DOD-20260119.md** - Definition of done with acceptance criteria
- **CONTEXT-20260119.md** - Background, requirements, and technical context

### Completion (Not Yet Created)
- **COMPLETION-20260119.md** - Will document final results and closure

---

## Quick Start

**For Implementation:**
1. Read CONTEXT-20260119.md for background
2. Read PLAN-20260119.md for step-by-step tasks
3. Use DOD-20260119.md to verify completion

**For Verification:**
1. Read DOD-20260119.md for acceptance criteria
2. Run manual tests from PLAN-20260119.md Step 2
3. Run E2E tests from PLAN-20260119.md Step 5

**For Review:**
1. Check COMPLETION-20260119.md (when created)
2. Verify all DOD criteria met
3. Test in dev server

---

## Document Summaries

### PLAN-20260119.md
**Purpose:** Step-by-step implementation guide

**Key Sections:**
- P0: Verification & Refinement (review current code, test manually, fix gaps)
- P1: Testing (create E2E tests, verify all scenarios)
- P2: Documentation (update roadmap, close beads issue)

**Estimated Time:** 2.5-4.5 hours

**Current Status:** Ready to execute

---

### DOD-20260119.md
**Purpose:** Define when work is complete

**Acceptance Criteria Categories:**
1. **Functional (AC1-AC5):** Button, layout algorithm, zoom-to-fit, edge cases, performance
2. **Code Quality (CQ1-CQ3):** TypeScript, code structure, integration
3. **Testing (TC1-TC3):** E2E tests, execution, manual verification
4. **Documentation (DC1-DC4):** Code comments, planning files, roadmap, beads
5. **Non-Functional (NF1-NF3):** UX, accessibility, error handling

**Definition of COMPLETE:** ALL criteria must be met

---

### CONTEXT-20260119.md
**Purpose:** Provide full background and context

**Key Information:**
- Issue background and priority
- Historical context (Rete migration)
- Current implementation state
- Architecture and data flow
- Requirements reference
- Dependencies and constraints
- Known issues and risks
- Testing strategy

**Most Useful For:**
- Understanding "why" decisions were made
- Finding related documents and commits
- Understanding integration points
- Identifying risks

---

## Key Facts

### Current Implementation Status

**✅ Already Implemented:**
- ELK layout algorithm (src/ui/reactFlowEditor/layout.ts)
- Auto-arrange button (ReactFlowEditor.tsx:302-310)
- Handler callback (ReactFlowEditor.tsx:166-182)
- Configuration matches requirements (RIGHT, 100px, 80px)
- Loading state management
- Zoom-to-fit integration

**⚠️ Needs Work:**
- Edge case handling (empty graph, single node)
- Error handling (catch block)
- E2E tests (none exist yet)
- Runtime verification (not tested)

**❌ Missing:**
- E2E test file (tests/e2e/auto-arrange.test.ts)
- Completion documentation (COMPLETION-20260119.md)
- Roadmap update
- Beads closure

---

## Requirements Summary

**From Beads Issue (oscilla-animator-v2-8fp):**
1. Algorithm: ELK 'layered' ✅
2. Direction: 'RIGHT' (left-to-right) ✅
3. Node spacing: 100px ✅
4. Layer spacing: 80px ✅
5. Toolbar button: ✅

**From Analysis Document:**
- Priority: EXTREMELY HIGH
- Risk if missing: Manual node positioning only
- Migration from Rete.js (which had this feature)

**From CLAUDE.md:**
- Goals must be verifiable → **E2E TESTS REQUIRED**
- Single source of truth → layout.ts is canonical
- No duplication → One layout implementation

---

## Testing Requirements

### E2E Tests (REQUIRED)

**Must Test:**
1. Button visibility
2. Empty graph edge case
3. Single node edge case
4. Multiple nodes - no overlap verification
5. Loading state during layout
6. Zoom-to-fit after layout

**File:** `tests/e2e/auto-arrange.test.ts` (does not exist yet)

**Framework:** Playwright (already installed)

---

## Dependencies

**Runtime:**
- elkjs@^0.11.0 ✅ INSTALLED
- reactflow@^11.11.4 ✅ INSTALLED

**Testing:**
- playwright@^1.57.0 ✅ INSTALLED

**Blocked By:** None (ready to implement)

**Blocks:** None (independent feature)

---

## Timeline

**Total Estimate:** 2.5-4.5 hours

**Breakdown:**
- P0 (Verification & Refinement): 1-2 hours
- P1 (Testing): 1-2 hours
- P2 (Documentation): 0.5 hours

**Actual Time:** TBD (will record in COMPLETION doc)

---

## Related Work

### Previous Sprints
- **Sprint 2A (COMPLETED):** Undo/redo, context menu, keyboard shortcuts
- **Sprint 2B Phase 1 (PARTIAL):** Auto-layout for Rete (then Rete was removed)

### Related Issues
- **oscilla-animator-v2-wc9:** Connection type validation (separate)
- **oscilla-animator-v2-31g:** Minimap (lower priority)

### Planning Files
- `.agent_planning/rete-removal/ANALYSIS-rete-vs-reactflow.md`
- `.agent_planning/patch-editor-ui/*` (Sprint 2A/2B docs)

---

## Navigation

**Up:** `.agent_planning/` (all planning)
**Related:** `.agent_planning/patch-editor-ui/` (parent epic)
**Spec:** None (UI feature, no canonical spec)
**Code:** `src/ui/reactFlowEditor/layout.ts`, `ReactFlowEditor.tsx`
**Tests:** `tests/e2e/` (will create auto-arrange.test.ts)

---

## Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| INDEX.md | ✅ Current | 2026-01-19 |
| PLAN-20260119.md | ✅ Current | 2026-01-19 |
| DOD-20260119.md | ✅ Current | 2026-01-19 |
| CONTEXT-20260119.md | ✅ Current | 2026-01-19 |
| COMPLETION-20260119.md | ❌ Not Created | N/A |

---

## Notes

**Key Insight:** Implementation is ~80% complete! Core algorithm and button exist. Just need:
1. Edge case handling
2. Error handling
3. E2E tests
4. Verification

**Critical Path:** E2E tests are REQUIRED per CLAUDE.md "Goals must be verifiable" principle.

**Risk Level:** LOW - Most work already done, just need to verify and test.
