# Rendering Bug Investigation

**Date:** 2026-02-06  
**Status:** Investigation Complete, Implementation Pending  
**Total Bugs Found:** 15 (8 Critical, 5 High Priority, 2 Medium)

---

## Quick Start

**New to this investigation?** Start here:
1. Read [SUMMARY.md](./SUMMARY.md) — Executive summary (5 min read)
2. Check [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) — Diagnostic checklist
3. See [00-INDEX.md](./00-INDEX.md) — Full bug index

**Ready to fix bugs?** See implementation roadmap in [SUMMARY.md](./SUMMARY.md)

---

## Investigation Documents

### Overview
- **[README.md](./README.md)** ← You are here
- **[SUMMARY.md](./SUMMARY.md)** — Executive summary with roadmap
- **[00-INDEX.md](./00-INDEX.md)** — Complete bug index with links
- **[QUICK-REFERENCE.md](./QUICK-REFERENCE.md)** — Developer quick reference

### Detailed Analysis
- **[01-initial-investigation.md](./01-initial-investigation.md)** — Renderer, assembler, camera
- **[02-projection-kernel-analysis.md](./02-projection-kernel-analysis.md)** — Projection bugs (5 critical)
- **[03-arena-and-shape-analysis.md](./03-arena-and-shape-analysis.md)** — Arena, topologies
- **[04-nan-propagation-analysis.md](./04-nan-propagation-analysis.md)** — Math opcodes (4 critical)

---

## Bug Categories

### 🔥 Critical (Total Rendering Failure)
- Degenerate camera (2 bugs)
- Math opcode NaN/Inf (4 bugs)
- Double rotation (1 bug)
- normalizedIndex count=1 (1 bug)

**Total:** 8 bugs → Fix in Phase 1

### ⚠️ High Priority (Wrong Visuals)
- Depth sorting issues (2 bugs)
- Canvas state leakage (1 bug)
- Buffer validation (1 bug)
- pow domain violation (1 bug)

**Total:** 5 bugs → Fix in Phase 2

### ⚠️ Medium Priority (Performance/Quality)
- Redundant operations (1 bug)
- NaN validation in topologies (1 bug)

**Total:** 2 bugs → Fix in Phase 3

---

## Files Affected

### Will Need Changes
```
src/projection/perspective-kernel.ts   — 40 lines (Phase 1)
src/projection/ortho-kernel.ts         — 20 lines (Phase 1)
src/runtime/ValueExprMaterializer.ts   — 60 lines (Phase 1, 3)
src/shapes/topologies.ts               — 20 lines (Phase 2)
src/runtime/CameraResolver.ts          — 10 lines (Phase 2)
src/runtime/RenderAssembler.ts         — 20 lines (Phase 3)
src/render/canvas/Canvas2DRenderer.ts  — 15 lines (Phase 3)
src/shapes/types.ts                    — 5 lines (Phase 3)
```

**Total:** 8 files, ~190 lines changed

---

## Test Coverage

### Regression Tests Needed
- 10 tests for Phase 1 (math opcodes, projection)
- 5 tests for Phase 2 (rotation, depth sorting)
- 5 tests for Phase 3 (validation, sanitization)

**Total:** ~20 new tests

---

## Implementation Estimate

| Phase | Duration | Risk | Priority |
|-------|----------|------|----------|
| Phase 1: Critical NaN/Inf | 2-3 hours | Low | High |
| Phase 2: Correctness | 1-2 hours | Low | Medium |
| Phase 3: Validation | 2-3 hours | Medium | Low |
| **Total** | **5-8 hours** | **Low-Medium** | — |

---

## Next Actions

**Awaiting user approval to:**
1. Implement Phase 1 fixes (critical bugs)
2. Add regression tests
3. Verify user testing
4. Proceed to Phase 2-3

**Ready to start immediately upon approval.**

---

## Contact

Questions? See:
- [SUMMARY.md](./SUMMARY.md) for policy decisions
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) for diagnostic help
- [00-INDEX.md](./00-INDEX.md) for specific bug details

---

**Investigation Complete. Ready to Fix.**
