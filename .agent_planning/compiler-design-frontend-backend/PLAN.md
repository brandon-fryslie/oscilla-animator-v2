# Implementation Plan: Compiler Frontend/Backend Refactor

**Created**: 2026-01-28  
**Status**: READY FOR IMPLEMENTATION  
**Confidence**: 95%  
**Estimated Effort**: 10-12 hours (1.5 days)

---

## Goal

Split the compiler into **Frontend** (produces `TypedPatch` + `CycleSummary` for UI) and **Backend** (produces `CompiledProgramIR` for execution), with a clean API boundary and no backend knowledge of block origins.

---

## Success Criteria

- [ ] All existing tests pass (no regressions)
- [ ] Frontend tests pass without backend (independence verified)
- [ ] `TypedPatch.portTypes` available to UI (primary deliverable)
- [ ] `CycleSummary` available to UI (secondary deliverable)
- [ ] Backend rejects incomplete graphs (`backendReady=false`)
- [ ] CompilationInspectorService shows Frontend passes

---

## Workplan

### Phase 1: Directory Structure & File Moves

- [ ] **1.1** Create `src/compiler/frontend/` directory
- [ ] **1.2** Create `src/compiler/backend/` directory
- [ ] **1.3** Move `src/graph/passes/pass0-composites.ts` → `src/compiler/frontend/normalize-composites.ts`
- [ ] **1.4** Move `src/graph/passes/pass1-default-sources.ts` → `src/compiler/frontend/normalize-default-sources.ts`
- [ ] **1.5** Move `src/graph/passes/pass2-adapters.ts` → `src/compiler/frontend/normalize-adapters.ts`
- [ ] **1.6** Move `src/graph/passes/pass3-indexing.ts` → `src/compiler/frontend/normalize-indexing.ts`
- [ ] **1.7** Move `src/graph/passes/pass4-varargs.ts` → `src/compiler/frontend/normalize-varargs.ts`
- [ ] **1.8** Move `src/compiler/passes-v2/pass1-type-constraints.ts` → `src/compiler/frontend/analyze-type-constraints.ts`
- [ ] **1.9** Move `src/compiler/passes-v2/pass2-types.ts` → `src/compiler/frontend/analyze-type-graph.ts`

### Phase 2: Pass5 Split (Cycles)

- [ ] **2.1** Extract cycle classification logic from `src/compiler/passes-v2/pass5-scc.ts` → `src/compiler/frontend/analyze-cycles.ts`
- [ ] **2.2** Define `CycleSummary` interface in `src/compiler/frontend/analyze-cycles.ts`
- [ ] **2.3** Keep/move scheduling SCC logic → `src/compiler/backend/schedule-scc.ts`
- [ ] **2.4** Update imports in both files

### Phase 3: Backend File Moves

- [ ] **3.1** Move `src/compiler/passes-v2/pass3-time.ts` → `src/compiler/backend/derive-time-model.ts`
- [ ] **3.2** Move `src/compiler/passes-v2/pass4-depgraph.ts` → `src/compiler/backend/derive-dep-graph.ts`
- [ ] **3.3** Move `src/compiler/passes-v2/pass6-block-lowering.ts` → `src/compiler/backend/lower-blocks.ts`
- [ ] **3.4** Move `src/compiler/passes-v2/pass7-schedule.ts` → `src/compiler/backend/schedule-program.ts`

### Phase 4: Entry Points & Integration

- [ ] **4.1** Create `src/compiler/frontend/index.ts` - exports `compileFrontend()` → `{ typedPatch: TypedPatch, cycleSummary: CycleSummary, backendReady: boolean }`
- [ ] **4.2** Create `src/compiler/backend/index.ts` - exports `compileBackend()` → `CompiledProgramIR`
- [ ] **4.3** Update `src/compiler/compile.ts` to use frontend/backend entry points
- [ ] **4.4** Add `backendReady` assertion before calling backend
- [ ] **4.5** Integrate Frontend passes with `CompilationInspectorService`

### Phase 5: Adapter Metadata

- [ ] **5.1** Define `AdapterSpec` type in `src/blocks/registry.ts`
- [ ] **5.2** Add `adapterSpec` field to adapter BlockDefs (12 adapters)
- [ ] **5.3** Update `findAdapter()` to use BlockDef metadata instead of `ADAPTER_RULES` array
- [ ] **5.4** Remove or deprecate `src/graph/adapters.ts` `ADAPTER_RULES` array

