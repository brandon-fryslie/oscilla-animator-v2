# IDE-Style Autocomplete for Expression Editor: Plan Summary

**Generated:** 2026-01-26
**Topic:** IDE-style autocomplete in expression editor
**Overall Status:** 3 sprints planned, HIGH confidence

## Overview

Comprehensive plan for adding IDE-style autocomplete to the Expression Editor. Users can:
- Autocomplete built-in functions (sin, cos, lerp, etc.)
- Autocomplete input variables (in0-in4)
- Autocomplete block references (Circle1, Oscillator, etc.)
- Autocomplete block output ports (Circle1.radius, etc.)

## Feature Behavior

**Triggers:**
- Typing letters/digits → incremental autocomplete for identifier
- Typing `.` after block name → port suggestions
- Ctrl+Space → force show all suggestions

**Display:**
- Dropdown list with type icons
- Keyboard navigation (arrow keys, Enter, Escape)
- Mouse selection (click or hover)
- Smart positioning near cursor in textarea

**Insertion:**
- Functions: `sin(` with cursor inside paren
- Inputs: `in0`
- Blocks: `Circle1.` (trigger port completion)
- Ports: `radius`

## Sprints Planned

### Sprint 1: Suggestion Provider Service [READY FOR IMPLEMENTATION]
**Confidence:** HIGH: 4, MEDIUM: 0, LOW: 0
**Effort:** 1 sprint
**Deliverables:**
- Suggestion data types (function, input, block, port)
- Export function signatures from Expression DSL
- SuggestionProvider service class
- Fuzzy filtering algorithm
- Comprehensive unit tests

**Files:**
- `SPRINT-20260126-030000-suggestion-provider-PLAN.md`
- `SPRINT-20260126-030000-suggestion-provider-DOD.md`

**Dependencies:** Sprint 3 (completed), Canonical Addressing (completed)

---

### Sprint 2: Autocomplete Component [READY FOR IMPLEMENTATION]
**Confidence:** HIGH: 3, MEDIUM: 1, LOW: 0
**Effort:** 1 sprint
**Deliverables:**
- AutocompleteDropdown React component
- Keyboard navigation
- Mouse interaction
- Cursor position calculation (measurement div technique)
- Suggestion rendering with type icons
- Component tests

**Files:**
- `SPRINT-20260126-040000-autocomplete-component-PLAN.md`
- `SPRINT-20260126-040000-autocomplete-component-DOD.md`

**Dependencies:** Sprint 1 (SuggestionProvider)

---

### Sprint 3: Integration [PARTIALLY READY]
**Confidence:** HIGH: 2, MEDIUM: 2, LOW: 0
**Effort:** 1-2 sprints (may extend based on context complexity)
**Deliverables:**
- Hook autocomplete into ExpressionEditor
- Context-aware trigger detection
- Smart suggestion insertion
- Keystroke handling
- Integration tests

**Files:**
- `SPRINT-20260126-050000-integration-PLAN.md`
- `SPRINT-20260126-050000-integration-DOD.md`

**Dependencies:** Sprint 1 & 2

## Technical Approach

**Why Custom Dropdown (not Monaco/CodeMirror):**
- Expression DSL is simple (no syntax highlighting needed)
- Avoids 150KB-2MB bundle bloat
- Full control over dark theme integration
- Simpler learning curve and maintenance

**Data Flow:**
```
User types in textarea
    ↓
Extract cursor position & identifier prefix
    ↓
SuggestionProvider.filterSuggestions(prefix)
    ↓
AutocompleteDropdown displays results
    ↓
User selects suggestion (keyboard or mouse)
    ↓
Insert suggestion into textarea
```

**Key Architecture Decisions:**
1. SuggestionProvider is a pure service (no UI coupling)
2. AutocompleteDropdown is a controlled component
3. ExpressionEditor manages state and integration
4. Context detection via backward scanning from cursor
5. All suggestion data immutable

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Cursor position calculation complex | Medium | Use well-tested measurement div pattern |
| Context detection edge cases | Medium | Comprehensive unit tests, clear state machine |
| Performance with many blocks | Low | No more than 100 total items expected |
| Keyboard capture conflicts | Low | Careful event delegation, stop propagation |
| User confusion with context | Low | Visual feedback (different suggestions) |

## Success Criteria

- ✅ Users can autocomplete functions by typing "si" → see "sin(", "asin("
- ✅ Users can autocomplete inputs by typing "in" → see "in0", "in1", etc.
- ✅ Users can autocomplete blocks by typing block name
- ✅ Users can autocomplete ports by typing "Block." → see port suggestions
- ✅ Dropdown appears/disappears contextually
- ✅ Keyboard navigation is smooth and intuitive
- ✅ All tests pass
- ✅ No performance degradation

## Timeline Estimate

- Sprint 1: Low complexity, clear requirements → 1 sprint
- Sprint 2: Medium complexity, cursor positioning → 1 sprint
- Sprint 3: High complexity, context detection → 1-2 sprints

**Total: 3-4 sprints** (but can do in parallel after Sprint 1)

## Next Steps

1. **Immediate:** Review and approve this plan
2. **Sprint 1:** Implement SuggestionProvider service
3. **Sprint 2:** Implement AutocompleteDropdown component
4. **Sprint 3:** Integrate into ExpressionEditor
5. **Testing:** Full integration tests and user feedback

## Questions?

- Should autocomplete be optional (settings)? → Defer to future
- Should we support custom functions? → Defer to future
- Should we highlight matching characters in suggestions? → Can add in Sprint 2
- Should we show function signatures in detail? → Yes, in Sprint 1 descriptions

---

**Status:** Ready for approval and implementation
**Created by:** do:do-plan
**Date:** 2026-01-26 03:00 UTC
