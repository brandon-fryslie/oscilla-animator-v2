# User Response: Unified Inputs Architecture

**Date:** 2026-01-20
**Status:** APPROVED

## Decision

User approved the unified inputs architecture plan:
- Fold `params` into `inputs`
- Convert `inputs` and `outputs` from arrays to Records
- Enable `uiHint` on any input regardless of port exposure

## Key Design Decisions Made

1. **Keep name `inputs`** - Avoids mass renaming, params functionality folded in
2. **Outputs stay separate** - They're computed results, not configuration
3. **`exposedAsPort` field** - Controls whether an input appears as a wirable port
4. **Full migration** - All block files converted, not incremental

## Files

- `PLAN.md` - Approved implementation plan
- `SPRINT-2026-01-20-unified-inputs-PLAN.md` - Detailed sprint breakdown
- `SPRINT-2026-01-20-unified-inputs-DOD.md` - Acceptance criteria
- `SPRINT-2026-01-20-unified-inputs-CONTEXT.md` - Implementation context

## Next Step

Execute `/do:it` to implement the plan.
