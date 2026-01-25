# Sprint: React & Mock Utilities - Props and Canvas contexts
**Generated:** 2026-01-25T07:30:32Z
**Status:** READY FOR IMPLEMENTATION
**Confidence:** HIGH: 2, MEDIUM: 0, LOW: 0
**Expected Effort:** 45 minutes

## Sprint Goal
Remove 15 'as any' casts by creating type-safe helpers for React element props and mock canvas contexts.

## Scope
**Deliverables:**
- Fix React element props access (11 instances)
- Create and use mock canvas context helper (4 instances)

## Work Items

### Item 1: React element props access (11 instances)
**Files affected:** ValueRenderer.test.ts and related component tests
**Pattern:** `(el.props as any)['data-renderer']` for data attribute access

**Technical approach:**
Option A (Recommended): Create typed test helper in shared test utils
```typescript
function getDataAttr(element: ReactTestUtils.ReactElement, attrName: string): string | undefined {
  return (element.props as Record<string, unknown>)[`data-${attrName}`] as string | undefined;
}
```

Option B: Use casting only where needed
```typescript
(el.props as Record<string, unknown>)['data-renderer']
```

**Recommendation:** Use Option A - creates reusable helper, reduces noise in tests.

**Acceptance Criteria:**
- [ ] Test helper `getDataAttr()` created (or uses existing equivalent)
- [ ] All 11 instances in ValueRenderer.test.ts replaced
- [ ] All component tests using data attribute access updated
- [ ] Tests pass with no behavior changes
- [ ] No remaining 'as any' for props access

### Item 2: Mock canvas context helper (4 instances)
**Files affected:** continuity-integration.test.ts, stroke-rendering.test.ts, DebugMiniView.test.tsx, Sparkline.test.tsx
**Pattern:** `(ctx.fill as any).mockImplementation()` and `getContext = vi.fn(() => mockCtx) as any`

**Technical approach:**
Create shared test utility `createMockCanvas2DContext()`:
```typescript
export function createMockCanvas2DContext(): CanvasRenderingContext2D {
  return {
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    // ... other needed methods
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    // ... other properties
  } as unknown as CanvasRenderingContext2D;
}
```

Then use consistently across all 4 files:
```typescript
const mockCtx = createMockCanvas2DContext();
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx);
```

**Acceptance Criteria:**
- [ ] Shared test utility created (src/runtime/__tests__/test-utils.ts or similar)
- [ ] `createMockCanvas2DContext()` implemented with necessary methods/properties
- [ ] All 4 test files updated to use the helper
- [ ] Tests pass and canvas operations can be verified via mock calls
- [ ] No remaining 'as any' for canvas context

## Dependencies
- None between items, but shared test utility files should be created first if they don't exist

## Risks
- **Risk:** Missing canvas methods that tests actually use
  - **Mitigation:** Implement only methods accessed in tests, add more as needed
  - **Mitigation:** Keep vi.fn() return type flexible for untested methods

- **Risk:** Test utils file location/naming conflict
  - **Mitigation:** Check existing test utils before creating new file

## Implementation Notes
Both helpers are reusable across tests and should reduce boilerplate in the future. The canvas helper should start minimal (only methods used in the 4 affected files) and grow as needed.
