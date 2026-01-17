# Sprint: Three-Stage Block Architecture - Definition of Done

**Sprint**: threestage
**Created**: 2026-01-17
**Plan Reference**: `SPRINT-20260117-threestage-PLAN.md`

---

## Acceptance Criteria

### P0: IR Builder Methods

- [ ] `FieldExprArray` type exists in `types.ts`
- [ ] `FieldExprLayout` type exists in `types.ts`
- [ ] `FieldExpr` union includes both new types
- [ ] `fieldArray(instanceId, type)` method in IRBuilder interface
- [ ] `fieldArray()` implemented in IRBuilderImpl
- [ ] `fieldLayout(input, layout, type)` method in IRBuilder interface
- [ ] `fieldLayout()` implemented in IRBuilderImpl
- [ ] `npm run typecheck` passes

### P1: Circle Primitive Block

- [ ] `Circle` block registered in `primitive-blocks.ts`
- [ ] Input: `radius` (Signal<float>)
- [ ] Output: `circle` (Signal<circle>) - NOT Field!
- [ ] Cardinality is ONE (signal, not field)
- [ ] Block visible in library under "primitive" category

### P2: Array Block

- [ ] `Array` block registered in `array-blocks.ts`
- [ ] Inputs: `element` (Signal<any>), `count` (Signal<int>), `maxCount` (optional)
- [ ] Outputs: `elements` (Field<same>), `index` (Field<int>), `t` (Field<float>), `active` (Field<bool>)
- [ ] Creates instance via `createInstance()`
- [ ] Uses `fieldArray()` for elements output
- [ ] Uses `fieldIntrinsic()` for index, t, active outputs
- [ ] Sets instance context for downstream blocks

### P3: GridLayout Rewrite

- [ ] GridLayout takes `elements` input (Field<any>)
- [ ] GridLayout takes `rows` and `cols` inputs (Signal<int>)
- [ ] GridLayout outputs `position` (Field<vec2>)
- [ ] Uses `fieldLayout()` internally
- [ ] **NO metadata hack** - no dummy signal with embedded layoutSpec
- [ ] Validates that elements input is a field

### P4: Other Layout Blocks

- [ ] LinearLayout follows same pattern (Field in → Field<vec2> out)
- [ ] No layout blocks output signals with metadata

### P5: CircleInstance Deleted

- [ ] CircleInstance block removed from `instance-blocks.ts`
- [ ] No layout metadata hack code remains
- [ ] `grep -r "CircleInstance" src/` returns only comments/tests

### P6: Tests Updated

- [ ] Steel thread test uses Circle → Array → GridLayout chain
- [ ] Steel thread test passes
- [ ] All other tests pass (except unrelated Hash Block failures)

---

## Overall Success Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm run test` shows ≤3 failures (Hash Block unrelated)
- [ ] Three-stage chain works: `Circle → Array → GridLayout → Render`
- [ ] Rendered output unchanged from before

---

## Verification Commands

```bash
# Types compile
npm run typecheck

# Tests pass (except Hash Block)
npm run test

# No CircleInstance usage (except tests/comments)
grep -r "CircleInstance" src/blocks/

# No layout metadata hack
grep -r "layoutSpec.*metadata" src/

# New blocks exist
grep -r "type: 'Circle'" src/blocks/
grep -r "type: 'Array'" src/blocks/
```

---

## Rollback Plan

If implementation fails:
1. Revert new block files
2. Keep CircleInstance (still functional)
3. Revisit IR design
