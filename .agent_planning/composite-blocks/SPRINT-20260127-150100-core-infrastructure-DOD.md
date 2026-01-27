# Definition of Done: Core Infrastructure Sprint
Generated: 2026-01-27T15:01:00Z

## Functional Criteria

### Types & Registry
- [ ] `CompositeBlockDef` type is complete and exported
- [ ] `BlockForm` includes 'composite'
- [ ] `registerBlock()` accepts composite definitions
- [ ] Type guards `isComposite()` and `isCompositeBlockDef()` work correctly

### Expansion Pass
- [ ] Pass0 runs before pass1 (default-sources)
- [ ] Simple composite (2 internal blocks, 1 edge) expands correctly
- [ ] Complex composite (5+ blocks, multiple edges) expands correctly
- [ ] Nested composite (composite containing composite) expands correctly
- [ ] All expanded blocks have `role.kind === 'derived'`
- [ ] All expanded blocks have stable, deterministic IDs

### Port Mapping
- [ ] Exposed input ports receive external connections
- [ ] Exposed output ports provide external connections
- [ ] Unmapped internal ports are NOT exposed
- [ ] Port types are preserved through expansion

### State Management
- [ ] Internal UnitDelay block has unique state key
- [ ] Internal Lag block has unique state key
- [ ] State keys include composite instance path
- [ ] State persists across hot-swap (same composite def)
- [ ] State resets when composite def changes

### Validation
- [ ] Circular composite → compile error with clear message
- [ ] Missing internal port reference → compile error
- [ ] Nesting > 5 levels → compile error
- [ ] Invalid port mapping → compile error at registration

## Non-Functional Criteria

### Performance
- [ ] Expansion of 10-block composite < 1ms
- [ ] Nested composite (3 levels) expands in single pass

### Code Quality
- [ ] All new code passes TypeScript strict mode
- [ ] No `any` casts without comments
- [ ] All public functions have JSDoc comments
- [ ] No circular imports introduced

### Testing
- [ ] Unit test coverage > 80% for new files
- [ ] Integration test: composite compiles and runs
- [ ] Error case tests for all validation rules

## Verification Steps

1. Create simple composite manually (in test)
2. Run compilation and verify expanded graph
3. Check state keys for internal stateful blocks
4. Modify composite def, verify state resets
5. Create circular composite, verify error
6. Run full test suite with `npm run test`
