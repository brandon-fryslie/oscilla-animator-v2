# Planning Evaluation: Compiler Frontend/Backend Refactor
**Timestamp**: 2026-01-28  
**Git Commit**: cca7691  
**Topic**: compiler-design-frontend-backend  
**Evaluation Type**: Planning Readiness

---

## Executive Summary

**Planning Status**: READY TO PROCEED  
**Completeness**: 95% - All critical architectural decisions made  
**Blocking Ambiguities**: 0  
**Recommended Action**: CONTINUE with implementation

The planning artifacts (PROPOSAL.md + ALIGNMENT.md) provide a complete architectural specification for splitting the compiler into Frontend (produces TypedPatch + CycleSummary for UI) and Backend (produces CompiledProgramIR for execution). All major ambiguities have been resolved through the alignment process.

---

## 1. Architectural Decisions Assessment

### ✅ COMPLETE: Core Architecture

| Decision Area | Status | Evidence |
|--------------|--------|----------|
| Frontend/Backend boundary | ✅ Defined | ALIGNMENT.md §7 - Clear module structure |
| Frontend outputs | ✅ Defined | TypedPatch + CycleSummary exposed to UI |
| Backend inputs | ✅ Defined | TypedPatch only (must assert backendReady=true) |
| Pass allocation | ✅ Defined | Normalization + Type Analysis → Frontend; Time/Lowering/Schedule → Backend |
| Adapter system | ✅ Defined | Auto-insertion in Frontend, metadata on BlockDef, no separate registry |
| Lens vs Adapter | ✅ Defined | ALIGNMENT.md §4 - Clear classification rules |

**Evidence**:
- PROPOSAL.md §2 defines the complete pipeline structure
- ALIGNMENT.md §7 "Frontend/Backend Boundary (FINAL)" provides definitive pass allocation
- ALIGNMENT.md §4 resolves adapter/lens distinction with concrete examples

### ✅ COMPLETE: Gap Resolution

All 5 gaps identified in early planning have been resolved:

| Gap | Resolution | Location |
|-----|-----------|----------|
| Gap 1: Type system under-specification | CanonicalType (5 axes) + PortValueKind wrapper | ALIGNMENT.md §3.3, §5 Gap 1 |
| Gap 2: Time model placement | Backend derivation, Frontend validation only | ALIGNMENT.md §5 Gap 2 |
| Gap 3: Cycle validation placement | Split: Frontend (classification/diagnostics), Backend (scheduling) | ALIGNMENT.md §5 Gap 3 |
| Gap 4: Event/Field expression types | Preserved as execution representations with wrapper | ALIGNMENT.md §5 Gap 4 |
| Gap 5: Continuity integration | Backend semantics, Frontend optional validation | ALIGNMENT.md §5 Gap 5 |

**Evidence**: ALIGNMENT-GAPS.md contains architect's decisions; ALIGNMENT.md §5 documents all resolutions with "RESOLVED" markers.

### ✅ COMPLETE: Scope Definition

**In Scope** (PROPOSAL.md §0):
- Frontend/Backend split with explicit API boundary
- Adapter auto-insertion as frontend normalization
- TypedPatch + CycleSummary artifacts for UI
- No backend type inference or implicit conversions

**Out of Scope** (explicitly stated):
- Runtime unit conversion
- Backend "helpfulness" or fallback typing
- Hidden edges or implicit coercions
- Default values in lowering functions

**Preserved Features** (ALIGNMENT.md §3):
8 existing systems documented with placement decisions:
1. Time Model System (Pass 3) → Backend
2. Cycle Validation → Split (Frontend classification, Backend scheduling)
3. Extent System (5 axes) → Preserved in full
4. Event Expression System → Preserved
5. Field Expression System → Preserved
6. Continuity System → Backend
7. Instance/Cardinality System → Preserved
8. CompilationInspectorService → Frontend must integrate

**Evidence**: 
- PROPOSAL.md §0 "Scope and non-goals" is explicit
- ALIGNMENT.md §3 "Features NOT Mentioned in Proposal (MUST PRESERVE)" provides exhaustive inventory
- ALIGNMENT.md §6 "Implementation Constraints" lists MUST NOT and MUST DO items

---

## 2. Ambiguity Analysis

### ✅ NO BLOCKING AMBIGUITIES

All original ambiguities resolved:

