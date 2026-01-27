# Definition of Done: autocomplete-wiring

Generated: 2026-01-26
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260126-autocomplete-wiring-PLAN.md

## Acceptance Criteria

### Suggestion Provider

- [ ] `OutputSuggestion` type added with blockId, portId, sourceAddress fields
- [ ] `suggestAllOutputs(excludeBlockId?)` method returns flat list of block.port suggestions
- [ ] Labels formatted as "BlockName.portId" (e.g., "Circle.radius")
- [ ] Excluded block (self) not included in suggestions
- [ ] Outputs sorted alphabetically by label

### Filter Integration

- [ ] `filterSuggestions()` includes outputs in default (no type filter) results
- [ ] Type filter 'output' returns only output suggestions
- [ ] Outputs have sortOrder 250 (between inputs and blocks)

### UI Rendering

- [ ] AutocompleteDropdown shows icon for 'output' type
- [ ] Output suggestions display correctly in dropdown
- [ ] Keyboard navigation works with output suggestions

### Vararg Wiring

- [ ] Selecting output suggestion inserts text into expression
- [ ] Selecting output suggestion wires VarargConnection to refs port
- [ ] sourceAddress correctly formatted as "blocks.{blockId}.outputs.{portId}"
- [ ] sortKey calculated as max(existing) + 1
- [ ] Only 'output' type triggers wiring (not functions/inputs)

### End-to-End

- [ ] Expression with `Circle.radius` compiles when Circle block exists
- [ ] Expression with `Circle.radius` executes correctly at runtime
- [ ] Expression block cannot reference its own outputs
- [ ] Wired connections visible in refs port (if UI shows them)

### Integration

- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] No circular dependencies introduced
- [ ] Existing autocomplete functionality unchanged (functions, inputs)

## Test Coverage

- [ ] Test: suggestAllOutputs returns correct format
- [ ] Test: suggestAllOutputs excludes specified block
- [ ] Test: filterSuggestions includes outputs
- [ ] Test: Output suggestion selection wires connection
- [ ] Test: sortKey increments correctly
- [ ] Test: Expression compiles with wired block reference
