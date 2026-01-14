# Deferred Work: Sprint 2B Phase 1 Questions

**Created:** 2026-01-13 19:56:07
**Source:** work-evaluator INCOMPLETE verdict
**Context:** Sprint 2B Phase 1 (Auto-layout + Minimap) implementation

## Questions Requiring User Input

### Q1: Layout Configuration Requirements
**Priority:** HIGH
**Blocking:** AC1.2 verification (no overlap with reasonable spacing)

**Question:** Should auto-layout use explicit configuration values from the plan?

**Options:**
- A. Use plan values: `direction: 'LR'`, `spacing: [100, 80]`
- B. Use minimum values: `spacing: [50, 40]` (from DOD)
- C. Keep preset defaults (current implementation)

**Current State:** Code uses `ArrangePresets.classic.setup()` with no config - relies on unknown defaults

**Impact:** May not meet acceptance criteria if spacing is insufficient or direction is wrong

---

### Q2: Minimap Styling Requirements
**Priority:** HIGH
**Blocking:** AC2.1 verification (minimap visible in expected location)

**Question:** Is explicit minimap positioning and styling required?

**Plan Specification:**
- Position: top-right corner
- Size: ~180x120px
- Border: 1px solid #444
- Border-radius: 4px
- Background: rgba(0, 0, 0, 0.8)

**Current State:** Plugin initialized with `ratio: 0.2` only - no CSS styling added

**Options:**
- A. Add CSS per plan (full specification)
- B. Use plugin defaults (current implementation)
- C. Partial styling (position only)

**Impact:** Visual appearance may not match design intent

---

### Q3: Manual Testing Requirement
**Priority:** MEDIUM
**Blocking:** Phase 1 completion declaration

**Question:** Can Phase 1 be marked COMPLETE without manual runtime verification?

**Current State:**
- Code analysis: ✅ Implementation looks correct
- TypeScript: ✅ Compiles cleanly
- Unit tests: ✅ Pass
- Runtime testing: ❌ Not performed (no UI testing access)

**Options:**
- A. Require manual verification before COMPLETE
- B. Accept code analysis as sufficient
- C. Require E2E tests first, then manual verification

**Impact:** Determines whether evaluation can pass now or needs user testing

---

### Q4: E2E Test Creation Timeline
**Priority:** MEDIUM
**Blocking:** DOD Feature 5 completion

**Question:** When should E2E tests be created?

**Current State:** No E2E tests exist for Sprint 2B features

**Options:**
- A. Now (before declaring Phase 1 complete)
- B. After all features implemented (Phase 5)
- C. Incrementally (after each phase)

**Impact:** Regression risk if tests are deferred until end

---

## Recommended Answers (work-evaluator opinion)

**Q1:** Option A (use plan values) - Explicit configuration prevents ambiguity and ensures specifications are met

**Q2:** Option A (add CSS per plan) - Design specification exists, should be followed

**Q3:** Option A (require manual verification) - Without runtime testing, cannot confirm functionality actually works

**Q4:** Option C (incremental) - Catch regressions early, build test suite progressively

---

## Next Steps

1. **User decides** on questions above
2. **If Q1=A or Q2=A:** Implementer makes code changes
3. **If Q3=A:** User performs manual testing (or use Playwright/Chrome DevTools)
4. **If Q4=A or C:** Create E2E test files

Once all questions resolved and gaps filled:
- Re-run work-evaluator
- Expect COMPLETE verdict if all criteria met
