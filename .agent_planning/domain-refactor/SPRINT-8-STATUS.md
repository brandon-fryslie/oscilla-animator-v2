# Sprint 8: Final Cleanup - Status

## Completed ✓

1. **Cardinality Update** - Already done in previous session
   - `Cardinality.many` now uses `instance: InstanceRef` instead of `domain: DomainRef`
   - `cardinalityMany()` factory updated
   - Helper functions updated (`worldToAxes`, `signalTypeField`, etc.)

2. **Type Exports Updated**
   - `src/types/index.ts` updated to export new types
   - Added `worldToAxes` export
   - Aliased IR types to avoid conflicts

3. **Compiler Fixes**
   - `src/compiler/ir/patches.ts` - Uses `InstanceRef` instead of `DomainRef`
   - `src/compiler/passes-v2/pass2-types.ts` - Uses `instance` property for type checking
   - `src/runtime/ScheduleExecutor.ts` - Fixed `InstanceId` import

4. **Build Status**
   - ✓ TypeScript compilation passes
   - ✓ 249 out of 252 tests passing (3 failures are unrelated)

## Remaining Work

### Phase 1: Delete DomainDef from IR Types
- [ ] Delete `DomainDef` interface from `src/compiler/ir/types.ts` (lines 292-301)
- [ ] Delete `defineDomain()` method from `IRBuilder.ts`
- [ ] Delete `getDomains()` method from `IRBuilder.ts`
- [ ] Delete `domains` map from `IRBuilderImpl.ts`
- [ ] Update `compiler/index.ts` exports to remove `DomainDef`

### Phase 2: Verification
- [ ] Run `npm run typecheck` - must pass
- [ ] Run `npm run build` - must succeed
- [ ] Run `npm test` - existing passing tests must still pass
- [ ] Grep for old types - should return nothing:
  ```bash
  grep -r "DomainDef" src/ --include="*.ts" | grep -v "test.ts"
  grep -r "defineDomain" src/ --include="*.ts"
  grep -r "\.domains\." src/ --include="*.ts"
  ```

### Phase 3: Create Completion Doc
- [ ] Create `.agent_planning/domain-refactor/COMPLETION-20260117.md`
- [ ] Document all 8 sprints completed
- [ ] Include verification results
- [ ] List all commits made
- [ ] Add migration guide summary

## Test Failures (Not Blocking)

The following tests are failing but are NOT related to the domain refactor:

1. **Hash Block tests** (2 failures)
   - `different seeds produce different results` - hash implementation issue
   - `output is always in [0, 1) range` - hash implementation issue
   - These existed before Sprint 8

2. **Steel Thread test** (1 failure) 
   - `RenderInstances2D requires field inputs with instance context`
   - This is due to architectural mismatch noted in `REWORK-NEEDED.md`
   - The three-stage architecture needs to be implemented (future work)
   - This is NOT a regression from Sprint 8

## Next Steps

Complete Phases 1-3 above to finish Sprint 8.
