# Sprint: autocomplete-component - Autocomplete Dropdown UI

Generated: 2026-01-26-040000
Confidence: HIGH: 3, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Build the `AutocompleteDropdown` React component that displays suggestions and handles keyboard navigation. Component listens to textarea input events and shows/hides suggestions intelligently.

## Scope

**Deliverables:**
- `AutocompleteDropdown` component for React
- Keyboard navigation (arrow keys, Enter, Escape)
- Mouse selection and hover state
- Positioning relative to cursor in textarea
- Integration with ExpressionEditor component
- Comprehensive component tests

## Work Items

### P0: Autocomplete Component Structure [HIGH]

**Acceptance Criteria:**
- [ ] `AutocompleteDropdown` component in `src/ui/expression-editor/AutocompleteDropdown.tsx`
- [ ] Props: `suggestions`, `selectedIndex`, `onSelect`, `isVisible`, `position`
- [ ] Renders `<div>` with suggestion items
- [ ] Supports empty state gracefully
- [ ] Dark theme compatible (matches BlockInspector styling)
- [ ] z-index high enough to appear above textarea
- [ ] Unit tests for rendering

**Technical Notes:**
```typescript
interface AutocompleteDropdownProps {
  readonly suggestions: readonly Suggestion[];
  readonly selectedIndex: number;
  readonly onSelect: (suggestion: Suggestion) => void;
  readonly isVisible: boolean;
  readonly position: { top: number; left: number };
}
```

---

### P1: Keyboard Navigation [HIGH]

**Acceptance Criteria:**
- [ ] ArrowUp/ArrowDown moves selection in suggestion list
- [ ] Home/End jump to first/last suggestion
- [ ] Enter key calls onSelect with selected suggestion
- [ ] Escape key closes dropdown (calls onClose callback)
- [ ] Selection wraps at boundaries (down from last goes to first)
- [ ] Tab key closes dropdown (allows tab out)
- [ ] Unit tests for all key combinations

**Technical Notes:**
- Component manages `selectedIndex` via props
- Parent (ExpressionEditor) handles state
- Component is controlled, not stateful

---

### P2: Mouse Interaction [HIGH]

**Acceptance Criteria:**
- [ ] Hover over suggestion highlights it (visual feedback)
- [ ] Click on suggestion calls onSelect
- [ ] Mouse position tracked for hover effect
- [ ] Clicks outside dropdown can close it (parent responsibility)
- [ ] Scroll with mouse wheel in long lists
- [ ] Unit tests for mouse interactions

**Technical Notes:**
- Max visible items: 10 (scrollable if more)
- Hover effect: background color change, pointer cursor

---

### P3: Cursor Position Calculation [MEDIUM]

**Acceptance Criteria:**
- [ ] Position dropdown near cursor in textarea
- [ ] Calc: measure cursor position (pixel offset from textarea top-left)
- [ ] Place dropdown below cursor (or above if near bottom)
- [ ] Dropdown stays within viewport bounds
- [ ] Updates position on scroll (parent handles)
- [ ] Works with any textarea width

**Technical Notes:**
Position calculation uses "measurement div" technique:
- Create invisible div with same font/size as textarea
- Copy text up to cursor
- Measure div to get pixel position
- Calculate dropdown position relative to viewport

```typescript
function getCursorPosition(textarea: HTMLTextAreaElement, cursorPos: number) {
  const measurer = createMeasurerDiv(textarea);
  measurer.textContent = textarea.value.substring(0, cursorPos);
  const rect = measurer.getBoundingClientRect();
  return { top: rect.height, left: rect.left };
}
```

---

### P4: Suggestion Rendering [HIGH]

**Acceptance Criteria:**
- [ ] Each suggestion renders with: label, description (optional), type icon
- [ ] Type icons: f(x) for functions, in for inputs, ◆ for blocks, . for ports
- [ ] Alternating row colors for visual separation
- [ ] Truncate long descriptions (80 chars max)
- [ ] Hover highlights row with subtle background
- [ ] Selected row highlighted distinctly
- [ ] Unit tests for rendering variations

---

## Dependencies

- Sprint 1 (Suggestion Provider) - data service
- React and JSX support (already in project)
- ExpressionEditor component (existing, needs integration)

## Risks

| Risk | Mitigation |
|------|------------|
| Cursor position calculation complex | Use well-tested measurement div pattern |
| Dropdown positions wrong on scroll | Parent handles scroll, repositions dropdown |
| Performance with many suggestions | Virtualize if >100 items (not expected for expr) |
| Keyboard capture conflicts | Careful event delegation, stop propagation |

## Integration Points

- Parent: `ExpressionEditor` component
- Listens to: textarea keydown, change events
- Calls: `SuggestionProvider.filterSuggestions()`
- Outputs: onSelect callback with chosen suggestion
