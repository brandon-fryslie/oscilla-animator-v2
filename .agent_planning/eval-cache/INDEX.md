# Eval Cache Index

**Purpose:** Reusable evaluation findings to speed up future work evaluations.

**Last Updated:** 2026-01-20 07:52:00

---

## Available Cache Files

### Runtime Findings

**runtime-continuity-controls-v2.md** [UPDATED - STALE]
- Scope: continuity-controls-v2
- Status: Implementation complete, all DoD criteria met
- Confidence: STALE (ThemeProvider removed - now inherited from App root)
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

### 2026-01-20 07:52:00 - Unified Inputs Architecture (param-ui-hints)
**Removed:**
- runtime-unit-annotations.md - Contained stale block definition examples using array format

**Rationale:**
- Block definitions migrated from array to Record format (inputs/outputs)
- Old cache showed: `inputs: [{ id: 'x', type: ... }]`
- New format: `inputs: { x: { type: ... } }`
- Test patterns for registerBlock() changed
- Compiler iteration patterns changed (Object.entries() vs array methods)
- Config-only inputs now use exposedAsPort: false

### 2026-01-20 05:48:46 - Sprint 2: Unit Annotation System (unit-safe-types)
**Added:**
- runtime-unit-annotations.md - Complete unit validation system with 8-unit taxonomy (REMOVED 2026-01-20 07:52:00)

**Key Capabilities:**
- NumericUnit type system (phase, radians, normalized, scalar, ms, #, degrees, seconds)
- Pass 2 unit validation (checkUnitCompatibility)
- 28 kernel signatures in kernel-signatures.ts
- Backwards compatible (optional units)
- Zero runtime cost (units erased at compile time)

### 2026-01-20 02:30:00 - Sprint 3: Port Interaction UI (port-interaction)
**Removed:**
- runtime-dual-editor-p2.md - Tabs.tsx no longer relevant after ReactFlow port interaction changes
- runtime-rete-editor.md - OscillaNode.tsx and BlockInspector.tsx significantly modified

**Rationale:**
- OscillaNode.tsx: Added port hover handlers, highlight styling, PortHighlightStore integration
- BlockInspector.tsx: Added ConnectionPicker component, Connect/Disconnect buttons
- New stores: PortHighlightStore.ts for hover state and compatibility checking
- New components: ConnectionPicker.tsx with MUI Autocomplete
- Port interaction patterns completely changed (hover highlighting, connection picker)

**New Capabilities:**
- Port hover highlighting (green glow for compatible, gray for incompatible)
- MUI Autocomplete-based connection picker in Inspector
- Connect/Disconnect buttons for port connections
- Type compatibility checking on hover (using existing validateConnection)

### 2026-01-20 01:15:00 - P3-P4 ThemeProvider Consolidation + Cleanup (mui-controls-migration)
**Marked STALE:**
- runtime-continuity-controls-v2.md - ContinuityControls.tsx ThemeProvider removed
- (All MUI-using components now inherit theme from App root)

**Rationale:**
- Established single ThemeProvider at App.tsx root level
- Removed nested ThemeProviders from ContinuityControls, BlockInspector, ConnectionMatrix
- Theme import pattern changed: only App.tsx imports darkTheme
- All MUI components now inherit theme via React context (no local theme wrappers)
- Architectural improvement: ONE SOURCE OF TRUTH for theme

**Component Theme Strategy:**
- Before: Each component with MUI wrapped itself in `<ThemeProvider theme={darkTheme}>`
- After: Single `<ThemeProvider theme={darkTheme}>` at App root wraps entire app
- Impact: Better performance (no nested contexts), consistent theme inheritance

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

### 2026-01-20 - Sprint 4: Editable Defaults (ui-features-v2)
**Modified (Extended Patterns):**
- runtime-unified-defaults.md - BlockInspector.tsx now has editable Const/TimeRoot defaults

**Rationale:**
- BlockInspector.tsx: Added PortDefaultSourceEditor with special handling for Const and TimeRoot blocks
- New UI patterns: SliderWithInput for Const value params, dropdown for TimeRoot output selection
- Extended pattern: `blockType === 'Const'` checks alongside existing `blockType === 'TimeRoot'` checks
- New feature: Per-instance default source editing via InputPort.defaultSource overrides
- updateInputPort() store method now used for editing default sources

**New Capabilities:**
- Direct editing of Const block default values with SliderWithInput
- TimeRoot output selection via dropdown (tMs, phaseA, phaseB, pulse, palette, energy)
- "Reset to Default" button to clear per-instance overrides
- Simplified UX for common default source types (hides full block type selector)

**Existing Patterns Still Valid:**
- TimeRoot italic styling and color
- DefaultSource type structure
- pass1-default-sources.ts lookup logic (port override → registry default)

**runtime-unified-inputs.md** [NEW - FRESH]
- Scope: param-ui-hints/unified-inputs
- Status: Automated checks COMPLETE, Manual verification PENDING
- Confidence: FRESH
- Reusable: Block registration patterns, exposedAsPort handling, Object.entries iteration patterns
- Key findings: All 14 blocks migrated to Record format, params removed, uiHint works on any input
- Next evaluation: Check if InputDef/OutputDef types change, or block registration patterns change
