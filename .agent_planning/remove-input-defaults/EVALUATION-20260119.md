# Evaluation: Remove inputDefaults System

Generated: 2026-01-19
Verdict: **CONTINUE** - Clear scope, straightforward removal

## Summary

The `inputDefaults` system was incorrectly added to the codebase. It creates a parallel value path that **completely bypasses** the block params/defaultSources architecture defined in the spec.

### What Was Requested (Original Task)
"Default sources should be rendered differently on the patch" - a **UI visual differentiation** task.

### What Was Actually Built
A whole new `inputDefaults` field on Block that:
1. Stores `DefaultSource` values directly on Block instances
2. Gets checked in Pass1 **before** the registry defaults
3. Creates hardcoded constants that have **no relationship** to block params
4. Makes param edits in the inspector completely useless for those inputs

### Why This Is Wrong

Per the spec (`02-block-system.md`):
- DefaultSource blocks are **derived blocks** created during GraphNormalization
- They read from the block's **params** (the single source of truth)
- The user never creates them directly - normalization does

The `inputDefaults` system creates inline constants at patch-authoring time that:
- Are disconnected from the block's params
- Cannot be edited via the inspector
- Violate the "everything is a block" invariant
- Create a second source of truth for default values

## Scope of Removal

### Files to Modify

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Remove `inputDefaults` from Block interface and PatchBuilder |
| `src/graph/passes/pass1-default-sources.ts` | Remove `inputDefaults` check |
| `src/stores/PatchStore.ts` | Remove `inputDefaults` handling |
| `src/ui/reactFlowEditor/nodes.ts` | Remove `inputDefaults` check |
| `src/main.ts` | Remove ALL `inputDefaults` usages from demo patches |

### Lines to Remove (Approximate)

- `src/graph/Patch.ts:31` - Interface field
- `src/graph/Patch.ts:103` - Options type field
- `src/graph/Patch.ts:116` - Assignment
- `src/graph/passes/pass1-default-sources.ts:49` - Override check
- `src/stores/PatchStore.ts:250-260` - Entire inputDefaults handling
- `src/ui/reactFlowEditor/nodes.ts:47` - Override check
- `src/main.ts` - Multiple blocks with inputDefaults (13 occurrences)

## Demo Patches After Removal

The demo patches in `main.ts` will need to be rewritten to either:
1. **Not specify defaults** - Let the registry defaults apply (normalization will create DefaultSource blocks)
2. **Wire actual connections** - If specific values are needed, create explicit Const blocks and wire them

Option 1 is preferred - the blocks should have sensible registry defaults.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Demo patches break | HIGH | Rewrite them properly |
| Other code depends on inputDefaults | LOW | Grep shows limited usage |
| Tests fail | MEDIUM | Update tests if any use inputDefaults |

## Confidence

**HIGH** - This is a straightforward removal:
1. Delete the field from types
2. Delete the code that reads it
3. Fix the demo patches to not use it
4. TypeScript will catch any missed references

## Files Involved

```
src/graph/Patch.ts                        # Type definition
src/graph/passes/pass1-default-sources.ts # Pass1 override logic
src/stores/PatchStore.ts                  # Store handling
src/ui/reactFlowEditor/nodes.ts           # UI override check
src/main.ts                               # Demo patches (heavy usage)
```

## Recommendation

Remove the entire `inputDefaults` system and rewrite demo patches to use proper architecture:
- Blocks have params
- Params have default values (in BlockSpec)
- GraphNormalization creates DefaultSource blocks that read from params
- Inspector edits params, which affects the DefaultSource blocks

This is the spec-compliant architecture. The `inputDefaults` system is a spec violation.
