# Sprint: compiler-flags - GCC-Style Diagnostic Flag System
Generated: 2026-02-02
Confidence: HIGH: 5, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: No EVALUATION file found (planned from user specification + codebase analysis)

## Blockers and Questions

- **No EVALUATION file**: The topic directory `.agent_planning/compiler-flags/` contains no `EVALUATION-*.md`. This plan is derived directly from user specification and codebase analysis.

## Sprint Goal

Add a configurable diagnostic severity system to the compiler so that each error code can be overridden to `'error' | 'warn' | 'ignore'`, with `ConflictingUnits` defaulting to `'warn'`.

## Scope

**Deliverables:**
1. `DiagnosticFlagDef` type and flag registry with initial pass1 entries
2. `compilerFlags` settings token with per-code severity overrides
3. `CompileOptions.diagnosticFlags` extension and flag-aware error partitioning in `compile.ts`
4. CompileOrchestrator reads flags from settings and passes to `compile()`
5. Tests proving flag-based severity routing works

## Work Items

### P0 - Define DiagnosticFlagDef type and flag registry

**Dependencies**: None
**Spec Reference**: User specification (compiler flags topic)

#### Description

Create a new file `src/compiler/diagnostic-flags.ts` containing:
- `DiagnosticSeverityOverride` type (`'error' | 'warn' | 'ignore'`)
- `DiagnosticFlagDef` interface (code, label, description, defaultSeverity, category)
- `DIAGNOSTIC_FLAGS` array with entries for all `TypeConstraintErrorKind` values
- `getDefaultDiagnosticFlags()` helper that returns `Record<string, DiagnosticSeverityOverride>` from the registry
- `ConflictingUnits` defaults to `'warn'`; all others default to `'error'`

Adding a new flag = adding one entry to `DIAGNOSTIC_FLAGS`. No code changes needed elsewhere.

#### Acceptance Criteria
- [ ] `DiagnosticSeverityOverride` is `'error' | 'warn' | 'ignore'`
- [ ] `DIAGNOSTIC_FLAGS` contains entries for: `ConflictingUnits`, `ConflictingPayloads`, `UnresolvedUnit`, `UnresolvedPayload`, `MissingBlockDef`, `MissingPortDef`, `CardinalityConflict`, `UnresolvedCardinality`
- [ ] `ConflictingUnits` has `defaultSeverity: 'warn'`; all others have `defaultSeverity: 'error'`
- [ ] `getDefaultDiagnosticFlags()` returns a record keyed by code with default severities

#### Technical Notes
- This is a pure data module with no imports from runtime/UI. It can be imported by both compiler and settings.
- The registry array is `Object.freeze`d to prevent mutation.

---

### P0 - Create compilerFlags settings token

**Dependencies**: DiagnosticFlagDef registry (work item 1)
**Spec Reference**: User specification; existing pattern in `src/settings/tokens/debug-settings.ts`

#### Description

Create `src/settings/tokens/compiler-flags-settings.ts` following the existing `defineSettings` pattern. The token's defaults are derived from `getDefaultDiagnosticFlags()`. Each flag is rendered as a `select` control with options `error / warn / ignore`.

The token must be registered in `src/main.ts` alongside `appSettings` (and in `CompileOrchestrator` or wherever settings are first accessed for compilation).

#### Acceptance Criteria
- [ ] `compilerFlagsSettings` token created with namespace `'compilerFlags'`
- [ ] Defaults match `getDefaultDiagnosticFlags()` output
- [ ] Each flag has a `select` control with three options: `error`, `warn`, `ignore`
- [ ] Token registered in `src/main.ts` so it appears in SettingsPanel automatically
- [ ] SettingsPanel renders the compiler flags section with no additional UI code

#### Technical Notes
- The settings token interface needs a type like `Record<string, DiagnosticSeverityOverride>`. Since `defineSettings` requires `Record<string, unknown>`, this works directly.
- UI fields must be generated from `DIAGNOSTIC_FLAGS` to maintain single source of truth (loop over the array to build `fields`).

---

### P0 - Extend CompileOptions with diagnosticFlags

**Dependencies**: DiagnosticFlagDef registry (work item 1)
**Spec Reference**: User specification

#### Description

Add `diagnosticFlags?: Record<string, DiagnosticSeverityOverride>` to `CompileOptions` in `src/compiler/compile.ts`. This is just a type extension; the field is optional and defaults to the registry defaults when absent.

#### Acceptance Criteria
- [ ] `CompileOptions` interface has `diagnosticFlags?: Record<string, DiagnosticSeverityOverride>`
- [ ] No existing call sites break (field is optional)

#### Technical Notes
- Import `DiagnosticSeverityOverride` from `./diagnostic-flags`.

---

### P1 - Flag-aware error partitioning in compile.ts

**Dependencies**: CompileOptions extension (work item 3), DiagnosticFlagDef registry (work item 1)
**Spec Reference**: User specification; `src/compiler/compile.ts` lines 188-196 (pass1 error handling)

#### Description

After pass1 returns errors (line 188-196 in `compile.ts`), instead of immediately returning failure, partition errors by their flag severity:

