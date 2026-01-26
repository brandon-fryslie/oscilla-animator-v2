# Definition of Done: Stride Architecture Debt Sprint

## P0: Remove Duplicate Switch Statements
**Status:** READY FOR IMPLEMENTATION

### Code Changes
- [ ] IRBuilderImpl.ts line 498-519: Replace with `strideOf()` call
- [ ] IRBuilderImpl.ts line 559-579: Replace with `strideOf()` call
- [ ] No new switch statements on payload type introduced
- [ ] Code review: verify no fallback defaults or `any` casts

### Testing
- [ ] All existing unit tests pass (`npm run test`)
- [ ] No new test coverage needed (logic unchanged, structure changed)
- [ ] Build succeeds (`npm run build`)
- [ ] Type checking passes (`npm run typecheck`)

### Documentation
- [ ] Code changes are self-documenting (call to `strideOf()` is clear)
- [ ] No new comments needed

### Acceptance
- [ ] Diff shows only function call changes, no logic changes
- [ ] Code is more maintainable (DRY principle applied)

---

## P1: Refactor Renderer Stride Operations
**Status:** PARTIALLY READY (requires research first)

### Pre-Implementation Investigation
**MUST COMPLETE BEFORE CODING:**
- [ ] Trace data flow: RenderAssembler → Canvas2DRenderer/SVGRenderer
- [ ] Document: What type information (if any) does RenderAssembler have about position, color, scale2 buffers?
- [ ] Document: What metadata is attached to buffers when passed to renderers?
- [ ] Determine: Is stride information available at render time?
- [ ] Decision: Will stride come from (A) buffer metadata or (B) payload type lookup?

### Code Changes (once decision made)
- [ ] Canvas2DRenderer.ts: Replace all hardcoded multipliers with `strideOf(type.payload)` or buffer stride metadata
- [ ] SVGRenderer.ts: Replace all hardcoded multipliers with stride lookup
- [ ] RenderAssembler.ts: Replace all hardcoded multipliers with stride lookup
- [ ] No `STRIDE_POSITION`, `STRIDE_COLOR`, or other hardcoded constants introduced
- [ ] All stride derives from `strideOf()`, never invented

### Testing
- [ ] All existing render tests pass (`npm run test`)
- [ ] Visual regression testing: rendered output is pixel-identical
- [ ] Type safety: no `any` casts without justification
- [ ] Build succeeds with no warnings

### Code Review
- [ ] Stride lookup pattern is consistent across all three renderers
- [ ] No hardcoded stride assumptions remain
- [ ] Diff shows stride now flows from type system

### Verification
- [ ] Stride values match hardcoded values in original code (validate equivalence)
- [ ] Performance impact acceptable (if any function call overhead, must be negligible)

---

## Exit Criteria

**P0 Complete when:**
- All duplicated switch statements are replaced with `strideOf()` calls
- Tests pass
- Code is simpler and more maintainable

**P1 Complete when:**
- Type information chain is documented and clear
- Stride at render time comes from `strideOf()` or metadata, never hardcoded
- All renderers follow same pattern
- Tests pass
- Visual output unchanged (regression testing)

---

## Rollback Plan

If issues arise:
1. **P0:** Simple revert - switch back to switch statements (not expected)
2. **P1:** Revert renderer changes if visual regression occurs; investigate type information flow more carefully

---

## Notes

- No performance regressions expected (function call overhead is minimal)
- Changes are strictly refactoring; no behavior should change
- Stride values must be validated against original hardcoded values
