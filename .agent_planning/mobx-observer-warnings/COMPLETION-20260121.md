# Completion: Fix MobX Observer Warnings

**Sprint**: mobx-observer-warnings
**Date**: 2026-01-21
**Status**: ✅ COMPLETE

## Objective
Fix MobX observer warnings in browser console by wrapping components that access MobX stores with `observer()`.

## Root Cause
Three components were accessing MobX stores but not properly wrapped or configured:
1. **CanvasTab**: Wrapped with observer() but had empty dependency array in useEffect that accessed `viewport.zoom`
2. **BlockLibrary**: Not wrapped with observer() despite accessing stores in callbacks
3. **ReactFlowEditorInner**: Not wrapped with observer() despite accessing `patchStore.patch` in callbacks

## Solution Implemented

### Changes Made
1. **CanvasTab.tsx** (line 166)
   - Added `viewport` to useEffect dependency array
   - Fixes stale closure capturing old zoom values

2. **BlockLibrary.tsx**
   - Added `observer()` wrapper to component
   - Fixed callback dependency arrays:
     - `handleBlockClick`: added `selection`
     - `handleBlockDoubleClick`: added `selection`, `patch`, `editorHandle`

3. **ReactFlowEditor.tsx**
   - Added `observer()` wrapper to ReactFlowEditorInner component
   - Imported `mobx-react-lite`

## Verification

✅ **TypeScript**: No errors
✅ **Build**: Succeeds
✅ **Tests**: 547 passing, 4 skipped (no new failures)
✅ **Pattern**: Follows MobX best practice - "any component accessing MobX stores should be wrapped with observer()"

## Files Modified
- `src/ui/components/app/CanvasTab.tsx`
- `src/ui/components/BlockLibrary.tsx`
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx`

## Commit
- Hash: 47395ec
- Message: "fix(ui): wrap components accessing MobX stores with observer()"

## Cache Invalidated
- Removed: `runtime-ui-blocklibrary.md` (component internals changed)
- Updated: `INDEX.md` (removed stale entry)

## Expected Outcome
Browser console should no longer show:
```
[mobx] Derivation 'observer' is created/updated without reading any observable value.
```

## Follow-up Recommendations
1. Consider adding ESLint rule to catch unwrapped components accessing MobX stores
2. Document this pattern in project guidelines
3. Audit remaining components for consistent observer usage

## Definition of Done

✅ CanvasTab viewport dependency fixed
✅ BlockLibrary wrapped with observer()
✅ ReactFlowEditorInner wrapped with observer()
✅ All tests passing
✅ TypeScript compiles with no errors
✅ Build succeeds
✅ Changes committed
✅ Summary documented
