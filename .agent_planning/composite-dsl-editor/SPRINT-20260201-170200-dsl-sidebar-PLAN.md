# Sprint: dsl-sidebar — Composite DSL Text Sidebar

Generated: 2026-02-01T17:02:00
Confidence: HIGH: 2, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Add a collapsible DSL text sidebar to the CompositeEditor that stays in sync with the visual graph editor. Editing the DSL updates the graph; editing the graph updates the DSL.

## Scope

### P0: DSL Sidebar Component
- New component: `CompositeEditorDslSidebar.tsx`
- Textarea (or code editor) showing HCL representation of current composite
- Sidebar within the CompositeEditor layout (not a separate dockview panel)
- Collapsible: toggle button to show/hide
- When visible, takes ~30-40% width on the right side of the editor

**Acceptance Criteria:**
- [ ] Sidebar renders inside CompositeEditor when toggled open
- [ ] Contains a text area with the current composite HCL
- [ ] Toggle button in CompositeEditor header to show/hide sidebar
- [ ] Sidebar is hidden by default (visual editor is primary)

### P0: Graph → DSL Sync (Reactive)
- The sidebar text auto-updates when the visual graph changes
- Uses MobX reactivity: observe CompositeEditorStore, call `toHCL()`, update textarea
- Debounce: brief delay (200ms) to avoid excessive serialization during drag

**Acceptance Criteria:**
- [ ] Adding/removing blocks in visual editor updates DSL text
- [ ] Adding/removing edges in visual editor updates DSL text
- [ ] Exposing/unexposing ports updates DSL text
- [ ] Changing metadata (name, label, etc.) updates DSL text
- [ ] Updates are debounced to avoid jank during rapid edits

### P1: DSL → Graph Sync (User-Initiated)
- When user edits the textarea and commits (blur, Ctrl+Enter, or "Apply" button)
- Call `fromHCL()` on the store to parse and apply
- On error: show inline error markers, don't apply changes
- On success: visual graph updates to match

**Acceptance Criteria:**
- [ ] Editing DSL text and committing updates the visual graph
- [ ] Parse errors shown inline (below textarea or as overlay)
- [ ] Invalid DSL does not corrupt editor state
- [ ] Pasting a complete composite DSL works (full replacement)

#### Unknowns to Resolve (MEDIUM confidence)
- **Debounce vs explicit apply**: Should DSL→graph sync happen on every keystroke (debounced), or only on explicit action (blur/button)?
  - Recommendation: Explicit action (blur or button). Keystroke-level sync is fragile — intermediate states are often invalid HCL.
- **Cursor/scroll preservation**: After graph→DSL re-render, should textarea cursor position be preserved?
  - Recommendation: Don't preserve cursor for now. Graph→DSL rewrites the entire text. This is a polish item.
- **Code editor vs textarea**: Plain textarea, or a code editor (CodeMirror, Monaco)?
  - Recommendation: Plain textarea for Sprint 1. Code editor with syntax highlighting is a future enhancement.

#### Exit Criteria for MEDIUM items
- Decide apply-mode (explicit vs keystroke) before implementation
- Answer confirmed by user or defaulted to recommendation

## Dependencies
- Sprint 1 (composite-dsl) must be complete first
- CompositeEditorStore.toHCL() and fromHCL() must be working

## Technical Notes
- CompositeEditor.tsx currently has a two-column layout: canvas (left) + port exposure panel (right)
- The DSL sidebar would be a third column or replace/share with the port exposure panel
- CSS: use flex layout with collapsible sidebar
- The port exposure panel could potentially move INTO the DSL (exposed ports are declared in HCL) — but keep the visual panel for now since it's checkbox-driven

## Risks
- **Text cursor loss**: Every graph change rewrites the textarea content. If user is mid-edit, their cursor jumps. Mitigation: only auto-update when textarea is not focused.
- **Conflict resolution**: If user edits DSL while also editing graph visually, changes collide. Mitigation: when DSL sidebar is focused, graph changes queue; on blur, DSL takes priority (last-write-wins).
