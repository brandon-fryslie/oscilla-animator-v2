# Sprint: Domain-Cleanup - Complete Domain→Instance Migration

**Generated**: 2026-01-19
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Remove all deprecated Domain-system code (`fieldSource()`, `DomainId`, `fillBufferSource()`) after migrating the single test file that still uses them.

## Scope

**Deliverables:**
1. Migrated `instance-unification.test.ts` to use instance-based APIs
2. Removed deprecated IRBuilder methods (`fieldSource`, `fieldIndex`)
3. Removed legacy Materializer path (`case 'source'`, `fillBufferSource`)
4. Removed deprecated types (`DomainId`, `domainId()` factory in IR layer)

## Work Items

### P0: Migrate instance-unification.test.ts

**File:** `src/compiler/__tests__/instance-unification.test.ts`

**Acceptance Criteria:**
- [ ] All tests use `fieldIntrinsic()` instead of `fieldSource()`
- [ ] Tests no longer import `domainId` from Indices
- [ ] Domain unification logic still validated via `inferFieldDomain()` (it returns InstanceId now)
- [ ] All tests pass

**Technical Notes:**
The tests validate that `inferFieldDomain()` correctly tracks field domains through composition. The concept maps to instances now:
- Old: `fieldSource(domainId('domain_0'), 'index', type)` → domain propagation
- New: `fieldIntrinsic(instanceId, 'index', type)` → instance propagation

The key insight: `inferFieldDomain()` should be renamed/repurposed to track *instances* not domains. However, for this sprint, we can simply update the tests to use the new API and verify the existing unification logic still works.

**Migration Pattern:**
```typescript
// OLD:
const domain = domainId('domain_0');
const type = signalTypeField('float', domain);
const field = b.fieldSource(domain, 'index', type);
expect(b.inferFieldDomain(field)).toBe(domain);

// NEW:
const instanceId = b.createInstance(DOMAIN_CIRCLE, 10, { kind: 'unordered' });
const type = signalTypeField('float', instanceId);  // Type still needs domain? Check this
const field = b.fieldIntrinsic(instanceId, 'index', type);
// inferFieldDomain returns undefined for intrinsics (they're instance-based)
// The unification tests may need significant restructuring
```

**Alternative approach:** These tests may need to test instance-level unification instead of domain-level. Review what behavior we actually want to preserve.

### P1: Remove fieldSource() and fieldIndex() from IRBuilderImpl

**File:** `src/compiler/ir/IRBuilderImpl.ts`

**Acceptance Criteria:**
- [ ] `fieldSource()` method removed (lines 188-200)
- [ ] `fieldIndex()` method removed (lines 301-305)
- [ ] No imports of `DomainId` needed in IRBuilderImpl
- [ ] TypeScript compiles without errors

**Technical Notes:**
- Both methods are already marked `@deprecated`
- After test migration, these should have no callers
- Remove the import: `DomainId` from `./Indices`
- Remove the import: `domainId` factory from `./Indices`

### P2: Remove fillBufferSource() from Materializer

**File:** `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] `case 'source'` block removed from fillBuffer (lines 141-145)
- [ ] `fillBufferSource()` function removed (lines 425-493)
- [ ] Exhaustive switch still valid (only handles non-deprecated cases)
- [ ] All runtime tests pass

**Technical Notes:**
- The `case 'source'` is currently the only caller of `fillBufferSource()`
- After removing `fieldSource()` from IRBuilder, no IR should use `kind: 'source'`
- The exhaustive switch will need adjustment - may need to keep `case 'source'` as unreachable code check temporarily, then remove

### P3: Remove DomainId type from IR layer

**Files:**
- `src/compiler/ir/Indices.ts`
- `src/compiler/ir/types.ts`

**Acceptance Criteria:**
- [ ] `DomainId` type removed from Indices.ts (lines 57-61)
- [ ] `domainId()` factory removed from Indices.ts (lines 132-137)
- [ ] Exports updated in types.ts to not re-export DomainId
- [ ] TypeScript compiles without errors

**Technical Notes:**
- Check that no other files import `DomainId` from Indices
- The graph-layer `domainId` field on blocks is a **different concept** - user-facing block configuration. Do NOT remove that.
- grep confirms: `DomainId` is used in `FieldExprSource`, `FieldExprMapIndexed`, `FieldExprMap.domain`, `FieldExprZip.domain`, `FieldExprZipSig.domain`

### P4: Clean up FieldExpr types

**File:** `src/compiler/ir/types.ts`

**Acceptance Criteria:**
- [ ] `FieldExprSource` type either removed or marked deprecated with clear comment
- [ ] `FieldExprMapIndexed` - review if it uses deprecated DomainId
- [ ] Domain fields on `FieldExprMap`, `FieldExprZip`, `FieldExprZipSig` reviewed
- [ ] TypeScript compiles without errors

**Technical Notes:**
The `domain` field on map/zip types is used by `inferFieldDomain()`. Review whether this should become `instanceId` or be removed entirely. This may be deferred if it requires significant refactoring.

## Dependencies

- Tests must be migrated (P0) before deprecated methods can be removed (P1)
- IRBuilder cleanup (P1) must complete before Materializer cleanup (P2)
- All code changes (P1, P2) must complete before type removal (P3, P4)

## Execution Order

```
P0: Migrate tests
    ↓
P1: Remove IRBuilder methods
    ↓
P2: Remove Materializer legacy path
    ↓
P3: Remove DomainId type
    ↓
P4: Clean up FieldExpr types
```

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tests test invalid concept | Medium | Review test purpose, may need to test instance unification instead |
| inferFieldDomain still needed | Medium | Keep the function, just remove domain-based inputs |
| Hidden DomainId usages | Low | Comprehensive grep before removal |

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] grep for `domainId\(` shows only graph-layer usages
- [ ] grep for `fieldSource\(` shows no hits
- [ ] grep for `fillBufferSource` shows no hits
- [ ] Animation demos run correctly
