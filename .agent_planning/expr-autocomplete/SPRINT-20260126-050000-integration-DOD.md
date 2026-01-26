# Definition of Done: integration

Generated: 2026-01-26-050000
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260126-050000-integration-PLAN.md

## Acceptance Criteria

### ExpressionEditor State Management

- [ ] showAutocomplete, suggestionIndex, cursorPosition state added
- [ ] filterPrefix state tracks current identifier
- [ ] SuggestionProvider created and memoized
- [ ] Provider recreated when patch or registry changes
- [ ] Unit tests for state management

### Keystroke Handling

- [ ] onChange: extract cursor position and update state
- [ ] onKeyDown: handle all special keys
- [ ] Letter/digit: show autocomplete if in identifier
- [ ] Dot (.): show port suggestions for block context
- [ ] Ctrl+Space: force show all suggestions
- [ ] ArrowUp/Down: navigate suggestions
- [ ] Enter: insert selected suggestion
- [ ] Escape: close autocomplete
- [ ] Unit tests for all keystroke scenarios

### Suggestion Insertion

- [ ] Calculate insertion position correctly
- [ ] Insert function name with opening paren
- [ ] Insert input names (in0-in4)
- [ ] Insert block references (e.g., "Circle1.")
- [ ] Insert port names after dot
- [ ] Maintain cursor position after insertion
- [ ] Close autocomplete after insertion
- [ ] Unit tests for all insertion types

### Context-Aware Triggers

- [ ] Detect identifier context (alphanumeric + _)
- [ ] Detect block context (after dot)
- [ ] Detect port context (after block.)
- [ ] Show appropriate suggestions per context
- [ ] Clear autocomplete when context invalid
- [ ] Unit tests for context detection

### Integration Tests

- [ ] Typing "si" shows sin, asin
- [ ] Typing "in" shows in0-in4
- [ ] Typing block name shows matching blocks
- [ ] Typing "Block." shows block ports
- [ ] Ctrl+Space shows all suggestions
- [ ] Navigation with arrow keys works
- [ ] Enter inserts selection
- [ ] Escape closes dropdown
- [ ] Autocomplete closes when typing outside identifier
- [ ] Full end-to-end integration test

### Visual & UX

- [ ] Autocomplete appears near cursor
- [ ] No layout shift when dropdown appears/disappears
- [ ] Dark theme matches BlockInspector
- [ ] Accessibility: keyboard navigation fully functional
- [ ] No console errors or warnings

### Integration Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all integration tests)
- [ ] ExpressionEditor works with and without autocomplete
- [ ] No regressions in existing expression functionality
- [ ] Ready for user testing

### Documentation

- [ ] JSDoc on ExpressionEditor changes
- [ ] Comments explaining context detection logic
- [ ] Comments explaining insertion logic
- [ ] README or inline docs on autocomplete behavior
