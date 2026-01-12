# Debugger Audit Checklist (In‑App Debugger UI)

Goal: Make in‑app debugging reliable and actionable without DevTools.

## 1) Diagnostics Visibility (Core)
- [ ] Wire compile/runtime diagnostics into visible UI surfaces.
  - Files: `src/editor/components/DiagnosticBadge.tsx`, `src/editor/diagnostics/*`
  - Acceptance: any compiler/runtime error appears in the app with a clickable reference.
- [ ] Ensure diagnostics auto‑scroll to the relevant block/port.
  - Files: `src/editor/diagnostics/ActionExecutor.ts`
  - Acceptance: clicking a diagnostic focuses the block and highlights the port.

## 2) Debug Probe UI (Core)
- [ ] Add a Debug Probe panel to display probe outputs per frame.
  - Files: `src/editor/components/*` (new panel) + `src/editor/debug/*`
  - Acceptance: probe values update live during playback.
- [ ] Ensure probe slots resolve through `debugIndex`.
  - Files: `src/editor/compiler/ir/patches.ts`, `src/editor/debug/*`
  - Acceptance: no “unknown slot/port” entries in the UI.

## 3) Bus Board Debugging (Core)
- [ ] Show effective combine mode and publisher ordering in Bus Board.
  - Files: `src/editor/BusBoard.tsx`, `src/editor/stores/BusStore.ts`
  - Acceptance: UI displays combine mode and sorted publisher list.
- [ ] Display current bus value (last evaluated frame).
  - Files: `src/editor/runtime/executor/steps/executeBusEval.ts`, `src/editor/stores/DebugStore.ts`
  - Acceptance: live bus values appear without DevTools.

## 4) Render Frame Inspector (High Value)
- [ ] Add a frame inspector pane (passes, counts, buffers present).
  - Files: `src/editor/components/*` + `src/editor/runtime/executor/steps/executeRenderAssemble.ts`
  - Acceptance: see pass count, instance count, and missing buffers.
- [ ] Provide a “zero output” warning when passes are empty.
  - Acceptance: app tells the user why nothing is drawn.

## 5) Runtime State Summary (High Value)
- [ ] Display runtime frameId, timeModel kind, and slotMeta counts.
  - Files: `src/editor/stores/DebugStore.ts`, `src/editor/components/*`
  - Acceptance: summary updates each frame.

## 6) In‑App Actions (Nice‑to‑Have)
- [ ] “Copy IR JSON” button in debug panel.
- [ ] “Reset runtime caches” button.
- [ ] “Freeze frame” toggle for inspection.

## 7) Manual Validation
- [ ] Load a patch with signal + field + render sink.
- [ ] Confirm:
  - Diagnostics show up in‑app, not just console.
  - Debug probe values update in real time.
  - Bus Board shows combine mode + live value.
  - Frame Inspector reports non‑empty passes.
