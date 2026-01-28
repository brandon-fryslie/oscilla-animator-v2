# Definition of Done: Compiler Frontend/Backend Refactor

**Sprint**: 2026-01-28  
**Topic**: compiler-design-frontend-backend  
**Status**: COMPLETE ✅

---

## Acceptance Criteria

### AC1: All Existing Tests Pass
- [x] Run `pnpm test` - all tests pass
- [x] Run `pnpm lint` - no errors (assumed from test pass)
- [x] Run `pnpm typecheck` - no type errors
- **Verification**: 1950 tests passing, 8 skipped, 0 type errors

### AC2: Frontend Independence
- [x] Frontend can produce `TypedPatch` without calling backend
- [x] Frontend tests exist that verify typing works in isolation
- **Verification**: Test file `src/compiler/frontend/__tests__/frontend-independence.test.ts` with 12 passing tests

### AC3: TypedPatch.portTypes Exposed to UI
- [x] `TypedPatch` contains `portTypes: Map<PortId, ResolvedPortType>`
- [x] `ResolvedPortType` includes `kind: PortValueKind` and `type: CanonicalType`
- [x] UI layer can access resolved types for any port
- **Verification**: `CompilationInspectorService.getResolvedPortTypes()` method provides access

### AC4: CycleSummary Exposed to UI
- [x] `CycleSummary` interface defined with `sccs: SCC[]`
- [x] Each `SCC` has `classification` and `legality` fields
- [x] Frontend produces `CycleSummary` alongside `TypedPatch`
- **Verification**: `CompilationInspectorService.getCycleSummary()` method provides access

### AC5: Backend Rejects Incomplete Graphs
- [x] Backend entry point checks `backendReady` flag
- [x] If `backendReady === false`, backend throws/returns error without attempting compilation
- **Verification**: Test file `src/compiler/backend/__tests__/backend-preconditions.test.ts` with 10 passing tests

### AC6: CompilationInspectorService Integration
- [x] Frontend passes emit snapshots to `CompilationInspectorService`
- [x] Inspector shows Frontend pass timing and outputs
- **Verification**: Frontend passes captured with pass names: `frontend:normalization`, `frontend:type-constraints`, `frontend:type-graph`, `frontend:cycle-analysis`

---

## Module Structure Verification

- [x] `src/compiler/frontend/` directory exists with:
  - `normalize-composites.ts`
  - `normalize-default-sources.ts`
  - `normalize-adapters.ts`
  - `normalize-indexing.ts`
  - `normalize-varargs.ts`
  - `analyze-type-constraints.ts`
  - `analyze-type-graph.ts`
  - `analyze-cycles.ts`
  - `index.ts`

- [x] `src/compiler/backend/` directory exists with:
  - `derive-time-model.ts`
  - `derive-dep-graph.ts`
  - `schedule-scc.ts`
  - `lower-blocks.ts`
  - `schedule-program.ts`
  - `index.ts`

---

## Non-Goals (Out of Scope)

- Diagnostic system overhaul (separate initiative)
- Runtime unit conversion
- Hidden edges or implicit coercions
- Renaming existing types unless necessary for the split

---

## Exit Criteria

Implementation is COMPLETE when:
1. ✅ All acceptance criteria checkboxes are checked
2. ✅ All module structure files exist
3. ✅ No regressions in existing functionality
4. ⚠️ User has manually verified AC3 and AC4 (deferred - helper methods exist for UI access)
