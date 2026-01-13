# Handoff: Deduplication Cleanup & Type System Strictness

**Created**: 2026-01-12 ~12:00
**Updated**: 2026-01-12 ~14:00
**For**: Next agent continuing this work
**Status**: P0-P3 COMPLETE, P4 pending user discussion

---

## Objective

Clean up dead code identified in DEDUPLICATION-AUDIT.md and fix the compiler's type checking to require exact type matches (no implicit coercion).

## Current State

### What's Been Done
- ✅ **P0**: Deleted `/src/compiler/ir/bridge.ts` (duplicate of `bridges.ts`)
- ✅ **P1**: Deleted `/src/viewer/` directory (empty placeholder module)
- ✅ **P2**: Removed 7 console.log/warn/debug statements from critical paths:
  - `DiagnosticHub.ts` (3 statements)
  - `pass7-schedule.ts` (3 statements)
  - `pass6-block-lowering.ts` (1 statement)
- ✅ **P3**: Type system strictness COMPLETE
  - Fixed Pass 2 (`pass2-types.ts`) to require exact type matches
  - Removed commented-out validation block from Pass 6 (lines 112-129)
  - Implemented graph normalization adapter system (`src/graph/adapters.ts`, `src/graph/normalize.ts`)
  - Added `adapter` variant to `DerivedBlockMeta` in `src/types/index.ts`
  - Steel-thread test passes (broadcasts auto-inserted for signal→field connections)

### What Remains
- **P4**: Pipeline placeholders (pass8LinkResolution, convertLinkedIRToProgram) - user wanted to discuss before proceeding

## Context & Background

### Why We're Doing This
The DEDUPLICATION-AUDIT.md identified ~30% of the codebase as technical debt: duplicate files, commented-out code, misleading TODOs, and debug statements. Fixing the type system surfaced a deeper architectural issue.

### Key Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| Compiler requires exact type matches | User: "The compiler does NOT do any type coercion, insert helpers, adapters, or try to fix a broken graph" | 2026-01-12 |
| Keep IRBuilder state methods | User explicitly requested not removing `declareState`, `readState`, `writeState` | 2026-01-12 |
| Multi-writer validation not needed | If each edge requires exact match, all writers to same input necessarily have same type | 2026-01-12 |

### Important Constraints
- **Compiler is strict** - No implicit promotions (`zero→one`, `one→many`)
- **Graph Normalization's job** - Insert adapters/broadcast blocks before compilation
- **Architecture principle** - Compiler validates, it doesn't fix

## Key Code Changes Made

### `src/compiler/passes-v2/pass2-types.ts`
Changed `isTypeCompatible()` from allowing promotions to requiring exact matches:
```typescript
// OLD: Allowed zero→one, one→many, zero→many
// NEW: Exact match only - payload, temporality, cardinality, and domain must all match
```

### `src/compiler/passes-v2/pass6-block-lowering.ts`
Removed 18 lines of commented-out validation (lines 112-129) that were marked with repeated `// TODO: Fix validation for new SignalType structure`

## Test Status (Updated 2026-01-12 ~14:00)

✅ **steel-thread.test.ts PASSES** - Graph normalization now auto-inserts `FieldBroadcast` adapters for signal→field connections.

The 7 failures in `stateful-primitives.test.ts` are pre-existing issues (missing `TimeMs` block, etc.) - not related to type system changes.

## Files Modified This Session

- `src/compiler/ir/bridge.ts` - DELETED
- `src/viewer/index.ts` - DELETED (whole directory)
- `src/diagnostics/DiagnosticHub.ts` - Removed 3 console.log statements
- `src/compiler/passes-v2/pass7-schedule.ts` - Removed 3 console.warn statements
- `src/compiler/passes-v2/pass6-block-lowering.ts` - Removed 1 console.debug + 18 lines commented validation
- `src/compiler/passes-v2/pass2-types.ts` - Made type checking strict (exact match only)
- `src/graph/adapters.ts` - NEW: Adapter registry with type coercion rules
- `src/graph/normalize.ts` - Added type-aware adapter insertion
- `src/types/index.ts` - Added `adapter` variant to `DerivedBlockMeta`

## Planning Documents

- `.agent_planning/DEDUPLICATION-AUDIT.md` - Original audit findings
- `.agent_planning/deduplication-cleanup/PLAN-20260112.md` - Sprint plan
- `.agent_planning/deduplication-cleanup/DOD-20260112.md` - Acceptance criteria
- `.agent_planning/deduplication-cleanup/CONTEXT-20260112.md` - Implementation context
- `.agent_planning/deduplication-cleanup/USER-RESPONSE-20260112.md` - User approval

## Next Steps for Agent

**P4 remains**: Pipeline placeholders (pass8LinkResolution, convertLinkedIRToProgram)
- User wanted to discuss before proceeding
- Ask user if these should be implemented, documented as not-yet-needed, or deferred