**Resolved in ALIGNMENT.md §4 (Adapters vs Lenses)**:
- ✅ Definition: Adapters = sensible default + auto-insert; Lenses = user choice required
- ✅ Classification: 13 blocks classified as adapters, 2 as lenses
- ✅ Metadata schema: `adapterSpec` structure defined with from/to patterns
- ✅ Registry approach: Metadata on BlockDef, no separate registry

**Resolved in ALIGNMENT.md §5 (Gaps 1-5)**:
- ✅ Type system: Full 5-axis extent preserved, CanonicalType + PortValueKind wrapper
- ✅ Time model: Backend derivation, Frontend structural validation only
- ✅ Cycles: Split between Frontend (UX) and Backend (execution)
- ✅ Event/Field: Preserved as execution representations
- ✅ Continuity: Backend semantics, Frontend optional validation

**Resolved in ALIGNMENT.md §7 (Clarification Questions)**:
- ✅ All 7 questions marked "RESOLVED" with concrete decisions
- ✅ Frontend/Backend boundary table complete with 9 passes allocated
- ✅ CycleSummary interface defined with SCC structure

### ⚠️ MINOR: Implementation Details

**Non-blocking issues** (can be resolved during implementation):

1. **Diagnostic schema**: ALIGNMENT.md §8 notes "Out of scope - separate initiative"
   - **Impact**: Low - existing DiagnosticEntry system works, just needs Frontend integration
   - **Action**: Use existing system, defer standardization

2. **Origin metadata extent**: ALIGNMENT.md §5 Gap 6 states "No exhaustive origin tracking"
   - **Impact**: Low - Backend already doesn't use origin, proposal's origin.kind can be minimal
   - **Action**: Implement minimal origin tracking for UI audit only

3. **Adapter cost/tie-breaking**: PROPOSAL.md §6.3 requires deterministic selection
   - **Impact**: Low - If multiple adapters match, emit AmbiguousAdapter diagnostic
   - **Action**: Implement during adapter insertion pass

**Why these aren't blocking**:
- All have documented fallback behaviors
- None prevent module boundary definition
- All can use existing codebase patterns

---

## 3. Scope Clarity Assessment

### ✅ EXCELLENT: Work is Decomposable

The planning documents provide clear work breakdown:

**Module Structure** (ALIGNMENT.md §6):
```
src/compiler/
├── frontend/
│   ├── normalize-composites.ts        [Move from graph/passes/pass0]
│   ├── normalize-default-sources.ts   [Move from graph/passes/pass1]
│   ├── normalize-adapters.ts          [Move from graph/passes/pass2]
│   ├── normalize-indexing.ts          [Move from graph/passes/pass3]
│   ├── normalize-varargs.ts           [Move from graph/passes/pass4]
│   ├── analyze-type-constraints.ts    [Move from passes-v2/pass1]
│   ├── analyze-type-graph.ts          [Move from passes-v2/pass2]
│   ├── analyze-cycles.ts              [New: Split from pass5-scc.ts]
│   └── index.ts                       [New: Frontend entry point]
├── backend/
│   ├── derive-time-model.ts           [Move from passes-v2/pass3]
│   ├── derive-dep-graph.ts            [Move from passes-v2/pass4]
│   ├── schedule-scc.ts                [New: Split from pass5-scc.ts]
│   ├── lower-blocks.ts                [Move from passes-v2/pass6]
│   ├── schedule-program.ts            [Move from passes-v2/pass7]
│   └── index.ts                       [New: Backend entry point]
```

**Evidence of decomposability**:
- Each file maps to existing code (10 moves, 4 new files)
- Pass5 split clearly documented (Frontend classification vs Backend scheduling)
- Integration points specified (CompilationInspectorService hooks)

### ✅ EXCELLENT: Testing Strategy

**Testing requirements** (PROPOSAL.md §10):

**Frontend Tests (Must Pass Without Backend)**:
1. Adapter insertion (edge float<deg> → float<rad>)
2. No conversion path (diagnostic + backendReady=false)
3. Ambiguous adapter (diagnostic, no rewrite)
4. Partial solvability (UnresolvedTypeVar, non-blocking)

**Backend Tests**:
1. Compiles graphs with adapter blocks (no special-casing)
2. Rejects graphs with backendReady=false

**Status**: Test scenarios are concrete and verifiable. Frontend tests are independent of backend.

---

## 4. Risk Assessment

### 🟨 MODERATE RISKS (Mitigated)

#### Risk 1: Pass5 (Cycle Validation) Split Complexity
**Description**: Pass5 currently intermingles Frontend concerns (cycle classification for UI) and Backend concerns (SCC decomposition for scheduling).

