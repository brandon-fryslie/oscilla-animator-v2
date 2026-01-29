# Plan: Unified Inputs Architecture

**Created:** 2026-01-20
**Status:** APPROVED
**Confidence:** HIGH

## Goal

Fold `params` into `inputs`, converting both `inputs` and `outputs` from arrays to Records. This eliminates duplication between params and inputs, enables `uiHint` on any input regardless of port exposure, and creates a cleaner single-source-of-truth architecture.

## Architecture

**Before:**
```typescript
inputs: InputDef[]           // Array with id field
outputs: OutputDef[]         // Array with id field
params: Record<string, unknown>  // Separate, duplicated
```

**After:**
```typescript
inputs: Record<string, InputDef>   // Object, key is id
outputs: Record<string, OutputDef> // Object, key is id
// params removed - folded into inputs
```

**InputDef changes:**
- Remove `id` (now the object key)
- Add `value?: unknown` (default value, was in params)
- Add `exposedAsPort?: boolean` (default true - is this a wirable port?)
- Add `hidden?: boolean` (hide from UI, e.g. normalizer-set values)
- `label` becomes optional (defaults to key)
- `type` becomes optional (required only if exposedAsPort)

**OutputDef changes:**
- Remove `id` (now the object key)
- Add `hidden?: boolean` (for symmetry)
- `label` becomes optional (defaults to key)

## Phases

### Phase 1: Type Definitions
**File:** `src/blocks/registry.ts`

1. Update `InputDef` interface with new fields
2. Update `OutputDef` interface for symmetry
3. Change `BlockDef.inputs` to `Record<string, InputDef>`
4. Change `BlockDef.outputs` to `Record<string, OutputDef>`
5. Remove `BlockDef.params`
6. Update `registerBlock` validation for Record format

### Phase 2: Block Migrations
**Files:** All 14 files in `src/blocks/`

Convert each block registration:
- `inputs` array → object (key = former id)
- `outputs` array → object (key = former id)
- `params` → merge into `inputs` with `exposedAsPort: false`

### Phase 3: Consumer Updates
**Files:** 12 consumer files

Update all code that accesses inputs/outputs:
- `.map()` → `Object.entries().map()`
- `.find(i => i.id === x)` → `[x]`
- `.length` → `Object.keys().length`
- `.some()` → `Object.values().some()`

Key files:
- `src/ui/components/BlockInspector.tsx` (heaviest changes)
- `src/graph/passes/*.ts`
- `src/compiler/passes-v2/*.ts`
- `src/ui/reactFlowEditor/*.ts`
- `src/stores/*.ts`

### Phase 4: Verification

1. `npm run typecheck` - no errors
2. `npm run build` - succeeds
3. `npm run test` - all pass
4. Manual testing:
   - Const block shows slider for `value`
   - Circle block shows slider for `radius`
   - Wiring works correctly
   - Inspector renders all input types

## File List

### Type Definitions (1)
- `src/blocks/registry.ts`

### Block Files (14)
- `src/blocks/array-blocks.ts`
- `src/blocks/color-blocks.ts`
- `src/blocks/field-blocks.ts`
- `src/blocks/field-operations-blocks.ts`
- `src/blocks/geometry-blocks.ts`
- `src/blocks/identity-blocks.ts`
- `src/blocks/instance-blocks.ts`
- `src/blocks/math-blocks.ts`
- `src/blocks/primitive-blocks.ts`
- `src/blocks/render-blocks.ts`
- `src/blocks/signal-blocks.ts`
- `src/blocks/test-blocks.ts`
- `src/blocks/time-blocks.ts`

### Consumer Files (12)
- `src/ui/components/BlockInspector.tsx`
- `src/ui/components/BlockLibrary.tsx`
- `src/ui/components/ConnectionPicker.tsx`
- `src/ui/reactFlowEditor/nodes.ts`
- `src/ui/reactFlowEditor/OscillaNode.tsx`
- `src/ui/reactFlowEditor/typeValidation.ts`
- `src/graph/passes/pass0-polymorphic-types.ts`
- `src/graph/passes/pass1-default-sources.ts`
- `src/graph/passes/pass2-adapters.ts`
- `src/compiler/passes-v2/pass2-types.ts`
- `src/compiler/passes-v2/pass6-block-lowering.ts`
- `src/compiler/passes-v2/resolveWriters.ts`
- `src/stores/PatchStore.ts`
- `src/stores/PortHighlightStore.ts`

## Conversion Patterns

### Block Registration
```typescript
// BEFORE
inputs: [
  { id: 'radius', label: 'Radius', type: canonicalType('float'), defaultValue: 0.02 },
],
outputs: [
  { id: 'circle', label: 'Circle', type: canonicalType('float') },
],
params: { radius: 0.02 },

// AFTER
inputs: {
  radius: { label: 'Radius', type: canonicalType('float'), value: 0.02 },
},
outputs: {
  circle: { label: 'Circle', type: canonicalType('float') },
},
```

### Consumer Code
```typescript
// Iteration
inputs.map(i => ...)  →  Object.entries(inputs).map(([id, def]) => ...)

// Lookup
inputs.find(i => i.id === x)  →  inputs[x]

// Count
inputs.length  →  Object.keys(inputs).length

// Filter to ports only
Object.entries(inputs).filter(([_, d]) => d.exposedAsPort !== false)
```

## Success Criteria

- [ ] TypeScript compiles with no errors
- [ ] Build succeeds
- [ ] All tests pass
- [ ] Const.value renders with slider (1-10000)
- [ ] Circle.radius renders with slider (0.01-0.5)
- [ ] All wiring functionality works
- [ ] Inspector shows correct controls

## Notes

- `exposedAsPort` defaults to `true` for backward compatibility
- `config` in lower functions should be built from `inputs[key].value`
- Object key order is preserved in modern JS (insertion order)
