# Evaluation: GCC-style Compiler Flag System
Timestamp: 2026-02-02-104500
Git Commit: 10a765b

## Executive Summary
Overall: 0% complete (feature not started) | Critical design issues: 3 | Tests reliable: N/A (no implementation)

This is a pre-implementation evaluation. The feature does not exist yet. The purpose is to identify design risks and architectural constraints that an implementer must navigate.

## Runtime Check Results
| Check | Status | Output |
|-------|--------|--------|
| npm run test | PASS (141/141) | 6 skipped, 1 worker crash (unrelated) |
| Settings infrastructure exists | YES | defineSettings, SettingsStore, SettingsPanel all functional |
| Compiler has settings access | NO | Zero coupling between compiler and settings system |
| Error codes are enumerated | PARTIAL | Two separate error type systems exist |

## Missing Checks
- No test that verifies ConflictingUnits can be downgraded to warning
- No integration test that settings changes trigger recompilation with different severity
- No test that warnings from flags still appear in diagnostics (not silently dropped)

## Findings

### 1. Two Duplicate CompileError Types
**Status**: PRE-EXISTING DEBT (blocks implementation)
**Evidence**:
- `src/compiler/compile.ts:52-58`: `CompileError` with `{ kind, message, blockId?, connectionId?, portId? }`
- `src/compiler/types.ts:49-61`: `CompileError` with `{ code, message, where?, details? }`
- `src/compiler/diagnosticConversion.ts:38-40`: `isLegacyError()` bridge between both formats

**Impact on flag system**: A flag system needs a single error code taxonomy to map flags to. Currently there are two: `TypeConstraintErrorKind` (pass1) and `CompileErrorCode` (pass6), plus string-typed codes from lowering. The implementer must decide: does the flag system use DiagnosticCode (the output taxonomy) or the input error code? DiagnosticCode is lossy -- multiple input codes map to the same DiagnosticCode (e.g., 6 different codes all map to `E_UNKNOWN_BLOCK_TYPE` in diagnosticConversion.ts:81-86).

### 2. Pass1 Has No Warning Path
**Status**: ARCHITECTURAL GAP
**Evidence**:
- `src/compiler/frontend/analyze-type-constraints.ts:692`: `if (errors.length) return { kind: 'error', errors };` -- all-or-nothing
- `src/compiler/compile.ts:188-196`: Pass1 errors immediately terminate compilation
- `Pass1Result` type (line 61): `TypeResolvedPatch | Pass1Error` -- no room for warnings

**Impact**: The immediate need (ConflictingUnits as warning) requires pass1 to continue compilation even when some errors are present. Currently, a ConflictingUnits error at line 570 means the port's type is unresolved (union-find conflict). If this becomes a warning, what type does the port get? The implementer must answer: **what is the fallback type when a unit conflict is downgraded?** Options: (a) use the first conflicting unit, (b) use `unitless`, (c) skip the port. Each has different downstream effects.

### 3. Compiler is Pure, Settings are MobX
**Status**: ARCHITECTURAL BOUNDARY
**Evidence**:
- `src/compiler/compile.ts:93`: `compile(patch, options?)` -- pure function, no store access
- `src/services/CompileOrchestrator.ts:82`: `compile(patch, { events, patchRevision, patchId })` -- no settings passed
- `src/stores/SettingsStore.ts`: MobX observable store

**Impact**: The compiler has no mechanism to receive settings. The flag configuration must be threaded through `CompileOptions`. This is the correct design (compiler stays pure, settings are injected), but it means:
1. CompileOptions needs a `flags` or `diagnosticSeverity` field
2. CompileOrchestrator must read settings and pass them to compile()
3. The SettingsStore must trigger recompilation when flags change

### 4. Reachability-Based Severity Already Exists (Partial Pattern)
**Status**: PARTIAL PATTERN EXISTS
**Evidence**: `src/compiler/compile.ts:270-330` -- unreachable block errors are downgraded to warnings
**Impact**: This shows the architecture can handle mixed severity. BUT this pattern is ad-hoc (inline in compile.ts), not driven by a flag table. A flag system should subsume this behavior.

