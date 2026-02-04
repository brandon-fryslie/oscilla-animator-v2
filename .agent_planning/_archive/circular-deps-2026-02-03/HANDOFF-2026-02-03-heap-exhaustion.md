# Handoff: Heap Exhaustion in CompositeEditorStore Integration Tests

## Status: ROOT CAUSE NARROWED — Fix Not Yet Implemented

## The Problem

3 tests in `src/patch-dsl/__tests__/composite-store-integration.test.ts` are skipped because they cause heap exhaustion (OOM crash) in Vitest worker processes.

## Critical Finding: This Is an Infinite Loop, NOT Memory Exhaustion

**Key evidence**: Even with `--max-old-space-size=8192` (8GB heap), the crash occurs with:
```
Fatal JavaScript invalid size error 169220804 (see crbug.com/1201626)
```
This is V8's `Runtime_GrowArrayElements` trying to grow an array to **169 million elements**. This is an unbounded loop, not a "too much stuff loaded" problem.

## Reproduction

### Minimal OOM reproduction (single file, in isolation):
```typescript
// src/patch-dsl/__tests__/_heap-repro.test.ts
import { describe, it, expect } from 'vitest';
import { serializeCompositeToHCL } from '../composite-serialize';
import { SmoothNoiseComposite } from '../../blocks/composites/library';
import { CompositeEditorStore } from '../../stores/CompositeEditorStore';

describe('Store Integration', () => {
  it('test1', () => {
    const store = new CompositeEditorStore();
    store.openExisting('SmoothNoise');
    const hcl = store.toHCL();
  });
  it('test2', () => {
    const store = new CompositeEditorStore();
    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    const result = store.fromHCL(hcl);
  });
  it('test3', () => {
    const store = new CompositeEditorStore();
    store.metadata = { name: 'Original', label: 'Original', category: 'user', description: 'Original desc' };
    const result = store.fromHCL('invalid syntax { ] }');
  });
});
```

### Run: `npx vitest run src/patch-dsl/__tests__/_heap-repro.test.ts`
- **Crashes** with the above content (OOM after ~30s)
- **Passes** if you shorten metadata to `{ name: 'X', label: 'X', category: 'user', description: '' }`

This means the system is right at the edge of crashing — tiny changes in string literal sizes tip it over or under. The underlying problem exists in both cases; the shorter version just barely fits.

## What We Know

### Confirmed Facts
1. **Not a circular dependency** — import graph is clean, no cycles
2. **Not test-count dependent** — 1 test or 3 tests, same behavior
3. **Not file-parallelism related** — crashes in complete isolation (single file, single worker)
4. **Not a simple memory limit** — crashes with 8GB heap with `invalid size error`
5. **Deterministic** — same file content consistently crashes or passes
6. **Threshold-sensitive** — trivially different string lengths change the outcome
7. **The crash occurs during Vitest's test collection/execution phase**, not during import

### Architecture (Not the Problem)
- `CompositeEditorStore` imports `patch-dsl` (serialization) + `blocks/registry` + `blocks/composites/persistence` + `blocks/composites/loader`
- `blocks/registry.ts` transitively imports 76 files including compiler IR modules (via `import type` which shouldn't load at runtime)
- Library composites call `.build()` at module level (e.g., `smooth-noise.ts` line 27)
- No circular imports exist

### Most Likely Root Cause (Not Yet Confirmed)

The infinite array growth points to one of:

1. **Parser infinite loop on malformed input**: `store.fromHCL('invalid syntax { ] }')` calls `deserializeCompositeFromHCL` which parses HCL. If the parser doesn't properly handle `{ ] }` (mismatched braces/brackets), it could loop forever pushing error tokens.

2. **MobX reaction cascade**: Setting `store.metadata` on an observable store in jsdom environment could trigger a MobX computed → reaction → computed chain that doesn't terminate. The `validationErrors` computed calls `buildCompositeDef()` which could interact with other computeds.

3. **Vitest jsdom + MobX interaction**: The jsdom environment might be observing MobX observables in a way that creates feedback loops during test collection.

## What Needs to Be Done

### Step 1: Isolate the infinite loop
Write a Node.js script (not Vitest) that:
```typescript
import { CompositeEditorStore } from './src/stores/CompositeEditorStore';
import { deserializeCompositeFromHCL } from './src/patch-dsl';

// Test each operation separately to find which one loops:
const store = new CompositeEditorStore();

// Does this loop?
store.metadata = { name: 'Original', label: 'Original', category: 'user', description: 'Original desc' };

// Or this?
const result = deserializeCompositeFromHCL('invalid syntax { ] }');

// Or this?
store.fromHCL('invalid syntax { ] }');
```

### Step 2: If it's the parser
Check `src/patch-dsl/parser.ts` for infinite loops on `{ ] }` input. The lexer/parser should handle mismatched delimiters gracefully. Add a test: `deserializeCompositeFromHCL('{ ] }')` should return errors, not loop.

### Step 3: If it's MobX
Check if `validationErrors` computed triggers `buildCompositeDef()` which triggers another observable change, creating a cycle. Test by temporarily removing the `validationErrors` computed.

### Step 4: Fix and re-enable
Once the loop is fixed, remove `.skip` from `composite-store-integration.test.ts` and verify all tests pass.

## Files to Read

| File | Why |
|------|-----|
| `src/patch-dsl/__tests__/composite-store-integration.test.ts` | The 3 skipped tests |
| `src/patch-dsl/__tests__/_heap-repro.test.ts` | Minimal repro (DELETE after fixing) |
| `src/stores/CompositeEditorStore.ts` | Store with MobX observables |
| `src/patch-dsl/composite-deserialize.ts` | HCL deserializer |
| `src/patch-dsl/parser.ts` | HCL parser — check error recovery |
| `src/patch-dsl/lexer.ts` | HCL lexer — check token generation for bad input |
| `src/blocks/registry.ts` | Block registry (large import footprint) |

## Cleanup Required

- Delete `src/patch-dsl/__tests__/_heap-repro.test.ts` after investigation
- Revert `describe.skip` → `describe` in `composite-store-integration.test.ts` (currently unskipped from investigation — needs to be re-skipped or fixed)

## Current State of Working Tree

- `composite-store-integration.test.ts` has `describe.skip` REMOVED (from investigation)
- `_heap-repro.test.ts` exists (temporary investigation file)
- Both need cleanup before committing
