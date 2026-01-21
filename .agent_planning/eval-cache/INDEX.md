# Eval Cache Index

**Purpose:** Reusable evaluation findings to speed up future work evaluations.

**Last Updated:** 2026-01-21 12:58:00

---

## Available Cache Files

### Runtime Findings

**findings-compilation-inspector.md** [REMOVED - STALE]
- Removed: Modified compile.ts IR generation (sqrt/floor/ceil/round now opcodes)
- Reason: Cache included IR generation patterns for math functions

**runtime-continuity-controls-v2.md** [UPDATED - STALE]
- Scope: continuity-controls-v2
- Status: Implementation complete, all DoD criteria met
- Confidence: STALE (ThemeProvider removed - now inherited from App root)
- Reusable: SliderWithInput component usage, baseTauMs factor application, test pulse patterns
- Key findings: Complete MUI slider migration, base duration control, test pulse feature with visual feedback
- Next evaluation: Check if SliderWithInput.tsx, ContinuityControls.tsx, or ContinuityApply.ts changed

**runtime-unified-defaults.md** [UPDATED - STALE]
- Scope: buses-and-rails/unified-defaults
- Status: Implementation complete, but codebase has unrelated TypeScript errors
- Confidence: STALE (IR types.ts updated 2026-01-21 for OpCode enum)
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

**runtime-unified-inputs.md** [UPDATED - STALE]
- Scope: param-ui-hints/unified-inputs
- Status: COMPLETE (all DoD criteria verified)
- Confidence: STALE (types.ts IR definitions updated 2026-01-21 with OpCode enum additions)
- Reusable: Block registration patterns, exposedAsPort handling, Object.entries iteration patterns
- Key findings: All 14 blocks migrated to Record format, params removed, uiHint works on any input, config-only filtering works correctly
- Next evaluation: Check if InputDef/OutputDef types change, or block registration patterns change


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

### 2026-01-21 12:58:00 - Sprint 3: remove-duplicate-math (kernel-refactor-phase1)
**No cache invalidation needed.**

**Rationale:**
- Modified src/runtime/SignalEvaluator.ts: Removed duplicate math kernel functions
  - Removed: abs, floor, ceil, round, fract, sqrt, exp, log, pow, min, max, clamp, mix, sign
  - Kept: oscSin, oscCos, oscTan, triangle, square, sawtooth (oscillators)
  - Kept: easeInQuad, easeOutQuad, etc. (easing functions)
  - Kept: smoothstep, step (shaping functions)
  - Kept: noise (noise function)
- Updated header comment with LAYER CONTRACT documentation
- No IR generation patterns changed (only runtime evaluation)
- No compiler integration patterns changed
- No existing cache files describe SignalEvaluator.ts kernel implementation patterns

**Impact:**
- Signal kernels now contain only domain-specific functions
- Generic math routed through OpcodeInterpreter (established in Sprint 1)
- Layer separation clearly documented in header comment

### 2026-01-21 12:58:00 - Sprint 2: clean-materializer-map (kernel-refactor-phase1)
**Removed:**
- findings-compilation-inspector.md - IR generation patterns changed

**Marked STALE:**
- runtime-unified-defaults.md - types.ts OpCode enum updated with 9 new opcodes
- runtime-unified-inputs.md - types.ts OpCode enum updated with 9 new opcodes

**Rationale:**
- Modified src/compiler/ir/types.ts: Added Sqrt, Floor, Ceil, Round, Pow, Fract, Exp, Log, Sign to OpCode enum
- Modified src/expr/compile.ts: Changed sqrt/floor/ceil/round from kernel to opcode IR generation
- Modified src/runtime/Materializer.ts: Previously updated with opcode-only applyMap and fieldGoldenAngle in applyKernel
- findings-compilation-inspector.md included compiler IR capture patterns and compile.ts integration
- Cache files referencing types.ts IR definitions marked stale due to OpCode enum changes

**Impact:**
- IR generation for math functions now uses opcode path instead of kernel path
- OpCode enum now complete with all standard math functions
- Materializer.ts map function enforces opcode-only policy

### 2026-01-20 22:19:03 - Compilation Inspector COMPLETE (compilation-inspector)
**Updated:**
- findings-compilation-inspector.md - Marked COMPLETE, all automated quality gates passed

**Status Change:**
- Previous: Implementation complete, 1 TypeScript error blocks build
- Current: COMPLETE - TypeScript error fixed (commit 3ed1525), all tests pass, build succeeds

**Fix Applied:**
- File: src/services/CompilationInspectorService.test.ts:219
- Change: Added `expect(pass).toBeDefined()` before non-null assertion
- Verification: TypeScript passes, 509/509 tests pass, production build succeeds