### Phase 6: UI Integration

- [ ] **6.1** Expose `TypedPatch.portTypes` to UI layer
- [ ] **6.2** Expose `CycleSummary` to UI layer
- [ ] **6.3** Update `findCompatibleLenses()` to use resolved types from `TypedPatch`

### Phase 7: Testing & Validation

- [ ] **7.1** Run existing test suite - verify no regressions
- [ ] **7.2** Add Frontend-only test: adapter insertion without backend
- [ ] **7.3** Add Frontend-only test: cycle classification without backend
- [ ] **7.4** Add Backend test: rejects `backendReady=false`
- [ ] **7.5** Manual test: UI shows resolved port types
- [ ] **7.6** Manual test: UI shows cycle diagnostics

---

## Key Interfaces

### Frontend Output

```typescript
interface FrontendResult {
  typedPatch: TypedPatch;
  cycleSummary: CycleSummary;
  diagnostics: DiagnosticEntry[];
  backendReady: boolean;  // false if unresolved types or illegal cycles
}
```

### CycleSummary

```typescript
interface CycleSummary {
  sccs: SCC[];
}

interface SCC {
  id: string;
  blocks: BlockId[];
  classification: 'acyclic' | 'trivial-self-loop' | 'cyclic';
  legality: 'legal-feedback' | 'instantaneous-illegal';
  suggestedFixes?: { edgeId: string; suggestion: 'insert-delay' | 'insert-history' }[];
}
```

### ResolvedPortType

```typescript
interface ResolvedPortType {
  kind: PortValueKind;  // 'sig' | 'field' | 'event'
  type: CanonicalType;  // payload + unit + extent (all 5 axes)
}
```

---

## File Mapping

| Source | Destination | Action |
|--------|-------------|--------|
| `src/graph/passes/pass0-composites.ts` | `src/compiler/frontend/normalize-composites.ts` | Move |
| `src/graph/passes/pass1-default-sources.ts` | `src/compiler/frontend/normalize-default-sources.ts` | Move |
| `src/graph/passes/pass2-adapters.ts` | `src/compiler/frontend/normalize-adapters.ts` | Move |
| `src/graph/passes/pass3-indexing.ts` | `src/compiler/frontend/normalize-indexing.ts` | Move |
| `src/graph/passes/pass4-varargs.ts` | `src/compiler/frontend/normalize-varargs.ts` | Move |
| `src/compiler/passes-v2/pass1-type-constraints.ts` | `src/compiler/frontend/analyze-type-constraints.ts` | Move |
| `src/compiler/passes-v2/pass2-types.ts` | `src/compiler/frontend/analyze-type-graph.ts` | Move |
| `src/compiler/passes-v2/pass5-scc.ts` | Split → `frontend/analyze-cycles.ts` + `backend/schedule-scc.ts` | Split |
| `src/compiler/passes-v2/pass3-time.ts` | `src/compiler/backend/derive-time-model.ts` | Move |
| `src/compiler/passes-v2/pass4-depgraph.ts` | `src/compiler/backend/derive-dep-graph.ts` | Move |
| `src/compiler/passes-v2/pass6-block-lowering.ts` | `src/compiler/backend/lower-blocks.ts` | Move |
| `src/compiler/passes-v2/pass7-schedule.ts` | `src/compiler/backend/schedule-program.ts` | Move |
| — | `src/compiler/frontend/index.ts` | Create |
| — | `src/compiler/backend/index.ts` | Create |

---

## Constraints

### MUST NOT Do
1. Do not rename existing types/functions unless explicitly approved
2. Do not delete time model, continuity, field expressions, or other preserved systems
3. Do not remove extent axes from type system
4. Do not merge event/field expressions into signals
5. Do not break CompilationInspectorService hooks

### MUST Do
1. Preserve all compiler functionality (reorganized into frontend/backend)
2. Move graph normalization passes into `src/compiler/frontend/`
3. Expose `TypedPatch.portTypes` to UI
4. Expose `CycleSummary` to UI
5. Integrate frontend passes with CompilationInspectorService

---

## References

- `PROPOSAL.md` - Architectural specification
- `ALIGNMENT.md` - Codebase mapping and gap resolutions
- `EVALUATION-20260128.md` - Planning evaluation (verdict: CONTINUE)
