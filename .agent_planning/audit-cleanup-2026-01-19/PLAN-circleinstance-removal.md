# Plan: CircleInstance Deprecation Removal

**Date**: 2026-01-19
**Priority**: P2
**Status**: PLANNED

## Summary

Remove the deprecated `CircleInstance` block. The three-stage architecture (Circle → Array → GridLayout) is the replacement.

## Current State

**Location:** `src/blocks/instance-blocks.ts:152-208`

```typescript
// This block will be removed in P5.
registerBlock({
  type: 'CircleInstance',
  label: 'Circle Instance (DEPRECATED)',
  description: '[DEPRECATED] Use Circle → Array → GridLayout instead',
  ...
});
```

## Known Usages

1. `src/compiler/__tests__/compile.test.ts` - 2 tests use CircleInstance
2. No production demo patches use it (main.ts uses three-stage architecture)

## Replacement Architecture

```
OLD: CircleInstance (count=100, layoutKind='grid', rows=10, cols=10)
     → outputs: position, radius, index, t

NEW: Circle → Array → GridLayout
     Circle       → Signal<float> (radius)
     Array        → Field<float> (count=100), outputs: index, t
     GridLayout   → Field<vec2> (position, rows=10, cols=10)
```

## Implementation Steps

### Step 1: Verify No Other Usages

```bash
grep -r "CircleInstance" --include="*.ts" --include="*.tsx" src/
```

### Step 2: Update Tests
**File:** `src/compiler/__tests__/compile.test.ts`

Before:
```typescript
b.addBlock('CircleInstance', { count: 16, layoutKind: 'grid', rows: 4, cols: 4 });
```

After:
```typescript
const circle = b.addBlock('Circle', { radius: 0.02 });
const array = b.addBlock('Array', { count: 16 });
const layout = b.addBlock('GridLayout', { rows: 4, cols: 4 });
b.wire(circle, 'circle', array, 'element');
b.wire(array, 'elements', layout, 'elements');
```

### Step 3: Run Tests
Verify migrated tests pass.

### Step 4: Remove Block Registration
**File:** `src/blocks/instance-blocks.ts`

Delete lines 145-208 (the CircleInstance registration and its comment).

### Step 5: Clean Up Imports
Check if `DOMAIN_CIRCLE` is still needed after removal.

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/__tests__/compile.test.ts` | Migrate tests |
| `src/blocks/instance-blocks.ts` | Remove CircleInstance |
| `src/core/domain-registry.ts` | Potentially remove DOMAIN_CIRCLE |

## Sequencing

```
1. Grep for all CircleInstance usages
   ↓
2. Migrate each test to three-stage architecture
   ↓
3. Run tests to verify migration
   ↓
4. Remove CircleInstance block
   ↓
5. Run tests to verify removal
   ↓
6. Clean up unused imports/constants
```

## Verification

- [ ] No references to `CircleInstance` in codebase (except docs/archives)
- [ ] All tests pass
- [ ] Demo animations work
- [ ] TypeScript compiles cleanly

## Risks

| Risk | Mitigation |
|------|------------|
| Missed usages | Thorough grep before removal |
| Test breakage | Update tests before removing block |
| Three-stage API differences | Carefully map outputs |