1. Resolve effective severity: `options.diagnosticFlags?.[error.kind] ?? getDefaultDiagnosticFlags()[error.kind] ?? 'error'`
2. Errors with `'error'` severity: accumulate as compile errors (existing behavior)
3. Errors with `'warn'` severity: convert to warning diagnostics, include in `CompileEnd` event alongside `unreachableBlockWarnings`
4. Errors with `'ignore'` severity: silently drop

Only errors with severity `'error'` should cause compilation to fail. Warnings and ignored errors allow compilation to continue.

The warning diagnostics for downgraded errors should use the existing `convertCompileErrorToDiagnostic` from `diagnosticConversion.ts`, but override severity to `'warn'`.

#### Acceptance Criteria
- [ ] Pass1 errors with flag severity `'error'` still fail compilation
- [ ] Pass1 errors with flag severity `'warn'` are emitted as warning diagnostics in CompileEnd event, compilation continues
- [ ] Pass1 errors with flag severity `'ignore'` are silently dropped, compilation continues
- [ ] Default behavior (no flags passed) is identical to current behavior EXCEPT `ConflictingUnits` which is now `'warn'`
- [ ] Warning diagnostics appear in DiagnosticHub with severity `'warn'`

#### Technical Notes
- The partitioning logic should be a small helper function (e.g., `partitionByFlags`) to keep `compile()` clean.
- This helper takes the errors array and the flags record, returns `{ errors: [], warnings: [], ignored: [] }`.
- Warning diagnostics need to be accumulated alongside `unreachableBlockWarnings` and emitted in the success `CompileEnd` event.
- Pass6 errors are NOT configurable in this sprint (only pass1 `TypeConstraintErrorKind` codes).

---

### P1 - Thread flags through CompileOrchestrator

**Dependencies**: CompileOptions extension (work item 3), settings token (work item 2)
**Spec Reference**: User specification; `src/services/CompileOrchestrator.ts` line 82

#### Description

In `compileAndSwap()`, read the current compiler flags from `store.settings.get(compilerFlagsSettings)` and pass them as `diagnosticFlags` in the `compile()` call options.

The token must be registered before first use. Registration should happen in `src/main.ts` where other tokens are registered, or lazily via `useSettings` pattern.

#### Acceptance Criteria
- [ ] `compileAndSwap` reads flags from `store.settings.get(compilerFlagsSettings)`
- [ ] Flags are passed to `compile()` via `options.diagnosticFlags`
- [ ] Changing a flag in settings and recompiling uses the new severity

#### Technical Notes
- Import `compilerFlagsSettings` directly from `src/settings/tokens/compiler-flags-settings.ts` (per ownership model).
- `store.settings.register(compilerFlagsSettings)` must be called before `.get()`. Best place: `src/main.ts` alongside existing `store.settings.register(appSettings)`.

---

### P1 - Tests for flag-based severity routing

**Dependencies**: All above work items
**Spec Reference**: User specification

#### Description

Add tests in `src/compiler/__tests__/diagnostic-flags.test.ts` covering:

1. **Registry tests**: `getDefaultDiagnosticFlags()` returns correct defaults; `ConflictingUnits` is `'warn'`
2. **Partitioning tests**: Given a set of pass1 errors and various flag configs, verify correct partitioning into errors/warnings/ignored
3. **Integration test**: Compile a patch that triggers `ConflictingUnits`, verify compilation succeeds (not fails) and warning diagnostic is emitted

#### Acceptance Criteria
- [ ] Test: `ConflictingUnits` default severity is `'warn'`
- [ ] Test: Overriding `ConflictingUnits` to `'error'` causes compile failure
- [ ] Test: Overriding `ConflictingUnits` to `'ignore'` silently drops the error
- [ ] Test: Other error codes default to `'error'` and still fail compilation
- [ ] All tests pass with `npm run test`

#### Technical Notes
- For integration tests, reuse existing test fixtures from `src/compiler/__tests__/fixtures/` or create a minimal patch that triggers a `ConflictingUnits` error.
- The unit constraint solver triggers `ConflictingUnits` when two connected ports have incompatible units (e.g., `radians` vs `degrees`). A test fixture needs two blocks with mismatched unit types connected by an edge.

## Dependencies

```
[1] DiagnosticFlagDef registry
 |-> [2] Settings token
 |-> [3] CompileOptions extension
      |-> [4] Flag-aware partitioning in compile.ts
      |-> [5] CompileOrchestrator threading
           |-> [6] Tests (depends on all above)
```

Items 2 and 3 can be done in parallel after item 1.
Items 4 and 5 can be done in parallel after item 3.
Item 6 (tests) depends on all previous items.

## Risks

- **Settings token field generation**: The settings system expects static `fields` in the UI config. Generating fields dynamically from `DIAGNOSTIC_FLAGS` at token-creation time should work since `defineSettings` runs once at module load. Low risk.
- **Backward compatibility**: Changing `ConflictingUnits` default from `'error'` to `'warn'` changes observable behavior. This is intentional per user request. Any tests asserting `ConflictingUnits` causes compile failure will need updating.
