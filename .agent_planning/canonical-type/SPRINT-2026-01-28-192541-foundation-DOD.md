# Definition of Done: foundation
Generated: 2026-01-28-192541
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-28-192541-foundation-PLAN.md

## Acceptance Criteria

### C-7: Delete FieldExprArray
- [ ] FieldExprArray interface deleted from src/compiler/ir/types.ts:285-289
- [ ] FieldExprArray removed from FieldExpr union type (types.ts:218)
- [ ] All tests pass (no FieldExprArray-related failures)
- [ ] TypeScript compilation succeeds
- [ ] Zero matches for "FieldExprArray" in src/ directory (grep verification)

### C-3: Rename reduce_field → reduceField
- [ ] src/compiler/ir/types.ts:167 kind literal uses 'reduceField'
- [ ] All 17 occurrences updated (types, runtime, tests, docs)
- [ ] Pattern matches in switch/case statements updated
- [ ] Type guards updated to use 'reduceField'
- [ ] All tests pass with new naming
- [ ] TypeScript compilation succeeds
- [ ] Zero matches for "reduce_field" in src/ (grep verification)

### C-2: Create core/ids.ts with Branded IDs
- [ ] InstanceId type definition exists in src/core/ids.ts
- [ ] DomainTypeId type definition exists in src/core/ids.ts
- [ ] instanceId() factory function exported from core/ids.ts
- [ ] domainTypeId() factory function exported from core/ids.ts
- [ ] src/core/canonical-types.ts imports InstanceId from core/ids.ts
- [ ] src/compiler/ir/types.ts imports InstanceId/DomainTypeId from core/ids.ts
- [ ] All ~20 import sites updated to use core/ids.ts
- [ ] No imports of InstanceId from src/compiler/ir/Indices.ts remain (except optional re-exports)
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

---

## Integration Verification
- [ ] Full test suite passes (`npm test` or equivalent)
- [ ] TypeScript compilation clean (`npm run typecheck` or tsc --noEmit)
- [ ] No console errors or warnings in runtime
- [ ] Git diff shows exactly 3 concerns changed (FieldExprArray, reduce_field, ids.ts)

---

## Unblocking Confirmation
- [ ] C-5 can now import InstanceId from core/ids.ts for getManyInstance implementation
- [ ] C-6 can now replace `instanceId: string` with `instanceId: InstanceId` in Step types
- [ ] No module boundary violations (core does not import compiler)

---

## Documentation
- [ ] DEFERRED-ms5.12-FieldExprArray.md preserved as explanation of removal
- [ ] Git commit messages explain rationale for each change
- [ ] No breaking changes to public APIs (internal refactor only)
