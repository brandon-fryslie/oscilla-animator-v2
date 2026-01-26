# Sprint: Stride Architecture Debt - Remove Duplicates & Unify to Source of Truth

**Generated:** 2026-01-26
**Confidence:** HIGH: 1, MEDIUM: 1, LOW: 0
**Status:** PARTIALLY READY

## Sprint Goal

Eliminate duplicate switch statement logic for stride computation and ensure all stride-based buffer operations derive from the canonical `strideOf()` function in `src/core/canonical-types.ts`. Maintain ONE SOURCE OF TRUTH for stride across the codebase.

## Scope

**Deliverables:**
1. Remove duplicate stride switch statements in IRBuilderImpl.ts
2. Refactor renderer stride-based buffer operations to use `strideOf()`
3. Ensure all stride information flows from payload type, not hardcoded constants

## Work Items

### P0: Remove Duplicate Switch Statements in IRBuilderImpl.ts
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] IRBuilderImpl.ts lines 498-519 replaced with call to `strideOf(type.payload)`
- [ ] IRBuilderImpl.ts lines 559-579 replaced with call to `strideOf(type.payload)`
- [ ] No fallback to `stride = 1` or other defaults
- [ ] All existing tests pass
- [ ] Type safety maintained (no `any` casts)

**Technical Notes:**
- Simple direct refactoring: extract the switch logic into a reusable function or use existing `strideOf()`
- No behavioral changes, purely structural
- Tests should remain green since logic is identical

**File:** `src/compiler/ir/IRBuilderImpl.ts`

---

### P1: Refactor Renderer Stride Operations to Use Type-Driven Stride
**Confidence:** MEDIUM
**Acceptance Criteria:**
- [ ] Identify all hardcoded stride multipliers in Canvas2DRenderer.ts (40+ instances)
- [ ] Identify all hardcoded stride multipliers in SVGRenderer.ts
- [ ] Identify all hardcoded stride multipliers in RenderAssembler.ts
- [ ] Determine how renderers receive buffer type information (or what metadata they have access to)
- [ ] Refactor to look up stride from `strideOf(payloadType)` instead of hardcoding
- [ ] All tests pass
- [ ] No constants like `STRIDE_POSITION = 2` introduced (stride must be computed, not stored)

**Technical Notes:**
- **CRITICAL:** Stride must ALWAYS come from `strideOf(payloadType)`, never hardcoded as constants
- Renderers must know the payload type of each buffer they process
- Current implementation may assume stride based on semantic labels; this assumption must be validated
- If type information is unavailable at render time, RenderAssembler must attach stride metadata to buffers

**Unknowns to Resolve:**
1. How does RenderAssembler know the type/stride of position, color, scale2 buffers?
2. Is type information available at render time, or must buffers carry stride metadata?
3. What's the data contract between compilation and rendering?

**Exit Criteria:**
- [ ] Type information chain from compile → render is documented
- [ ] Stride lookup pattern is consistent across all renderers
- [ ] Implementation avoids hardcoded stride values

**Files:**
- `src/render/canvas/Canvas2DRenderer.ts`
- `src/render/svg/SVGRenderer.ts`
- `src/runtime/RenderAssembler.ts`

---

## Dependencies
- No external dependencies; work is self-contained
- P0 should complete before P1 to establish the pattern

## Risks
1. **Type information availability at render time** - If renderers don't have access to buffer types, this requires architectural change
2. **Behavioral equivalence** - Must ensure stride computation is identical to hardcoded values (test coverage critical)
3. **Performance** - Function calls instead of literals; must verify no regression (unlikely but should profile)

## Implementation Notes

**For P0 (HIGH confidence):**
- Direct refactoring, no unknowns
- Ready for implementation immediately

**For P1 (MEDIUM confidence):**
- Requires understanding how type information flows to renderers
- May need to resolve "how do renderers know buffer stride?" before implementation
- Suggest: investigate RenderAssembler's interface with renderers first
- Then either:
  - A) Pass stride metadata with buffers, or
  - B) Pass payload type and look up stride at render time
- Once pattern is clear, refactoring is straightforward

## Notes
- ContinuityApply.ts:321 (semantic-based stride heuristic) is NOT included in this sprint - handled separately
- BufferPool.ts stride logic is NOT included - lower priority, can be tackled later
- Test assertions with hardcoded stride (e.g., `expect(length).toBe(100 * 2)`) are also lower priority
