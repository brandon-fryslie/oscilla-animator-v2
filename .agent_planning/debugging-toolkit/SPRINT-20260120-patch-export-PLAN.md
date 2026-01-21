# Sprint: patch-export - Patch Export for LLM Context

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Create a one-click patch export that produces a concise, structured markdown representation suitable for pasting into LLM conversations, with clipboard integration and UI trigger.

---

## Scope

**Deliverables:**
1. PatchExporter service with markdown/JSON export
2. Format utilities for shorthand notation
3. Toolbar button + keyboard shortcut (Ctrl+Shift+E)
4. Clipboard integration with toast feedback

**Out of Scope:**
- /export-patch slash command (future integration)
- Auto-include in error reports (future)
- IR snippet inclusion in verbose mode (future)

---

## Work Items

### P0: Core PatchExporter Service

**File:** `src/services/PatchExporter.ts`

**Acceptance Criteria:**
- [ ] `exportToMarkdown(patch, options)` returns structured markdown string
- [ ] Default values are omitted from output (compared against block definitions)
- [ ] Blocks displayed in summary table: ID | Type | Config
- [ ] Connections displayed as arrow notation: `b1.out → b2.in`
- [ ] Compile status included: success indicator or error details
- [ ] Options interface supports: `verbosity`, `includeDefaults`, `includeCompileInfo`

**Technical Notes:**
- Import `getBlockDefinition` from registry for default comparison
- Access `RootStore.diagnosticsStore` for compile status
- Iterate `patch.blocks` (Map) and `patch.edges` (Array)
- Use block IDs as-is (already short: "b1", "b2", etc.)

---

### P1: Format Utilities

**File:** `src/services/exportFormats.ts`

**Acceptance Criteria:**
- [ ] `formatBlockShorthand(block, definition)` → "b1:Array(count=5000)"
- [ ] `formatConnectionLine(edge, blocks)` → "b1.instances → b2.instances"
- [ ] `formatConfigValue(value)` handles primitives, arrays, and objects
- [ ] `isNonDefault(current, default)` correctly identifies non-default values
- [ ] Handles expression strings (e.g., `h=index*0.1`)

**Technical Notes:**
- Expression values are strings containing variable references
- Keep shorthand concise: omit empty parentheses for blocks with all defaults
- Array values: `[1, 2, 3]` format
- Object values: `{x: 1, y: 2}` format

---

### P2: UI Integration - Toolbar Button

**File:** `src/ui/components/app/Toolbar.tsx` (modify existing)

**Acceptance Criteria:**
- [ ] "Export" button added to toolbar (matches existing button style)
- [ ] Button triggers export and clipboard copy
- [ ] Success: Toast "Copied patch to clipboard"
- [ ] Failure: Toast with error message

**Technical Notes:**
- Use MUI Button consistent with existing New/Open/Save buttons
- Consider ContentCopy icon or similar for visual clarity
- Use `navigator.clipboard.writeText()` with async/await

---

### P3: UI Integration - Keyboard Shortcut

**File:** `src/ui/hooks/useKeyboardShortcuts.ts` (create or modify)

**Acceptance Criteria:**
- [ ] Ctrl+Shift+E triggers patch export
- [ ] Same behavior as toolbar button
- [ ] Works when graph editor has focus
- [ ] Doesn't conflict with existing shortcuts

**Technical Notes:**
- Check for existing shortcut handling patterns in codebase
- Prevent default browser behavior (Ctrl+Shift+E may have browser meaning)
- Could integrate into App.tsx or dedicated hook

---

### P4: Toast/Feedback System

**File:** `src/ui/components/app/Toast.tsx` (create if needed)

**Acceptance Criteria:**
- [ ] Shows brief confirmation message (2-3 seconds)
- [ ] Auto-dismisses
- [ ] Positioned consistently (bottom-right or bottom-center)
- [ ] Styled consistently with app theme

**Technical Notes:**
- Use MUI Snackbar component
- Could be global or local to Toolbar
- Check if toast/notification system already exists

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| PatchStore data model | ✓ Exists | Direct access via `patch` property |
| Block Registry | ✓ Exists | `getBlockDefinition()` for defaults |
| DiagnosticsStore | ✓ Exists | Compile status and errors |
| MUI Components | ✓ Available | Button, Snackbar in use |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Block params structure variance | LOW | LOW | Test with multiple block types |
| Clipboard permission denied | LOW | MEDIUM | Show error toast, don't crash |
| Large patch → huge export | LOW | LOW | Accept for now; truncation is future work |

---

## Implementation Order

1. **P1 first** - Format utilities (foundational, pure functions, easy to test)
2. **P0 second** - PatchExporter service (depends on P1)
3. **P4 third** - Toast system (simple, needed for UI feedback)
4. **P2 fourth** - Toolbar button (integrates P0 + P4)
5. **P3 last** - Keyboard shortcut (extends P2 functionality)

---

## Verification Strategy

**Unit Tests:**
- `exportFormats.ts`: Test each format function with various inputs
- `PatchExporter.ts`: Test with mock patches (empty, simple, complex)

**Integration Test:**
- Create test patch, export, verify markdown structure
- Compare actual block values against expected non-default output

**Manual Verification:**
- Load sample patch in UI
- Click Export button → verify clipboard contains valid markdown
- Ctrl+Shift+E → same result
- Paste into Claude conversation → verify LLM can understand the structure
