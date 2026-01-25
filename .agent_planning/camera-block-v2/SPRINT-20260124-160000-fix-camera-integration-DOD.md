# Definition of Done: fix-camera-integration

## Verifiable Criteria

1. `npm run typecheck` exits 0 (zero type errors)
2. `npm run test -- --run` exits 0 (all tests pass, including the 21 currently failing)
3. The `pass2-types.ts` `getPortType()` function handles blocks without `params` gracefully
4. The `level10-golden-tests.test.ts` compiles without missing type references
5. Camera block's `cameraProjection` payload type works with generic block resolution (Const block can produce cameraProjection values)
6. No new test files or workaround shims introduced - only fix the existing code