**Evidence**: 
- `/src/compiler/passes-v2/pass5-scc.ts` contains Tarjan's algorithm
- Used for both "what cycles exist?" (Frontend) and "what execution order?" (Backend)

**Mitigation**:
- ALIGNMENT.md §5 Gap 3 provides clear split criteria
- Rule of thumb: "Frontend answers 'what is the user looking at'; Backend answers 'how to run it'"
- CycleSummary interface defined (SCC + classification + legality + suggestedFixes)

**Residual Risk**: Low - Split is conceptually clear, just requires careful code review

#### Risk 2: CompilationInspectorService Integration
**Description**: Frontend must emit pass snapshots for UI debugging tools.

**Evidence**:
- ALIGNMENT.md §3.8 states "Frontend MUST emit pass snapshots"
- Existing compiler passes call `inspector.recordPassSnapshot()`

**Mitigation**:
- Pattern already exists in codebase
- Frontend passes just need to follow same pattern
- Requirement explicitly documented

**Residual Risk**: Low - Mechanical change

#### Risk 3: Preserving 8 Undocumented Systems
**Description**: Proposal doesn't mention time model, continuity, field expressions, etc.

**Evidence**: ALIGNMENT.md §3 "Features NOT Mentioned in Proposal (MUST PRESERVE)" lists 8 systems

**Mitigation**:
- All 8 systems documented with placement decisions
- ALIGNMENT.md §6 "MUST NOT Do" explicitly prohibits deletion
- Gap resolutions (§5) provide integration rules

**Residual Risk**: Low - Comprehensive preservation plan exists

### 🟩 LOW RISKS

#### Risk 4: Adapter Metadata Migration
**Description**: Need to add `adapterSpec` field to existing adapter BlockDefs.

**Mitigation**: 
- Schema defined in ALIGNMENT.md §4 "BlockDef Adapter Metadata Schema"
- 13 adapter blocks identified for migration
- Non-breaking addition (optional field)

**Residual Risk**: Negligible

#### Risk 5: Stable ID Generation
**Description**: PROPOSAL.md §6.4 requires deterministic adapter node IDs.

**Mitigation**:
- Formula specified: `hash(edgeId, fromPortId, toPortId, adapterBlockTypeId)`
- Existing code in `/src/graph/passes/pass2-adapters.ts` already uses deterministic IDs (`_adapter_${edge.id}`)

**Residual Risk**: Negligible

---

## 5. Unknown/Research Areas

### ✅ NO UNKNOWNS REQUIRING RESEARCH

All technical questions answered:

**Type System**: 
- ✅ 5-axis extent system documented
- ✅ CanonicalType + PortValueKind wrapper defined
- ✅ No new type theory needed

**Cycle Detection**:
- ✅ Tarjan's SCC algorithm already implemented
- ✅ Split criteria clear (classification vs scheduling)
- ✅ No new algorithms needed

**Adapter System**:
- ✅ Insertion logic exists in pass2-adapters.ts
- ✅ Just moving to frontend/ directory
- ✅ Metadata schema defined

**Testing**:
- ✅ Test scenarios concrete (PROPOSAL.md §10)
- ✅ No new testing infrastructure needed
- ✅ Existing test harness can verify

---

## 6. Recommendations

### Immediate Actions (Implementation Phase)

1. **Create directory structure** (5 minutes)
   ```bash
   mkdir -p src/compiler/frontend
   mkdir -p src/compiler/backend
   ```

