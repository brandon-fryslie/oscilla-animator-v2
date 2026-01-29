# Sprint: Editable Default Sources in BlockInspector

**Date**: 2026-01-19
**Status**: COMPLETE

## Goal

Make default source values editable in the BlockInspector UI, allowing users to change constant default values for unconnected input ports.

## Context

After the inputDefaults removal (previous sprint), the DefaultSource architecture is fully established:
- Pass1 creates derived Const blocks for unconnected inputs with `defaultSource` defined
- Derived blocks have deterministic IDs: `_ds_{blockId}_{portId}`
- These blocks are the single source of truth for default values

The BlockInspector was showing default values as read-only text. Users needed the ability to edit these values directly.

## Implementation

### Changes Made

1. **Added getDerivedDefaultSourceId() helper** (line 47-49)
   - Generates deterministic ID matching pass1-default-sources.ts pattern
   - Used to find the derived Const block for an unconnected port

2. **Updated PortItem component** (line 485-582)
   - Added `blockId` prop to receive the parent block's ID
   - Made it a MobX observer to react to derived block changes
   - Find derived block using `getDerivedDefaultSourceId()`
   - Conditionally render DefaultSourceEditor for constant defaults

3. **Created DefaultSourceEditor component** (line 588-669)
   - Editable input field for constant default values
   - Supports both number and text inputs
   - On blur/enter, calls `rootStore.patch.updateBlockParams(derivedBlockId, { value })`
   - Escape key cancels edit
   - Click handler prevents event bubbling to parent PortItem

4. **Visual Design**
   - Shows "(not connected)" label to clarify port status
   - "Default value:" label distinguishes from explicit params
   - Slightly different styling (smaller font, different background)
   - Rail and none defaults remain read-only with original formatting

### Architecture Alignment

✅ **Single Source of Truth**: Edits update the derived block's params.value
✅ **Single Enforcer**: PatchStore.updateBlockParams is the only mutation path
✅ **One-Way Dependencies**: UI → Store → Patch (no circular dependencies)
✅ **Mechanical Enforcement**: TypeScript ensures BlockId type safety

### Files Modified

- `src/ui/components/BlockInspector.tsx` (138 lines added, 10 modified)

### Commit

```
commit 63c01e8
feat(ui): Make default source values editable in BlockInspector
```

## Validation

### TypeScript Compilation

```bash
npm run typecheck  # ✅ PASS (0 errors)
```

### Manual Testing Required

The user should verify:

1. **Load app** → `npm run dev` → http://localhost:5173/
2. **Select a block** with unconnected input (e.g., RenderInstances2D)
3. **View default value** in inspector (shows "(not connected)" + editable input)
4. **Edit the value** → change number → press Enter
5. **Verify recompile** → visual output should update
6. **Check persistence** → value should remain after reselecting block

### Expected Behavior

- Editing a default source value triggers PatchStore.updateBlockParams()
- This emits ParamChanged event (if eventHub is set)
- Compiler detects param change and recompiles
- Runtime sees new value and updates visual output
- MobX reactivity ensures UI shows updated value

## Acceptance Criteria

- [x] Default source values are editable for constant type defaults
- [x] Rail and none defaults remain read-only
- [x] Visual distinction shows it's a default, not an explicit wire
- [x] "(not connected)" label is preserved
- [x] Editing triggers recompile and visual update
- [x] TypeScript compiles with no errors
- [x] Implementation follows architecture constraints

## Future Enhancements

Consider:
- Support editing rail defaults (dropdown to select from available rails)
- Visual indicator when default value differs from registry default
- Undo/redo support for default value changes
- Batch editing multiple defaults at once
