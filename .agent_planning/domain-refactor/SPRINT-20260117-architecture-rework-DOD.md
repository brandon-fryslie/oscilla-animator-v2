# Sprint: Architecture Rework - Definition of Done

**Sprint**: architecture-rework
**Created**: 2026-01-17
**Plan Reference**: `SPRINT-20260117-architecture-rework-PLAN.md`

---

## Acceptance Criteria

### P0: Restore Accidentally Deleted Functions

- [ ] `domainRef(id: DomainId): DomainRef` exists in `canonical-types.ts`
- [ ] `worldToAxes(world, domainId?)` exists in `canonical-types.ts`
- [ ] Both functions are exported from `src/types/index.ts`
- [ ] `worldToAxes` tests in `canonical-types.test.ts` pass
- [ ] `domainRef` usage in `bridges.test.ts` works

### P1: Test Status

- [ ] 0 test failures related to missing functions
- [ ] `getBlockCategories` issue resolved (restored or tests deleted)
- [ ] All 275+ existing tests pass

### P2: Three-Stage Blocks Implemented

- [ ] `Circle` block exists with:
  - Input: `radius` (Signal<float>)
  - Output: `circle` (Signal<circle>)

- [ ] `Array` block exists with:
  - Inputs: `element` (Signal<any>), `count` (Signal<int>), `maxCount` (Signal<int>)
  - Outputs: `elements` (Field<T>), `index` (Field<int>), `t` (Field<float>), `active` (Field<bool>)

- [ ] `GridLayout` block exists with:
  - Inputs: `elements` (Field<any>), `rows` (Signal<int>), `cols` (Signal<int>)
  - Output: `position` (Field<vec2>) - NOT a metadata hack

- [ ] Blocks can be chained: `Circle → Array → GridLayout → Render`

### P3: Conflated Block Removed

- [ ] `CircleInstance` block deleted from `instance-blocks.ts`
- [ ] Layout metadata hack code deleted
- [ ] No block outputs layout as dummy signal with metadata

### P4: Old Domain Types Removed

- [ ] `DomainDef` interface deleted from `types.ts`
- [ ] `createDomain()` method removed from IRBuilder
- [ ] `getDomains()` method removed from IRBuilder
- [ ] `domains` map removed from IRBuilderImpl
- [ ] Old domain exports removed from `compiler/index.ts`
- [ ] `grep -r "DomainDef" src/` returns nothing
- [ ] `grep -r "GridDomain" src/` returns nothing

### Overall

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all tests)
- [ ] `npm run build` succeeds
- [ ] Steel-thread example compiles and runs

---

## Verification Commands

```bash
# Restore verification
grep -n "function domainRef" src/core/canonical-types.ts
grep -n "function worldToAxes" src/core/canonical-types.ts

# No old types
grep -r "DomainDef" src/ --include="*.ts"
grep -r "CircleInstance" src/ --include="*.ts"

# All tests pass
npm run test

# TypeScript compiles
npm run typecheck

# Build succeeds
npm run build
```

---

## Rollback Plan

If sprint fails:
1. `git stash` current changes
2. Restore from commit `d5a62eb` (last stable)
3. Re-evaluate approach
