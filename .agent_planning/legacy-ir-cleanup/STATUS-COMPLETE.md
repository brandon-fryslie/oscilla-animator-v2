# Status: COMPLETE

**Sprint:** Remove Legacy IRProgram
**Completed:** 2026-01-20 07:20:00
**Commit:** 7429e70

## Summary

Successfully removed the deprecated IRProgram interface from the codebase.

## Changes Made

1. Removed IRProgram interface from `src/compiler/ir/types.ts`
2. Updated file header to accurately describe active types
3. Removed IRProgram from `src/index.ts` exports
4. Removed IRProgram from `src/compiler/index.ts` exports
5. Updated comment in `src/compiler/ir/program.ts`

## Verification

- No IRProgram references remain in src/ (verified by grep)
- TypeScript compiles successfully (unrelated test errors from other work)
- Core IR tests passing
- Build succeeds

## Notes

The IRProgram interface was never actually used - only exported. CompiledProgramIR is now clearly documented as the authoritative IR schema. The expression types (SigExpr, FieldExpr, EventExpr, Step, etc.) remain active and are correctly described as such in the updated header.