**Automated Quality Gates (All Passed):**
- TypeScript compilation: 0 errors
- Test suite: 509/509 (47 CompilationInspectorService tests)
- Build: Production bundle 3.1MB
- Code patterns: Matches DebugService singleton

**Optional Runtime Testing (Not Blocking):**
- Q5: Tree render <100ms (LOW risk - standard React)
- Q6: Search <50ms (LOW risk - simple traversal)
- Q7: Memory leaks (LOW risk - bounded snapshots)
- Manual testing checklist (8 steps, UX validation)

### 2026-01-20 22:02:02 - Compilation Inspector (compilation-inspector)
**Added:**
- findings-compilation-inspector.md - Complete implementation with comprehensive tests

**Rationale:**
- New service: CompilationInspectorService (390 lines) with MobX reactivity
- Comprehensive unit tests: 831 lines, 47 tests covering all edge cases
- Compiler integration: 10 capture/lifecycle calls across compile.ts
- UI components: CompilationInspector, IRTreeView, IRNodeDetail
- Panel registration: Added to panelRegistry with 'compilation-inspector' ID
- Known blocker: TypeScript error at test line 219 (type safety issue)

**Impact:**
- New debugging capability: inspect intermediate compilation passes
- Reusable patterns: JSON serialization with circular ref handling
- Service integration pattern: begin/capture/end lifecycle
- Test coverage patterns: 831 lines testing service, serialization, memory bounds

### 2026-01-20 16:00:00 - Unified Shape Foundation (unified-shape-foundation)
**Marked STALE:**
- runtime-unified-inputs.md - primitive-blocks.ts modified with sigShapeRef usage

**Rationale:**
- Implemented unified shape model with topology system
- Modified src/blocks/primitive-blocks.ts: Ellipse/Rect now use sigShapeRef with param signals
- Modified src/compiler/ir/types.ts: Added SigExprShapeRef, updated StepRender with topology + paramSignals
- Modified src/compiler/passes-v2/pass7-schedule.ts: Added resolveShapeInfo() for shape signal resolution
- Modified src/runtime/ScheduleExecutor.ts: Added ShapeDescriptor, evaluates param signals at runtime
- Modified src/render/Canvas2DRenderer.ts: Uses getTopology().render() instead of hardcoded switches
- New files: src/shapes/{types.ts, topologies.ts, registry.ts} define topology system
- Block definition patterns changed: Added rotation and cornerRadius inputs to Ellipse/Rect

**Impact:**
- Primitive shape blocks now have additional inputs (rotation, cornerRadius)
- Compiler IR now has SigExprShapeRef expression type
- Runtime creates ShapeDescriptor objects instead of numeric encodings
- Renderer dispatches to topology render functions instead of switch statements

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

### 2026-01-20 10:55:00 - Path Foundation (path-foundation)
**No cache invalidation needed.**

**Rationale:**
- Added optional controlPointField to SigExprShapeRef (backwards compatible)
- Extended StepRender with optional controlPoints field (backwards compatible)
- Extended RenderPassIR with optional controlPoints field (backwards compatible)
- Added path rendering in Canvas2DRenderer (new capability, doesn't affect existing rendering)
- Modified pass7-schedule.ts resolveShapeInfo() to return controlPointField (extension only)
- Modified ScheduleExecutor to materialize and pass control points (optional path, doesn't affect particle rendering)

**Impact:**
- All changes are additive/optional
- Existing ellipse/rect rendering unchanged
- Path rendering is new capability (doesn't modify existing shape rendering)
- No existing cache files describe these modified files in detail

### 2026-01-20 14:30:00 - Type System Alignment (type-fixes)
**Marked STALE:**
- runtime-unified-inputs.md - types.ts modified with IR type updates

**Rationale:**
- Modified src/compiler/ir/types.ts: Updated all IR types to match IRBuilderImpl implementation
  - SigExprTime: Changed 'mode' to 'which'
  - SigExprExternal: Changed 'sourceId' to 'which'
  - SigExprMap: Changed 'inputs' to 'input' (singular)
  - PureFn: Changed 'op' to 'opcode', added 'kernel' and 'expr' variants
  - FieldExpr*: Added instanceId fields, updated FieldExprZipSig field names
  - EventExpr: Added pulse/wrap/combine/never variants
  - TimeModel: Now imports TimeModelIR with periodAMs/periodBMs
- Modified src/runtime/SignalEvaluator.ts: Updated to use PureFn type properly
- Modified src/runtime/timeResolution.ts: Added time model kind check
- Modified src/ui/components/ConnectionPicker.tsx: Added fallback for undefined port labels

**Impact:**
- IR type definitions now match implementation exactly
- All runtime consumers updated to use correct field names
- Type safety improved (no more 'as any' casts needed)
- TimeModel properly supports phase period configuration
