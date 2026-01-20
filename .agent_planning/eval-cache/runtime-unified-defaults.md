# Runtime: Unified Default Source Model

**Scope:** buses-and-rails/unified-defaults
**Status:** Implementation complete, but codebase has unrelated TypeScript errors
**Confidence:** FRESH (2026-01-19)
**Reusable:** DefaultSource type usage, compiler pass patterns, UI blockType checks

## Key Findings

### Type System
- DefaultSource is unified: `{ blockType: string, output: string, params?: Record<string, unknown> }`
- No discriminator property (`kind`)
- Three helpers: `defaultSource()`, `defaultSourceConst()`, `defaultSourceTimeRoot()`
- Old patterns fully removed: `defaultSourceRail`, `defaultSourceNone`, `defaultSourceConstant`

### Compiler Pass Behavior
**pass1-default-sources.ts** has two paths:

1. **TimeRoot path** (lines 66-81):
   - Check: `ds.blockType === 'TimeRoot'`
   - Finds existing TimeRoot block
   - Creates edge directly (no derived block)
   - Throws clear error if TimeRoot missing

2. **Derived block path** (lines 83-124):
   - Any other blockType
   - Generates deterministic ID: `_ds_{blockId}_{portId}`
   - Creates derived block with role: `{ kind: 'derived', meta: { kind: 'defaultSource', target: {...} } }`
   - Special handling for Const blocks: adds `payloadType` param from input type
   - Creates edge from derived block to target

### UI Patterns
**BlockInspector.tsx** identifies TimeRoot defaults:
- Check pattern: `defaultSource?.blockType === 'TimeRoot'`
- Styling: `fontStyle: 'italic'`, distinct color
- Used in 6 locations (helper + 5 rendering sites)

### Block Definition Patterns
- Import: `import { defaultSourceConst, defaultSource } from '../types'`
- Usage: `defaultSource: defaultSourceConst(0.02)` for constants
- Usage: `defaultSource: defaultSource('Square', 'square')` for block refs
- Usage: `defaultSource: defaultSourceTimeRoot('tMs')` for TimeRoot outputs

### Test Coverage
- 372 tests passing
- Tests don't reference old patterns
- No tests broken by unified model change

## Known Issues (NOT from this work)

### TypeScript Compilation Blocked
Pre-existing errors from other commits:
1. Missing `baseTauMs` in continuity test (commit 1dde863)
2. SliderWithInput JSX errors (commit 7dd6027)

These postdate the unified defaults work (commits c16d945-2835774).

## Verification Commands

```bash
# Check type definition
grep -A 10 "export type DefaultSource" src/types/index.ts

# Check helper functions
grep -A 5 "export function defaultSource" src/types/index.ts

# Verify old patterns removed
grep -r "defaultSourceRail\|defaultSourceNone\|kind.*rail\|kind.*none" src/

# Check TimeRoot handling in pass1
grep -A 15 "ds.blockType === 'TimeRoot'" src/graph/passes/pass1-default-sources.ts

# Check UI uses blockType
grep "blockType === 'TimeRoot'" src/ui/components/BlockInspector.tsx

# Run tests
npm test
```

## Next Evaluation

**Confidence will remain FRESH** unless:
- DefaultSource type modified in src/types/index.ts
- pass1-default-sources.ts logic changes
- Block definitions revert to old patterns
- BlockInspector UI code changes

**To verify:**
- Check git history for file changes
- Re-run grep for old patterns
- Verify tests still passing
