# Definition of Done: compiler-flags
Generated: 2026-02-02
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260202-compiler-flags-PLAN.md

## Acceptance Criteria

### DiagnosticFlagDef Type and Registry
- [ ] `DiagnosticSeverityOverride` type is `'error' | 'warn' | 'ignore'`
- [ ] `DiagnosticFlagDef` interface has: code, label, description, defaultSeverity, category
- [ ] `DIAGNOSTIC_FLAGS` array has entries for all 8 `TypeConstraintErrorKind` values
- [ ] `ConflictingUnits` defaults to `'warn'`; all 7 others default to `'error'`
- [ ] `getDefaultDiagnosticFlags()` returns `Record<string, DiagnosticSeverityOverride>` derived from registry
- [ ] Adding a new flag requires only adding one entry to `DIAGNOSTIC_FLAGS`

### Settings Token
- [ ] `compilerFlagsSettings` token exists at `src/settings/tokens/compiler-flags-settings.ts`
- [ ] Token namespace is `'compilerFlags'`
- [ ] Defaults derived from `getDefaultDiagnosticFlags()`
- [ ] Each flag has a `select` control with options: error, warn, ignore
- [ ] Token registered in `src/main.ts`
- [ ] SettingsPanel renders compiler flags section automatically (no new UI components)

### CompileOptions Extension
- [ ] `CompileOptions.diagnosticFlags` is `Record<string, DiagnosticSeverityOverride> | undefined`
- [ ] Existing call sites compile without changes

### Flag-Aware Error Partitioning
- [ ] Pass1 errors partitioned by flag severity before deciding compile success/failure
- [ ] `'error'` severity errors fail compilation (existing behavior)
- [ ] `'warn'` severity errors become warning diagnostics in CompileEnd event
- [ ] `'ignore'` severity errors are dropped silently
- [ ] Default behavior (no flags) preserves current behavior except `ConflictingUnits` -> warn
- [ ] Partitioning logic is a testable helper function, not inline in compile()

### CompileOrchestrator Threading
- [ ] `compileAndSwap` reads flags from `store.settings.get(compilerFlagsSettings)`
- [ ] Flags passed to `compile()` via `options.diagnosticFlags`

### Tests
- [ ] `ConflictingUnits` default severity is `'warn'` (registry test)
- [ ] Override `ConflictingUnits` to `'error'` causes compile failure (integration test)
- [ ] Override `ConflictingUnits` to `'ignore'` drops error silently (integration test)
- [ ] Other error codes default to `'error'` and fail compilation (registry test)
- [ ] `npm run test` passes with no regressions
- [ ] `npm run typecheck` passes with no new errors
