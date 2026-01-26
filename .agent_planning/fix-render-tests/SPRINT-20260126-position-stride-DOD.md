# Definition of Done: position-stride

## Acceptance Criteria

### steel-thread.test.ts
1. Position buffer length assertion uses `100 * 2` not `100 * 3`
2. Position validation loop iterates with stride-2 (no z coordinate)
3. Position comparison loop iterates with stride-2
4. Test passes in isolation

### steel-thread-rect.test.ts
1. Position buffer length assertion uses `50 * 2` not `50 * 3`
2. Position validation loop iterates with stride-2 (no z coordinate)
3. Position comparison loop iterates with stride-2
4. Test passes in isolation

### steel-thread-dual-topology.test.ts
1. Ellipse position buffer length assertion uses `25 * 2` not `25 * 3`
2. Rect position buffer length assertion uses `20 * 2` not `20 * 3`
3. Position validation loops iterate with stride-2 (no z coordinate)
4. Position comparison loops iterate with stride-2
5. Test passes in isolation

### Overall
1. No implementation code changes (tests only)
2. All three steel-thread tests pass
3. Full test suite has no new failures (may have pre-existing failures from other categories)

## Verification Commands
```bash
npx vitest run src/compiler/__tests__/steel-thread.test.ts
npx vitest run src/compiler/__tests__/steel-thread-rect.test.ts
npx vitest run src/compiler/__tests__/steel-thread-dual-topology.test.ts
```