2. **Move files to frontend/** (1 hour)
   - Move graph/passes/* → frontend/normalize-*.ts
   - Move passes-v2/pass1*.ts → frontend/analyze-type-constraints.ts
   - Move passes-v2/pass2*.ts → frontend/analyze-type-graph.ts

3. **Split pass5-scc.ts** (2 hours)
   - Extract classification logic → frontend/analyze-cycles.ts
   - Extract scheduling logic → backend/schedule-scc.ts
   - Define CycleSummary interface

4. **Move files to backend/** (1 hour)
   - Move passes-v2/pass3*.ts → backend/derive-time-model.ts
   - Move passes-v2/pass4*.ts → backend/derive-dep-graph.ts
   - Move passes-v2/pass6*.ts → backend/lower-blocks.ts
   - Move passes-v2/pass7*.ts → backend/schedule-program.ts

5. **Create entry points** (2 hours)
   - frontend/index.ts: Export frontendNormalize() → TypedPatch + CycleSummary
   - backend/index.ts: Export backendCompile() → CompiledProgramIR

6. **Update compile.ts** (1 hour)
   - Replace direct pass calls with frontend/backend entry points
   - Add backendReady assertion before backend call

7. **Add adapter metadata** (1 hour)
   - Add adapterSpec to 13 adapter BlockDefs
   - Verify adapter selection logic uses metadata

8. **Integration testing** (2 hours)
   - Verify TypedPatch reaches UI
   - Verify CycleSummary reaches UI
   - Run existing test suite
   - Add new frontend-only tests

**Total Estimated Effort**: 10-12 hours (1.5 days)

### Success Criteria

✅ **All existing tests pass** (no regressions)  
✅ **Frontend tests pass without backend** (independence verified)  
✅ **TypedPatch.portTypes available to UI** (primary deliverable)  
✅ **CycleSummary available to UI** (secondary deliverable)  
✅ **Backend rejects incomplete graphs** (contract enforced)  
✅ **CompilationInspectorService shows Frontend passes** (debugging preserved)

---

## 7. Verdict

### ✅ CONTINUE

**Confidence**: HIGH (95%)

**Rationale**:
1. **All architectural decisions made**: Frontend/Backend boundary, pass allocation, adapter system, type system preservation
2. **No blocking ambiguities**: All 5 gaps resolved with concrete decisions
3. **Scope clearly defined**: 14 files to create/move, all mapped to existing code
4. **Risks mitigated**: 3 moderate risks with clear mitigation plans, 2 low risks negligible
5. **No research needed**: All technical questions answered, no unknowns
6. **Work is decomposable**: 8 steps with time estimates, testable increments

**Why not PAUSE**: No ambiguities need clarification. All planning questions have answers.

**Why not BLOCKED**: No dependencies, no unknowns, no technical barriers.

**Next Action**: Begin implementation with step 1 (Create directory structure). Recommend starting with file moves (steps 1-4) before creating new logic (steps 5-8) to minimize risk.

---

## 8. Planning Document Quality

### Strengths

1. **Comprehensive**: PROPOSAL.md covers architecture, invariants, API boundaries, testing, and operational behavior (384 lines, 12 sections)
2. **Evidence-based**: ALIGNMENT.md maps every proposal term to actual codebase locations with file paths and line numbers
3. **Preserves existing functionality**: 8 undocumented systems identified and placement decisions made
4. **Testable**: Concrete test scenarios defined for both Frontend and Backend
5. **Decomposable**: Clear module structure with file-level mapping

### Gaps (Non-blocking)

1. **Diagnostic schema**: Punted to future initiative (acceptable - existing system works)
2. **Origin tracking**: Minimal design, not exhaustive (acceptable - backend doesn't use it)
3. **Tie-breaking rules**: Documented but not detailed (acceptable - emit diagnostic on ambiguity)

### Overall Grade: A (9/10)

**Deductions**:
- -0.5: Diagnostic schema deferred (minor)
- -0.5: Some implementation details left to code review (acceptable for planning phase)

**Strong points**:
- All major decisions resolved
- Comprehensive preservation plan
- Clear success criteria
- Realistic time estimates

---

## Appendix A: Document Cross-Reference

| Document | Purpose | Completeness | Quality |
|----------|---------|--------------|---------|
| PROPOSAL.md | Architectural specification | 100% | Excellent - normative, testable |
| ALIGNMENT.md | Codebase mapping + gap resolution | 100% | Excellent - evidence-based |
| ALIGNMENT-GAPS.md | Architect decisions | 100% | Good - all gaps resolved |
| ALIGNMENT-PATCH.md | Patch notes | N/A | Reference only |
| EXPLORE-20260128-161500.md | Codebase exploration | 100% | Good - factual |

**Status**: All planning artifacts complete and internally consistent.

---

## Appendix B: Key Invariants

From PROPOSAL.md §3:

1. **Visibility Invariant**: All conversions that change type semantics must be explicit nodes in NormalizedGraph
2. **Determinism Invariant**: Same RawGraph + Frontend config → same NormalizedGraph + TypedGraph (stable IDs)
3. **Backend Ignorance Invariant**: Backend cannot branch on "this block was auto-inserted"
4. **Type Soundness Invariant**: Every connected edge in NormalizedGraph is type-correct after Analyze.Types.Final

**Verification**: All 4 invariants are implementable with existing codebase patterns. No new infrastructure needed.

---

**Evaluation Complete**  
**Recommendation**: CONTINUE → Implementation Phase  
**Next Review**: After Frontend entry point implementation (Step 5)
