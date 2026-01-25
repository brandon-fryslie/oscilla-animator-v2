# Sprint: Mock and Stub Patterns

**Generated:** 2026-01-25T13:24:00Z
**Confidence:** HIGH: 1, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Estimated effort:** 30 minutes

## Sprint Goal

Address ~20 'as any' casts in mock/stub patterns by using proper test utilities and documenting acceptable fallbacks.

## Scope

**Deliverables:**
- Replace appropriate mock casts with `vi.fn()` with proper generics
- Create or use test factory functions for mock objects
- Document acceptable cases (e.g., browser APIs with no alternative)
- Eliminate unnecessary casts while acknowledging technical debt items

**Files affected:**
- `src/__tests__/DebugMiniView.test.tsx`
- `src/__tests__/Sparkline.test.tsx`
- `src/__tests__/stroke-rendering.test.ts`
- `src/__tests__/continuity-integration.test.ts`

## Work Items

### P0: Replace function mocks with typed vi.fn()
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Identify all function mocks using `as any`
- [ ] Replace with `vi.fn<[Args], ReturnType>()`
- [ ] Verify mock types match expected signatures
- [ ] Tests pass without regression

**Technical Notes:**
- Vitest's `vi.fn()` supports generic types: `vi.fn<[ArgType1, ArgType2], ReturnType>()`
- This provides type safety for mock assertions
- Better than `as any` - catches incorrect mock usage at compile time

### P1: Create/use test factory functions for object mocks
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Audit object mocks to determine if factories would help
- [ ] Create test factories for complex mock objects (or reuse existing)
- [ ] Replace object `as any` casts with factory calls
- [ ] Tests pass without regression

**Technical Notes:**
- Many tests mock interfaces with only partial properties
- Factory functions ensure consistent, properly-typed mock objects
- Consider creating `src/__tests__/factories/` directory for test utilities

### P2: Document acceptable technical debt
**Confidence:** HIGH
**Acceptance Criteria:**
- [ ] Identify casts that cannot be removed (browser APIs, etc.)
- [ ] Add inline comments explaining why cast is necessary
- [ ] Create summary of known limitations
- [ ] All viable casts have been replaced

**Technical Notes:**
- Some browser APIs (Canvas, DOM) have incomplete TypeScript definitions
- These may legitimately require `as any` or type assertion
- Document with rationale so future maintainers understand context

## Dependencies

- None - mock patterns are test-specific

## Risks

- **Low:** Function mocks with proper types are simpler and safer
- **Medium:** May expose missing test utility types
- **Mitigation:** Create factories as needed during implementation

## Implementation Sequence

1. Audit each file to categorize mock patterns
2. Replace function mocks with `vi.fn<Args, Return>()`
3. Create/use test factories for object mocks
4. Document any remaining casts with rationale
5. Run affected tests to verify correctness
