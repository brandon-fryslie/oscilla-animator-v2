# Runtime Knowledge: BlockLibrary Component

**Scope**: UI Component - BlockLibrary
**Last Updated**: 2026-01-11
**Confidence**: FRESH

## Component Behavior

### Search Functionality
- **Debounce timing**: 150ms works well for real-time search without lag
- **Filter scope**: Searches across type, label, and description simultaneously
- **Result count**: Displays total results across all categories
- **Clear interaction**: Both ESC key and clear button work reliably
- **Empty state**: Shows "No blocks found" message when no results

### Category Management
- **Collapse persistence**: localStorage reliably persists state across page reloads
- **Count badges**: Show accurate counts, update dynamically with search
- **Empty categories**: Correctly hidden when no blocks match (e.g., Math category)
- **Chevron indicator**: ▼ for expanded, ▸ for collapsed (intuitive)

### Block Interactions
- **Single-click**: Sets `rootStore.selection.previewType` reliably
- **Double-click**: Adds block AND selects it atomically (no race conditions)
- **Store integration**: Direct store calls (no events), synchronous, works consistently
- **Selection state**: Visual feedback via `.selected` class when previewType matches

### Keyboard Navigation
- **Enter**: Previews block (same as single-click)
- **Shift+Enter**: Adds block (same as double-click)
- **ESC**: Clears search input and refocuses
- **Focus management**: Scroll into view on keyboard focus works smoothly

### Port Metadata Display
- **Label**: Bold, primary accent color (#4ecdc4), clearly distinguishable
- **Type**: Monospace font, secondary text color, helps with identification
- **Description**: Gray text, 3-line truncate with ellipsis (CSS line-clamp works in all modern browsers)
- **Port counts**: "N in, M out" format is clear and concise

## Performance Characteristics

### Search Performance
- **Registry size**: 18 blocks in current registry
- **Search time**: <50ms for actual search logic (synchronous filtering)
- **Total time**: <300ms including 150ms debounce (tested and verified)
- **Scaling**: Linear with block count, should handle 100+ blocks without issues

### Render Performance
- **Initial render**: Fast, no noticeable lag
- **Search updates**: Smooth, debounce prevents jank
- **Category collapse**: Instant (CSS display toggle)
- **localStorage**: Negligible overhead (try/catch handles errors gracefully)

## Edge Cases Handled

### localStorage Unavailable
- **Behavior**: Try/catch in load/save functions prevents crashes
- **Fallback**: Uses empty Set() as default, app continues working
- **Privacy mode**: Works fine (just doesn't persist collapse state)

### Empty Search Results
- **Behavior**: Shows "No blocks found matching..." message
- **Categories**: Hidden if no matches
- **UX**: Clear feedback to user

### Category with No Blocks
- **Behavior**: Category not rendered at all
- **Example**: Math category exists in enum but has no blocks (correctly hidden)

### Rapid Input
- **Behavior**: Debounce prevents multiple rapid searches
- **UX**: Smooth, no lag or stutter

## Integration Points

### Store Dependencies
- **PatchStore**: `addBlock()` method for adding blocks
- **SelectionStore**: `setPreviewType()` and `selectBlock()` for selection
- **No mocking needed**: Tests use real stores, work reliably

### CSS Dependencies
- **Theme.ts**: All 7 color palette values used correctly
- **InspectorContainer.css**: Scrollbar styling is identical
- **Font family**: Matches theme typography

## Known Limitations

### Not Implemented Yet (By Design)
- **Drag-drop**: Deferred to Phase 2
- **Block colors**: Registry doesn't include color metadata yet
- **Arrow key navigation**: Not implemented (only Enter/Shift+Enter/ESC)
- **Tab navigation**: Native browser behavior (works but not custom)

### MobX Warnings
- **Warning**: "Derivation 'observerBlockLibrary2' is created/updated without reading any observable value"
- **Cause**: React Testing Library rendering in non-reactive context
- **Impact**: None - just test noise, doesn't affect production
- **Status**: Expected and documented

## Testing Insights

### What Works Well
- **Integration tests**: Testing with real stores finds real bugs (better than mocks)
- **Performance tests**: Measuring actual timing catches debounce issues
- **localStorage tests**: Mock implementation works reliably
- **Keyboard tests**: fireEvent.keyDown simulates real user interaction

### What to Watch
- **CSS truncation**: Can only verify class is applied, not actual visual truncation (needs real layout)
- **Scroll behavior**: scrollIntoView tested but hard to verify visually in tests
- **Hover states**: CSS applied but not tested (requires real browser interaction)

## Recommendations for Future

### Phase 2 Enhancements
- Consider drag-drop integration (@dnd-kit)
- Add arrow key navigation between blocks
- Add color metadata to registry and display in block items
- Consider keyboard shortcuts for common actions (Cmd+F for search)

### Testing Improvements
- Consider visual regression tests for CSS (e.g., Percy, Chromatic)
- Add E2E tests with Playwright for actual browser testing
- Test with different localStorage quotas

### Performance Monitoring
- Add performance marks for search timing in production
- Monitor localStorage usage (though it's tiny)
- Track category collapse patterns (which categories users collapse)
