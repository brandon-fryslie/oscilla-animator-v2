# Sprint: foundation - Type System Foundation Cleanup
Generated: 2026-01-28-192541
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-28-191553.md

## Sprint Goal
Remove poisonous placeholders, fix naming inconsistencies, and establish core/ids.ts as THE source of truth for branded IDs — unblocking all downstream sprints.

## Scope
**Deliverables:**
- Delete FieldExprArray (no semantics, no runtime backing)
- Rename reduce_field → reduceField (17 occurrences)
- Create core/ids.ts with InstanceId/DomainTypeId migration from Indices.ts

**No Dependencies**: All items can start immediately.

## Work Items

### P0 (Critical): C-7 - Delete FieldExprArray

**Dependencies**: None
**Spec Reference**: 15-FiveAxesTypeSystem-Conclusion.md:143 • **Status Reference**: EVALUATION-2026-01-28-191553.md:190-208

#### Description
Remove FieldExprArray from the type system. This node has no defined semantics: no backing store (no StateSlotId reference), no lifetime rules (when is it created/destroyed?), no runtime storage contract (what allocates the array?). It exists only as a placeholder in the FieldExpr union but is never constructed. Per the spec: "Delete until it has concrete backing store, lifetime rules, and runtime storage contract."

**Current State**:
- Defined in `src/compiler/ir/types.ts:285-289`
- Referenced in FieldExpr union at line 218
- 12 total matches in codebase (all planning docs or unused definitions)
- Zero production usage found by grep

#### Acceptance Criteria (REQUIRED)
- [ ] FieldExprArray interface deleted from src/compiler/ir/types.ts:285-289
- [ ] FieldExprArray removed from FieldExpr union type at line 218
- [ ] All tests pass (no test failures related to FieldExprArray)
- [ ] TypeScript compilation succeeds with no FieldExprArray references
- [ ] Zero matches for "FieldExprArray" in src/ directory (excluding comments documenting removal)

#### Technical Notes
- Safe deletion: no runtime usage, only exists in type union
- Keep DEFERRED-ms5.12-FieldExprArray.md as documentation of why it was removed
- If future work needs array semantics, it must define: backing store, lifetime, allocator contract

---

### P0 (Critical): C-3 - Rename reduce_field → reduceField

**Dependencies**: None
**Spec Reference**: 10-RulesForNewTypes.md:147 (naming consistency) • **Status Reference**: EVALUATION-2026-01-28-191553.md:108-119

#### Description
Fix naming inconsistency: 'reduce_field' uses snake_case while all other FieldExpr kind literals use camelCase ('map', 'zip', 'zipSig', 'stateRead'). This inconsistency spreads to evaluators, tests, and design docs. Per Rule 4 (15-FiveAxesTypeSystem:147), naming consistency prevents subtle pattern-match bugs and makes migrations cleaner.

**Current State**:
- 17 total occurrences across codebase
- src/compiler/ir/types.ts:167 (kind definition)
- src/runtime (SignalEvaluator usage)
- 11 occurrences in tests
- 3 occurrences in design docs

#### Acceptance Criteria (REQUIRED)
- [ ] src/compiler/ir/types.ts:167 kind literal changed from 'reduce_field' to 'reduceField'
- [ ] All 17 occurrences updated (types, runtime, tests, docs)
- [ ] All tests pass with new naming
- [ ] TypeScript compilation succeeds
- [ ] Zero matches for "reduce_field" in src/ (excluding git history/comments)

#### Technical Notes
- Use grep to find all occurrences: `grep -r "reduce_field" src/`
- Simple find-replace operation
- Tests will catch any missed sites (pattern match failures)
- Update string literals in switch/case statements and type guards

---

### P0 (Critical): C-2 - Create core/ids.ts with Branded IDs

**Dependencies**: None (but UNBLOCKS C-5, C-6)
**Spec Reference**: 00-exhaustive-type-system.md:1-45 • **Status Reference**: EVALUATION-2026-01-28-191553.md:84-105

#### Description
Establish core/ids.ts as THE authoritative source of truth for all branded ID types. Currently InstanceId and DomainTypeId are defined in src/compiler/ir/Indices.ts (line 65-71), creating a module boundary violation: canonical-types.ts (core module) cannot import from Indices.ts (compiler module). This blocks C-5 (getManyInstance needs InstanceId) and C-6 (fix string leakage in Step types).

**Current State**:
- src/core/ids.ts exists with axis var IDs (CardinalityVarId, etc.) but missing InstanceId/DomainTypeId
- src/compiler/ir/Indices.ts:65-71 has InstanceId definition (wrong module)
- src/compiler/ir/types.ts:435 has comment `// InstanceId` indicating intent
- 5 Step types use `instanceId: string` not branded InstanceId (lines 540, 546, 587, 598, 681)

**Spec Contract** (00-exhaustive-type-system.md:1-45):
```typescript
// src/core/ids.ts
export type Brand<K, T extends string> = K & { readonly __brand: T };

export type InstanceId = Brand<string, 'InstanceId'>;
export type DomainTypeId = Brand<string, 'DomainTypeId'>;

export const instanceId = (s: string) => s as InstanceId;
export const domainTypeId = (s: string) => s as DomainTypeId;
```

#### Acceptance Criteria (REQUIRED)
- [ ] InstanceId and DomainTypeId type definitions added to core/ids.ts
- [ ] instanceId() and domainTypeId() factory functions exported from core/ids.ts
- [ ] All imports of InstanceId/DomainTypeId updated to use core/ids.ts (estimate 20 sites)
- [ ] src/compiler/ir/types.ts, canonical-types.ts import from core/ids.ts
- [ ] All tests pass with new import paths
- [ ] TypeScript compilation succeeds
- [ ] Optional: Keep re-exports in Indices.ts for backward compat during migration

#### Technical Notes
- Mechanical refactor, low risk (TypeScript will find all import sites)
- Pattern: `import { InstanceId } from '../compiler/ir/Indices'` → `import { InstanceId } from '../core/ids'`
- May keep compatibility re-exports in Indices.ts: `export { InstanceId, DomainTypeId } from '../../core/ids';`
- Estimate ~20 import sites to update
- Unblocks C-5 (getManyInstance), C-6 (string leakage fix)

---

## Dependencies
None — all three items can be implemented in parallel.

## Risks
- **Low Risk**: All items are mechanical refactors with clear specifications
- **Validation**: TypeScript compiler + existing test suite will catch errors
- **Rollback**: All changes are local to type definitions and imports

---

## Success Criteria
- ✅ FieldExprArray deleted from type system
- ✅ Consistent naming: 'reduceField' everywhere
- ✅ core/ids.ts is THE source of truth for InstanceId/DomainTypeId
- ✅ All tests pass
- ✅ Zero TypeScript compilation errors
- ✅ C-5 and C-6 unblocked (can import InstanceId from core/ids.ts)

---

## Estimated Effort
- C-7 (Delete FieldExprArray): 1 hour
- C-3 (Rename reduce_field): 2 hours  
- C-2 (Create core/ids.ts): 4 hours
**Total: 7 hours**
