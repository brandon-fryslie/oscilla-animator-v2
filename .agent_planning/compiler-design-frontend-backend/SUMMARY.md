# Compiler Frontend/Backend Refactor - Summary

**Topic**: compiler-design-frontend-backend  
**Status**: READY FOR IMPLEMENTATION  
**Created**: 2026-01-28

---

## One-Line Summary

Split compiler into Frontend (TypedPatch + CycleSummary for UI) and Backend (CompiledProgramIR for execution).

---

## Primary Deliverables

1. **TypedPatch.portTypes exposed to UI** - Resolved concrete types for every port
2. **CycleSummary exposed to UI** - Cycle classification with suggested fixes
3. **Clean frontend/backend module boundary** - Backend has no knowledge of block origins

---

## Scope

| In Scope | Out of Scope |
|----------|--------------|
| File reorganization into frontend/backend | Runtime unit conversion |
| Pass5 (cycles) split | Diagnostic system overhaul |
| Adapter metadata on BlockDef | Backend "helpfulness" |
| Frontend entry point API | Hidden edges or implicit coercions |
| UI type exposure | |

---

## Effort Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Directory & File Moves | 2 hours |
| Phase 2: Pass5 Split | 2 hours |
| Phase 3: Backend Moves | 1 hour |
| Phase 4: Entry Points | 2 hours |
| Phase 5: Adapter Metadata | 1 hour |
| Phase 6: UI Integration | 1 hour |
| Phase 7: Testing | 2 hours |
| **Total** | **10-12 hours** |

---

## Key Decision Log

| Decision | Resolution | Reference |
|----------|------------|-----------|
| Adapter vs Lens distinction | Keep separate; adapters auto-insert, lenses require user choice | ALIGNMENT.md §4 |
| Adapter registry | No separate registry; metadata on BlockDef | ALIGNMENT.md §4 |
| Time model placement | Backend (frontend validates presence only) | ALIGNMENT.md §5 Gap 2 |
| Cycle validation placement | Split: frontend classifies, backend schedules | ALIGNMENT.md §5 Gap 3 |
| Type system | Full 5-axis extent + PortValueKind wrapper | ALIGNMENT.md §3.3, §5 Gap 1 |
| Origin tracking | None; backend receives no origin info | ALIGNMENT.md §5 Gap 6 |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pass5 split complexity | Medium | Clear split criteria in ALIGNMENT.md §5 Gap 3 |
| CompilationInspectorService integration | Low | Pattern exists; mechanical change |
| Preserving 8 undocumented systems | Low | Comprehensive preservation plan in ALIGNMENT.md §3 |

---

## Documents

| Document | Purpose |
|----------|---------|
| `PROPOSAL.md` | Architectural specification (normative) |
| `ALIGNMENT.md` | Codebase mapping + all gap resolutions |
| `PLAN.md` | Implementation workplan with checkboxes |
| `EVALUATION-20260128.md` | Planning readiness evaluation |

---

## Next Action

Begin implementation with Phase 1, Step 1.1: Create `src/compiler/frontend/` directory.
