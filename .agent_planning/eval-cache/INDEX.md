# Eval Cache Index

**Purpose:** Reusable evaluation findings to speed up future work evaluations.

**Last Updated:** 2026-01-20 00:50:00

---

## Available Cache Files

### Runtime Findings

**runtime-continuity-controls-v2.md** [UPDATED - STALE]
- Scope: continuity-controls-v2
- Status: Implementation complete, all DoD criteria met
- Confidence: STALE (MUI component patterns changed - new common controls created, ContinuityControls.tsx refactored with MUI buttons)
- Reusable: SliderWithInput component usage, baseTauMs factor application, test pulse patterns
- Key findings: Complete MUI slider migration, base duration control, test pulse feature with visual feedback
- Next evaluation: Check if SliderWithInput.tsx, ContinuityControls.tsx, or ContinuityApply.ts changed

**runtime-unified-defaults.md**
- Scope: buses-and-rails/unified-defaults
- Status: Implementation complete, but codebase has unrelated TypeScript errors
- Confidence: FRESH
- Reusable: DefaultSource type usage, compiler pass patterns, UI blockType checks
- Key findings: Complete type unification, TimeRoot/derived split in pass1, all tests passing
- Next evaluation: Check if DefaultSource type, pass1, or UI code changed

**runtime-diagnostics-logging.md**
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

**runtime-dual-editor-p0.md**
- Scope: P0 implementation (legacy, superseded by runtime-dual-editor-reactflow-p0.md)
- Status: Structurally complete
- Confidence: STALE (use runtime-dual-editor-reactflow-p0.md instead)

**runtime-dual-editor-p2.md**
- Scope: P2 tab integration + sync
- Status: Structurally complete, runtime verification required
- Confidence: STALE (Tabs.tsx refactored with MUI Button components)
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

## Invalidated Cache

### 2026-01-20 00:50:00 - P2 Button Migration (mui-controls-migration)
**Marked STALE:**
- runtime-continuity-controls-v2.md - ContinuityControls.tsx action buttons migrated to MUI Button
- runtime-dual-editor-p2.md - Tabs.tsx refactored with MUI Button components

**Rationale:**
- 7 component files modified with MUI buttons (Toolbar, Tabs, DiagnosticConsole, ContinuityControls, BlockLibrary, ReactFlowEditor, InspectorContainer)
- Button interaction patterns changed from native to MUI components
- Visual appearance and hover states now use MUI theme

### 2026-01-20 - MUI Controls Migration
**Removed:**
- runtime-ui-store-wiring.md - BlockInspector.tsx completely refactored with MUI components

**Marked STALE:**
- runtime-continuity-controls-v2.md - New common UI control patterns (NumberInput, TextInput, etc.) established

### Sprint 3 - Instance Blocks
**Removed:**
- runtime-block-registry.md - Block registry modified with instance/inferredInstance fields

### 2026-01-19 - Auto-Arrange Layout
**Removed:**
- runtime-dual-editor-reactflow-p0.md - ReactFlowEditor.tsx modified with auto-arrange edge cases
