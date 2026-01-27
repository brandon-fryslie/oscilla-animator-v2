# User Response: Reusable Graph Editor Plan

**Date:** 2026-01-27
**Status:** DECISIONS CAPTURED

## User Decisions

### Tab Model
- **Decision:** Tabs in center Dockview panel group
- Patch tabs: "Patch - \<patch name\>"
- Composite editor tabs: "Edit Block - \<composite block name\>"
- Both coexist in same tab group (alongside Table, Matrix)

### Multiple Instances
- **Decision:** YES - can have multiple of each
- Multiple patch tabs open simultaneously
- Multiple composite editor tabs open simultaneously

### Runtime
- **Decision:** Multiple runtimes WILL be supported
- For this initiative: Design the Patch Editor ↔ Runtime API
- Actual multi-runtime implementation: Deferred to separate initiative
- Goal: Don't create architecture that blocks multi-runtime

## Updated Plan Status

| Sprint | Original Status | Updated Status |
|--------|-----------------|----------------|
| adapter-interface | READY | READY (unchanged) |
| unified-editor-core | PARTIALLY READY | PARTIALLY READY (unchanged) |
| multi-patch-support | RESEARCH REQUIRED | READY FOR IMPLEMENTATION |

## Approved Files

- [x] SPRINT-2026-01-27-120000-adapter-interface-PLAN.md
- [x] SPRINT-2026-01-27-120000-adapter-interface-DOD.md
- [x] SPRINT-2026-01-27-121000-unified-editor-core-PLAN.md
- [x] SPRINT-2026-01-27-121000-unified-editor-core-DOD.md
- [x] SPRINT-2026-01-27-122000-multi-patch-support-PLAN.md (updated)
- [x] SPRINT-2026-01-27-122000-multi-patch-support-DOD.md (updated)

## Next Steps

1. Start Sprint 1 (adapter-interface) - all HIGH confidence
2. Continue to Sprint 2 (unified-editor-core)
3. Complete Sprint 3 (multi-patch-support)
4. Runtime API design informs future multi-runtime sprint
