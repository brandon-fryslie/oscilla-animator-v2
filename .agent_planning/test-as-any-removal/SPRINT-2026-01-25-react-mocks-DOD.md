# Definition of Done: Sprint 3 - React & Mock Utilities

**Sprint:** React & Mock Utilities - Props and Canvas contexts
**Generated:** 2026-01-25
**Type:** DOD (Definition of Done)

## Verification Criteria

All of the following must be true for this sprint to be COMPLETE:

### Acceptance Criteria

**Item 1: React element props access (11 instances)**
- [ ] Test helper `getDataAttr()` created (or equivalent method implemented)
- [ ] Helper function exported from shared test utilities location
- [ ] All 11 instances in ValueRenderer.test.ts replaced with `getDataAttr()` calls
- [ ] All other component tests using data attribute access updated
- [ ] Tests execute: `npm run test -- ValueRenderer.test.ts` → PASS
- [ ] Zero remaining `as any` in props access patterns (verify with grep)

**Item 2: Mock canvas context helper (4 instances)**
- [ ] Shared utility `createMockCanvas2DContext()` implemented
- [ ] Helper returns properly-typed mock CanvasRenderingContext2D
- [ ] All necessary methods and properties implemented (at least those used by the 4 test files)
- [ ] Updated files: `continuity-integration.test.ts`, `stroke-rendering.test.ts`, `DebugMiniView.test.tsx`, `Sparkline.test.tsx`
- [ ] All 4 files use the shared helper instead of inline mocks
- [ ] Tests for all 4 files execute without errors
- [ ] Mock canvas methods can be verified via `vi.fn()` calls
- [ ] Zero remaining `as any` in canvas context patterns (verify with grep)

### Code Quality Checks
- [ ] `npm run typecheck` → PASS (no new type errors)
- [ ] All affected test files show zero new compiler warnings
- [ ] Test utilities are well-documented and exported clearly
- [ ] No production code changes (test-only utilities)

### Process Completion
- [ ] All changed files are committed
- [ ] Commit message clearly states: helpers created + files updated + number of casts removed
- [ ] No uncommitted changes remain

## How to Verify

```bash
# Verify helpers exist and are exported
grep -n "export.*getDataAttr" src/runtime/__tests__/test-utils.ts
grep -n "export.*createMockCanvas2DContext" src/runtime/__tests__/test-utils.ts

# Check for remaining 'as any' in React/canvas patterns
grep -rn "props as any" src/__tests__/
grep -rn "ctx.*as any" src/__tests__/

# Run the affected test files
npm run test -- ValueRenderer.test.ts
npm run test -- continuity-integration.test.ts
npm run test -- stroke-rendering.test.ts
npm run test -- DebugMiniView.test.tsx
npm run test -- Sparkline.test.tsx

# Full type check
npm run typecheck
```

If all of these commands succeed and return zero matches for remaining patterns, this sprint is COMPLETE.

## Notes

- This sprint creates two reusable helpers that other tests can benefit from
- Start with `getDataAttr()` as it's simpler, then move to canvas helper
- The canvas helper should be minimal initially (only methods actually used in tests)
- Can be extended in future sprints if new tests need additional canvas methods
- Both helpers reduce boilerplate and make tests more maintainable

## Related Information

**React props pattern:**
```typescript
// Before:
(el.props as any)['data-renderer']

// After:
getDataAttr(el, 'renderer')
```

**Canvas context pattern:**
```typescript
// Before:
const mockCtx = { fill: vi.fn() } as any
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as any

// After:
const mockCtx = createMockCanvas2DContext();
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx);
```
