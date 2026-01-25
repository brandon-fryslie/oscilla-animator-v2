# Definition of Done: unit-inference-refactor

## Verifiable Criteria

1. `npm run typecheck` exits 0
2. `npm run test -- --run` exits 0 (all tests pass)
3. `pass0-polymorphic-types.ts` does NOT set `resolvedUnit` on any block
4. `pass1-type-constraints.ts` uses per-block-instance unit variables (not shared definition IDs)
5. Multiple Const blocks in the same patch can resolve to different units without conflict
6. Unconnected polymorphic ports produce `UnresolvedUnit` error with helpful message
7. The spec constraint "pass0 should only normalize structure" is satisfied
