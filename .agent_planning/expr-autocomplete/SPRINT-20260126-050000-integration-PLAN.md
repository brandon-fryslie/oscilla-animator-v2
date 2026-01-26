# Sprint: integration - ExpressionEditor Autocomplete Integration

Generated: 2026-01-26-050000
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Integrate `SuggestionProvider` and `AutocompleteDropdown` into `ExpressionEditor` component. Add context-aware triggers (after-dot for block.port) and completion insertion.

## Scope

**Deliverables:**
- Hook `AutocompleteDropdown` into ExpressionEditor
- Context-aware trigger detection (after-dot, after identifier)
- Smart insertion (expand suggestion into textarea)
- Keystroke handling (Ctrl+Space to force show)
- Integration tests

## Work Items

### P0: ExpressionEditor Autocomplete State [HIGH]

**Acceptance Criteria:**
- [ ] Add `showAutocomplete: boolean` state to ExpressionEditor
- [ ] Add `suggestionIndex: number` state for keyboard nav
- [ ] Add `cursorPosition: number` state (textarea cursor)
- [ ] Add `filterPrefix: string` state (current identifier prefix)
- [ ] Create `SuggestionProvider` instance in component
- [ ] Update provider when patch changes
- [ ] Unit tests for state management

**Technical Notes:**
```typescript
function ExpressionEditor({ /* props */ }) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [filterPrefix, setFilterPrefix] = useState('');

  const suggestionProvider = useMemo(
    () => new SuggestionProvider(patch, addressRegistry),
    [patch, addressRegistry]
  );

  // ...
}
```

---

### P1: Keystroke Handling [HIGH]

**Acceptance Criteria:**
- [ ] Listen to textarea onChange - extract cursor position
- [ ] Listen to textarea onKeyDown - handle special keys
- [ ] On letter/digit keypress: show autocomplete if identifier active
- [ ] On `.` keypress: show port suggestions for current block
- [ ] On Ctrl+Space: force show all suggestions
- [ ] On ArrowUp/Down: increment/decrement suggestionIndex
- [ ] On Enter: insert selected suggestion
- [ ] On Escape: close autocomplete
- [ ] Unit tests for all keystroke scenarios

**Technical Notes:**
- Extract "current identifier" by scanning backward from cursor
- Track whether cursor is after `.` (block reference context)
- Examples:
  - `sin(|` at `|` → show functions starting with "s"
  - `Circle1.|` at `|` → show ports of Circle1
  - `in0 +|` at `|` → show all suggestions

---

### P2: Suggestion Insertion [MEDIUM]

**Acceptance Criteria:**
- [ ] Calculate insertion position (replace prefix or insert)
- [ ] For functions: insert "sin(" with cursor after opening paren
- [ ] For inputs: insert "in0"
- [ ] For blocks: insert "Block." (trigger port completion)
- [ ] For ports: insert "port"
- [ ] Maintain cursor position after insertion
- [ ] Close autocomplete after insertion
- [ ] Unit tests for all insertion types

**Technical Notes:**
```typescript
function insertSuggestion(
  textarea: HTMLTextAreaElement,
  suggestion: Suggestion,
  filterPrefix: string
): void {
  const start = textarea.selectionStart - filterPrefix.length;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(textarea.selectionStart);

  let insertText = suggestion.label;
  let cursorOffset = insertText.length;

  if (suggestion.type === 'function') {
    // "sin(" → cursor after paren
    cursorOffset = insertText.length - 1;
  }

  textarea.value = before + insertText + after;
  textarea.selectionStart = start + cursorOffset;
  textarea.selectionEnd = textarea.selectionStart;
}
```

---

### P3: Context-Aware Triggers [MEDIUM]

**Acceptance Criteria:**
- [ ] Detect if cursor is in identifier (alphanumeric + underscore)
- [ ] Detect if cursor is after `.` (port completion context)
- [ ] Detect if cursor is at block name position (e.g., `Circle1.`)
- [ ] Show different suggestions based on context
- [ ] After `.` with known block: show only that block's ports
- [ ] After `.` with unknown block: show no suggestions
- [ ] Clear autocomplete when not in valid context
- [ ] Unit tests for context detection

**Technical Notes:**
State machine for context:
```
DEFAULT → (letter) → IDENTIFIER_ACTIVE
IDENTIFIER_ACTIVE → (.) → BLOCK_CONTEXT → (letter) → PORT_CONTEXT
IDENTIFIER_ACTIVE → (space, +, etc) → DEFAULT
```

---

### P4: Integration Tests [HIGH]

**Acceptance Criteria:**
- [ ] Test: Type "si" → shows sin, asin suggestions
- [ ] Test: Type "in" → shows in0-in4 suggestions
- [ ] Test: Type "Circle" → shows Circle1 (if exists in patch)
- [ ] Test: Type "Circle1." → shows ports of Circle1
- [ ] Test: Ctrl+Space → shows all suggestions (no filter)
- [ ] Test: ArrowDown → next suggestion
- [ ] Test: Enter → inserts suggestion
- [ ] Test: Escape → closes autocomplete
- [ ] Test: Typing outside identifier context closes autocomplete
- [ ] Integration test with real patch and registry

---

## Dependencies

- Sprint 1 (Suggestion Provider) COMPLETED
- Sprint 2 (Autocomplete Component) COMPLETED
- ExpressionEditor component (existing)
- AddressRegistry available

## Risks

| Risk | Mitigation |
|------|------------|
| Context detection complex | Straightforward scanning backward for identifiers |
| Cursor position calculation | Already solved in Sprint 2 component |
| Performance on large expressions | Prefix-based filtering is O(n), acceptable |
| User confusion with context switches | Clear visual feedback (different suggestions per context) |

## Integration Points

- Parent: BlockInspector component
- Uses: SuggestionProvider service
- Renders: AutocompleteDropdown component
- Modifies: textarea value on selection
