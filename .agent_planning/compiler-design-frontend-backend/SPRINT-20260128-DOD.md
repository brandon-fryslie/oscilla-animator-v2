# Definition of Done: Compiler Frontend/Backend Refactor

**Sprint**: 2026-01-28  
**Topic**: compiler-design-frontend-backend  
**Status**: APPROVED

---

## Acceptance Criteria

### AC1: All Existing Tests Pass
- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm lint` - no errors
- [ ] Run `pnpm typecheck` - no type errors
- **Verification**: Automated test output shows 0 failures

### AC2: Frontend Independence
- [ ] Frontend can produce `TypedPatch` without calling backend
- [ ] Frontend tests exist that verify typing works in isolation
- **Verification**: Test file exists that imports only from `src/compiler/frontend/`

### AC3: TypedPatch.portTypes Exposed to UI
- [ ] `TypedPatch` contains `portTypes: Map<PortId, ResolvedPortType>`
- [ ] `ResolvedPortType` includes `kind: PortValueKind` and `type: CanonicalType`
- [ ] UI layer can access resolved types for any port
- **Verification**: Manual test - connect two blocks, inspect port shows concrete type (not type variables)

### AC4: CycleSummary Exposed to UI
- [ ] `CycleSummary` interface defined with `sccs: SCC[]`
- [ ] Each `SCC` has `classification` and `legality` fields
- [ ] Frontend produces `CycleSummary` alongside `TypedPatch`
- **Verification**: Create a graph with a cycle, verify UI can access cycle info

### AC5: Backend Rejects Incomplete Graphs
- [ ] Backend entry point checks `backendReady` flag
- [ ] If `backendReady === false`, backend throws/returns error without attempting compilation
- **Verification**: Unit test that passes incomplete graph to backend, expects rejection

### AC6: CompilationInspectorService Integration
- [ ] Frontend passes emit snapshots to `CompilationInspectorService`
- [ ] Inspector shows Frontend pass timing and outputs
- **Verification**: Open inspector UI, see Frontend passes listed

---

## Module Structure Verification

- [ ] `src/compiler/frontend/` directory exists with:
  - `normalize-composites.ts`
  - `normalize-default-sources.ts`
  - `normalize-adapters.ts`
  - `normalize-indexing.ts`
  - `normalize-varargs.ts`
  - `analyze-type-constraints.ts`
  - `analyze-type-graph.ts`
  - `analyze-cycles.ts`
  - `index.ts`

- [ ] `src/compiler/backend/` directory exists with:
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
1. All acceptance criteria checkboxes are checked
2. All module structure files exist
3. No regressions in existing functionality
4. User has manually verified AC3 and AC4
