# Sprint: doc-alignment - Documentation Alignment

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add minimal spec notes clarifying implementation flexibility (naming conventions, slot types).

## Scope

**Deliverables:**
1. Add spec note about naming conventions (1 sentence)
2. Add spec note about unified ValueSlot approach (2-3 sentences max)

## Work Items

### P0: Add spec note about naming conventions

**File:** Add ADDITIVE note to `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`

**Acceptance Criteria:**
- [ ] Note is 1 sentence
- [ ] Explains that camelCase vs snake_case is NOT prescribed - follow project/language conventions
- [ ] Does NOT modify existing spec text
- [ ] Placed in appropriate section (IR types or schedule)

### P1: Add spec note about ValueSlot

**File:** Add ADDITIVE note to `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md`

**Acceptance Criteria:**
- [ ] Note is 2-3 sentences max
- [ ] Explains that implementation uses unified ValueSlot with metadata
- [ ] Does NOT modify existing spec text
- [ ] Placed in appropriate section (slot types)

## Dependencies

- None

## Risks

- Low risk - documentation only, no code changes