### 5. DiagnosticCode Mapping is Lossy
**Status**: DESIGN RISK
**Evidence**: `src/compiler/diagnosticConversion.ts:67-101` -- ERROR_CODE_TO_DIAGNOSTIC_CODE mapping:
- `BlockMissing` -> `E_UNKNOWN_BLOCK_TYPE`
- `NotImplemented` -> `E_UNKNOWN_BLOCK_TYPE`
- `IRValidationFailed` -> `E_UNKNOWN_BLOCK_TYPE`
- `UpstreamError` -> `E_UNKNOWN_BLOCK_TYPE`
- `TransformError` -> `E_UNKNOWN_BLOCK_TYPE`
- `VarargError` -> `E_UNKNOWN_BLOCK_TYPE`

Six different error codes all collapse to `E_UNKNOWN_BLOCK_TYPE`. If the flag system uses DiagnosticCode as the key, you cannot independently control `NotImplemented` vs `BlockMissing`. If it uses the raw error code, there's no unified taxonomy.

### 6. compile.ts CompileResult Has No Warnings Field
**Status**: ARCHITECTURAL GAP
**Evidence**:
- `src/compiler/compile.ts:60-70`: `CompileSuccess = { kind: 'ok', program }` -- no warnings
- `src/compiler/types.ts:82-84`: `CompileResult<T>` has `warnings` field on both success and failure

The types.ts CompileResult supports warnings. The compile.ts CompileResult does not. The flag system needs the compile.ts version to carry warnings through to the caller.

## Ambiguities Found
| Area | Question | How LLM Would Likely Guess | Impact |
|------|----------|---------------------------|--------|
| Flag key taxonomy | Should flags key on DiagnosticCode, CompileErrorCode, TypeConstraintErrorKind, or a new unified code? | Use DiagnosticCode (most visible) | Wrong -- DiagnosticCode is lossy (6:1 mapping). Cannot control granularity. |
| ConflictingUnits fallback type | When ConflictingUnits is a warning, what type does the port resolve to? | Use first conflict value | Could cause cascading type errors downstream or silent wrong behavior |
| Flag granularity | Per-code or per-code-per-block? | Per-code (GCC-style) | Correct for MVP, but spec may want per-block overrides later |
| Reachability interaction | If a code is flagged as 'error' but the block is unreachable, does reachability still downgrade it? | Yes, reachability overrides flags | Unclear -- could argue either way. Needs explicit decision. |
| Settings-to-recompile trigger | Should changing a flag trigger immediate recompile? | Yes, via MobX reaction | Correct, but adds complexity. Must debounce to avoid thrashing. |

## Recommendations

1. **Unify error code taxonomy first.** Create a single `CompilerDiagnosticCode` union that covers all error codes from pass1, pass6, and lowering. Map these 1:1 to DiagnosticCode where possible, but keep the compiler-side codes granular. The flag system keys on CompilerDiagnosticCode.

2. **Add warnings to compile.ts CompileResult.** Change `CompileSuccess` to `{ kind: 'ok', program, warnings: CompileError[] }`. This is a prerequisite -- without it, downgraded errors are silently lost.

3. **Design the ConflictingUnits fallback.** Before implementing the flag system, answer: what type does a port get when ConflictingUnits is a warning? This drives whether pass1 needs a "best-effort resolution" mode or whether the warning is emitted but the first-seen type wins.

4. **Thread flags through CompileOptions.** Add `diagnosticOverrides?: Map<string, 'error' | 'warn' | 'ignore'>` to CompileOptions. CompileOrchestrator reads from SettingsStore and injects.

5. **Define interaction with reachability.** Document: flags set the base severity; reachability can only downgrade (error->warn), never upgrade. This makes the two systems compose cleanly.

6. **Create settings token with select controls.** One `select` field per error code family (or per individual code). Default values come from a hardcoded severity table. The SettingsPanel already supports `select` controls.

## Verdict
- [x] PAUSE - Ambiguities need clarification

**Three questions need answers before implementation:**

1. **Fallback type for ConflictingUnits warnings**: When a unit conflict is downgraded to warning, what type does the port resolve to? This affects whether compilation can continue at all. The three options (first-wins, unitless, skip-port) have different downstream effects that must be tested.

2. **Flag key taxonomy**: The implementer needs to know whether to key on the 31 DiagnosticCodes (coarse, lossy) or the ~30 raw compiler error codes (granular, split across two type systems). This is a one-way door -- changing it later means migrating all persisted user settings.

3. **Reachability x flags interaction**: If a user sets `UnconnectedInput` to `'ignore'` but the block is reachable, does it silently produce a broken program? The spec needs to define which error codes are "always fatal" regardless of flags (structural errors like Cycle, MissingBlockDef) vs which are configurable (ConflictingUnits, UnitMismatch).
