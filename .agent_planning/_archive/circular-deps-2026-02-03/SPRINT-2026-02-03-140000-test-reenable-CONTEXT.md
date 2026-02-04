# Implementation Context: test-reenable
Generated: 2026-02-03-140000
Source: EVALUATION-2026-02-03-131723.md

## File Changes

### src/patch-dsl/__tests__/composite-roundtrip.test.ts

**Lines to delete (524-526):**
```typescript
// SKIP: Store Integration tests cause heap exhaustion due to circular dependency
// between blocks/registry -> compiler modules -> stores
// TODO: Fix circular dependencies or move these tests to a separate file
```

**Line to modify (527):**
```typescript
// FROM:
describe.skip('Store Integration', () => {
// TO:
describe('Store Integration', () => {
```

No other files need changes.

## Verification Commands

```bash
# Run the specific test file
npx vitest run src/patch-dsl/__tests__/composite-roundtrip.test.ts

# Expected: 30 passed, 0 skipped

# Run full test suite to confirm no regressions
npm run test

# Expected: total skipped count decreases by 3
```

## Adjacent Pattern Reference
The 3 tests being re-enabled already follow the correct dynamic import pattern:
```typescript
const { CompositeEditorStore } = await import('../../stores/CompositeEditorStore');
```
This pattern is also used in `src/stores/__tests__/integration.test.ts` (11 tests, all passing).
