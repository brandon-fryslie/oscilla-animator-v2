# Definition of Done: adapter-interface

**Generated:** 2026-01-27-120000
**Status:** READY FOR IMPLEMENTATION
**Plan:** SPRINT-2026-01-27-120000-adapter-interface-PLAN.md

## Acceptance Criteria

### GraphDataAdapter Interface

- [ ] Interface file exists at `src/ui/graphEditor/types.ts`
- [ ] Interface uses generic type parameter for block ID
- [ ] All CRUD operations defined with clear signatures
- [ ] Optional methods use `?` syntax
- [ ] TSDoc comments explain each method's purpose
- [ ] No `any` types used
- [ ] TypeScript compiles without errors

### PatchStoreAdapter

- [ ] Class file exists at `src/ui/graphEditor/PatchStoreAdapter.ts`
- [ ] Implements GraphDataAdapter<BlockId>
- [ ] Unit test file exists at `src/ui/graphEditor/__tests__/PatchStoreAdapter.test.ts`
- [ ] All interface methods implemented and tested
- [ ] MobX observability preserved (test with reaction)
- [ ] LayoutStore integration works correctly
- [ ] Events still emitted through PatchStore

### CompositeStoreAdapter

- [ ] Class file exists at `src/ui/graphEditor/CompositeStoreAdapter.ts`
- [ ] Implements GraphDataAdapter<InternalBlockId>
- [ ] Unit test file exists at `src/ui/graphEditor/__tests__/CompositeStoreAdapter.test.ts`
- [ ] All interface methods implemented and tested
- [ ] Edge ID generation works correctly
- [ ] Position updates work correctly
- [ ] MobX observability preserved

### BlockLike and EdgeLike Types

- [ ] Types defined in `src/ui/graphEditor/types.ts`
- [ ] Types are minimal and store-agnostic
- [ ] Both adapters can produce these types from their store data

### Integration

- [ ] Both adapters can be constructed without errors
- [ ] Both adapters pass type checking
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes with new tests

## Exit Criteria

N/A - This is a HIGH confidence sprint ready for implementation.
