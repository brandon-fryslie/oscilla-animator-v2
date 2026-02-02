# Sprint: sprint3-cleanup - Adapter System Sprint 3 Cleanup & Hardening

Generated: 2026-02-02
Confidence: HIGH: 5, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Fix critical gaps in the existing Sprint 3 implementation: add missing test coverage for Phase 1 lens expansion, fix shallow type matching, remove debug logging, fix doc comment contradictions, and close stale beads.

## Scope

**Deliverables:**
1. Phase 1 (expandExplicitLenses) test coverage
2. Fix typesMatch() shallow comparison in lensUtils.ts
3. Remove debug console.log from lensUtils.ts
4. Fix doc comment contradiction in normalize-adapters.ts
5. Fix broken "Add Adapter" diagnostic action (or remove it)
6. Close stale beads (mtc, update lrc)

## Work Items

### P0: Add Phase 1 (expandExplicitLenses) tests [HIGH]
**Acceptance Criteria:**
- [ ] At least 5 tests that create Patches with InputPort.lenses populated
- [ ] Tests verify lens blocks are created in the normalized graph
- [ ] Tests verify edges are rewired through lens blocks
- [ ] Tests verify multiple lenses on same port expand correctly
- [ ] Tests verify lens expansion handles missing/invalid lens types gracefully

**Technical Notes:**
- Tests go in src/graph/__tests__/pass2-adapters.test.ts (extend existing)
- The expansion function is in src/compiler/frontend/normalize-adapters.ts
- Use existing adapter test patterns as template

### P0: Fix typesMatch() shallow comparison [HIGH]
**Acceptance Criteria:**
- [ ] typesMatch() in lensUtils.ts compares structured unit types, not just unit.kind
- [ ] angle{radians} does NOT match angle{degrees}
- [ ] space{world2} does NOT match space{world3}
- [ ] Test coverage for the fix

**Technical Notes:**
- lensUtils.ts:85-96 currently only checks payload.kind and unit.kind
- Need to use existing unit comparison functions (e.g., unitsEqual from canonical-types)
- This prevents showing incompatible lens suggestions in context menus

### P1: Remove debug console.log [HIGH]
**Acceptance Criteria:**
- [ ] All console.log statements removed from lensUtils.ts (lines ~111, 119, 128)
- [ ] No other debug logging left in lens-related files

### P1: Fix doc comment contradiction [HIGH]
**Acceptance Criteria:**
- [ ] Header comment in normalize-adapters.ts accurately describes what Phase 2 does (auto-insert adapters, not "type validation with no auto-fix")
- [ ] Phase descriptions match actual function names and behavior

### P1: Fix or remove broken diagnostic action [HIGH]
**Acceptance Criteria:**
- [ ] "Add Adapter" action in actionExecutor.ts:229 either works correctly (creates block AND rewires edges) or is removed/disabled
- [ ] No orphan blocks created by diagnostic actions

### P2: Fix JSON.stringify comparison in adapter-spec.ts [MEDIUM]
**Acceptance Criteria:**
- [ ] Structural comparison in adapter-spec.ts:139,191 uses a proper deep-equal or field-by-field comparison instead of JSON.stringify
- [ ] Behavior is unchanged for all existing adapter specs

#### Unknowns to Resolve
- Need to check if property ordering is actually guaranteed by the codebase's object construction patterns. If all objects are constructed with consistent ordering, JSON.stringify may be fine in practice.

#### Exit Criteria
- Verify whether any code path can produce different property orderings for the same logical type. If not, mark as "acceptable tech debt" and move on.

## Dependencies
- None — all work is hardening of existing implementation

## Risks
- Phase 1 tests may reveal bugs in expandExplicitLenses that require fixes
- typesMatch fix may change which lenses appear in context menus (intentional improvement)
