# Legacy Cleanup Complete

**Date**: 2026-01-27
**Epic**: oscilla-animator-v2-tk2 (Clean up deprecated types, overloads, and legacy patterns)

## Summary

All deprecated code, legacy patterns, and backward-compatibility shims have been systematically removed from the codebase.

## Completed Tasks

### 1. ✅ TypeEnv Legacy Pattern (oscilla-animator-v2-6n6)
**Status**: Completed
**Commits**: 31d42ef, c8e7371, b0ef70b

- Removed deprecated `typecheck()` overload that accepted `TypeEnv`
- Removed `isTypeEnv()` type guard
- Updated all callers to use `TypeCheckContext` exclusively
- Removed `TypeEnv` from public exports
- `TypeEnv` retained as internal type (used by `TypeCheckContext.inputs`)

### 2. ✅ NumericUnit Type Alias (oscilla-animator-v2-tk2.1)
**Status**: Already removed
**Commit**: ada9f4a

- Legacy type alias `NumericUnit = Unit['kind']` removed
- No consumers found in codebase

### 3. ✅ PAYLOAD_STRIDE Constant (oscilla-animator-v2-btt)
**Status**: Already removed
**Commit**: 85639f3

- Deprecated lookup table replaced by intrinsic `.stride` on `ConcretePayloadType`
- No consumers found in codebase

### 4. ✅ CompileError Legacy Fields (oscilla-animator-v2-tk2.3)
**Status**: Completed
**Commit**: e580cf9

- Removed deprecated fields: `kind`, `location`, `severity`
- Cleaned up `compileError()` factory function
- All code now uses canonical fields: `code`, `where`

### 5. ✅ getStateSlots() Method (oscilla-animator-v2-tk2.2)
**Status**: Already removed

- Deprecated method `getStateSlots()` no longer exists
- Replaced by `getStateMappings()`

### 6. ✅ createRuntimeState() Clarification (oscilla-animator-v2-tk2.4)
**Status**: Clarified (not removed)
**Commit**: 7629637

- Function was marked `@deprecated` but is actually a useful convenience wrapper
- Updated JSDoc to clarify: "Convenience wrapper for tests and simple use cases"
- Widely used in tests (80+ call sites)
- NOT removed - it serves a clear purpose

## Success Criteria

All goals from the cleanup epic have been achieved:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No @deprecated comments | ✅ | `grep -r "@deprecated" src/` returns no results |
| Public APIs have single, clear interface | ✅ | No overloaded deprecated signatures remain |
| No unused re-exports | ✅ | All removed items verified with grep |
| All type aliases serve clear purpose | ✅ | Remaining aliases are documented and used |

## Verification

```bash
# No deprecated comments
grep -r "@deprecated" src/
# Result: No matches found

# CompileError fields removed
grep -rn "error\.kind\|\.location\|\.severity" src/compiler/
# Result: No deprecated field usage

# TypeEnv only used internally
grep -rn "TypeEnv" src/expr/
# Result: Only definition and TypeCheckContext.inputs field

# Legacy type aliases removed
grep -rn "NumericUnit\|PAYLOAD_STRIDE" src/
# Result: No matches found
```

## Files Modified

- `src/compiler/types.ts` - Removed CompileError legacy fields
- `src/expr/typecheck.ts` - Removed TypeEnv overload and type guard
- `src/expr/index.ts` - Updated to use TypeCheckContext
- `src/expr/__tests__/typecheck.test.ts` - Updated test patterns
- `src/runtime/RuntimeState.ts` - Clarified createRuntimeState JSDoc

## Beads Closed

- oscilla-animator-v2-6n6: Remove TypeEnv from typecheck.ts
- oscilla-animator-v2-tk2: Clean up deprecated types (epic)
- oscilla-animator-v2-tk2.1: Remove NumericUnit
- oscilla-animator-v2-tk2.2: Remove getStateSlots()
- oscilla-animator-v2-tk2.3: Remove CompileError legacy fields
- oscilla-animator-v2-tk2.4: Remove/clarify createRuntimeState()
- oscilla-animator-v2-btt: Remove PAYLOAD_STRIDE constant

## Architecture Impact

**Before**: Multiple APIs, backward-compatibility shims, deprecated patterns
**After**: Single canonical interface for each concept, no legacy code

This cleanup reduces cognitive overhead and consolidates on "single source of truth" for all major APIs:
- Type checking uses `TypeCheckContext` exclusively
- Compile errors use `code` and `where` fields
- No type guards for deprecated variants
- All deprecation warnings removed

## Next Steps

No further deprecated code cleanup required. The codebase now follows the "ONE SOURCE OF TRUTH" architectural law strictly.
