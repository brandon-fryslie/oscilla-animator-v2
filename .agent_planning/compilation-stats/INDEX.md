# Index: Compilation Statistics Feature

**Feature:** Per-session compilation statistics tracking
**Status:** PLANNING
**Date:** 2026-01-19

---

## Planning Documents

- **PLAN-20260119.md** - Implementation plan with detailed steps
- **DOD-20260119.md** - Definition of done with acceptance criteria
- **CONTEXT-20260119.md** - Background, requirements, technical context

---

## Quick Summary

Add per-session compilation statistics (count, min, max, median, average) displayed in the Diagnostics tab.

**Current State:** CompileEndEvent already tracks `durationMs` but no aggregation
**Target State:** Stats aggregated in DiagnosticsStore, displayed in Console tab

---

## Files to Modify

1. `src/stores/DiagnosticsStore.ts` - Add stats tracking
2. `src/main.ts` - Wire up CompileEnd event subscription
3. `src/ui/components/app/DiagnosticConsole.tsx` - Display stats

---

## Key Decision

**Placement:** Diagnostics tab (Console)
- Compile success/failure already shows there
- Natural "compilation health" location
- Lowest implementation overhead
- Can split to dedicated panel later if needed
