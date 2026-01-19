# Eval Cache Index

**Purpose:** Reusable evaluation findings to speed up future work evaluations.

**Last Updated:** 2026-01-18 04:47:21

---

## Available Cache Files

### Runtime Findings

**runtime-diagnostics-logging.md** [NEW]
- Scope: compilation-pipeline/diagnostics-logging
- Status: Architecture verified sound, UI verification pending
- Confidence: FRESH
- Reusable: Diagnostic flow architecture, MobX reactivity chain, patchId consistency verification
- Key findings: Complete event flow verified, 55+ debug logs added, all unit tests pass
- Next evaluation: User should verify browser UI or accept based on code quality

**runtime-dockview-integration.md**
- Scope: Dockview integration (foundation sprint)
- Status: Critical integration requirements documented
- Confidence: FRESH
- Reusable: CSS import requirements, theme class setup, panel wrapper patterns, layout creation patterns
- Key findings: Missing CSS import and theme class block runtime rendering
- Next evaluation: After fixes applied, verify visual layout + tab switching

**runtime-dual-editor-reactflow-p0.md**
- Scope: P0 directory restructure + EditorHandle abstraction
- Status: Structurally complete, runtime verification pending
- Confidence: FRESH
- Reusable: Structural verification approach, risk assessment
- Next evaluation: Check if files changed before re-verifying

**runtime-dual-editor-p0.md**
- Scope: P0 implementation (legacy, superseded by runtime-dual-editor-reactflow-p0.md)
- Status: Structurally complete
- Confidence: STALE (use runtime-dual-editor-reactflow-p0.md instead)

**runtime-dual-editor-p2.md**
- Scope: P2 tab integration + sync
- Status: Structurally complete, runtime verification required
- Confidence: FRESH
- Reusable: Tab switching patterns, sync infrastructure verification, EditorContext management
- Next evaluation: Manual runtime testing needed, or check if sync.ts/App.tsx/Tabs.tsx changed

---

## Cache Maintenance

**Add new cache files when:**
- Discovering reusable runtime behavior patterns
- Finding break-it test patterns that revealed bugs
- Completing data flow verification for a scope

**Update existing files when:**
- Previous findings change (new runtime behavior discovered)
- Confidence level changes (files modified, re-verified)

**Don't cache:**
- Specific verdicts (COMPLETE/INCOMPLETE) - point-in-time only
- Test pass/fail counts - re-run to verify
- Bug details - keep in WORK-EVALUATION files

---

## Invalidated Cache (Sprint 3 - Instance Blocks)

**Removed:**
- runtime-block-registry.md - Block registry modified with instance/inferredInstance fields
