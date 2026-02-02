# Definition of Done: Pure Scalar Lenses
Generated: 2026-02-01

## Completion Criteria

### All Lens Blocks
- [ ] Each lens block registers with `category: 'lens'`
- [ ] Each lens block has NO `adapterSpec` (never auto-inserted)
- [ ] Each lens block has `capability: 'pure'`, `cardinalityMode: 'preserve'`
- [ ] Each lens block has a working `lower` function
- [ ] Each lens block preserves input type (output type == input type for value shapers)

### Infrastructure
- [ ] `lensUtils.ts` discovers both `'adapter'` and `'lens'` categories
- [ ] `src/blocks/lens/index.ts` exists and is imported from `src/blocks/index.ts`
- [ ] Lens blocks appear in PortContextMenu lens picker

### Tests
- [ ] Unit tests verify each lens's mathematical behavior
- [ ] Tests verify lens blocks are discoverable via `getAvailableLensTypes()`
- [ ] Existing adapter tests still pass unchanged

### Type Safety
- [ ] `npm run typecheck` passes
- [ ] No `any` casts
- [ ] All tests pass: `npm run test`

### Verification
- [ ] Can add a ScaleBias to a port connection via UI (or PatchStore.addLens)
- [ ] Lens expands correctly during Phase 1 normalization
- [ ] Compiled output produces correct values
