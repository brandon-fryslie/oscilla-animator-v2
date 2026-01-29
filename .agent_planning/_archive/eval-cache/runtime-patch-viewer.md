# Runtime Findings: Patch Viewer

**Scope**: patch-viewer component
**Last Updated**: 2026-01-09
**Confidence**: FRESH

## Runtime Behavior

### Mermaid Rendering
- **Initialization**: Mermaid.js initializes globally once on first PatchViewer construction
- **Render method**: `mermaid.render(id, code)` returns SVG string
- **Update behavior**: Clears container and re-renders on each `render()` call
- **Error handling**: Catches render errors, displays error message in container

### Layout Integration
- **Split-view**: Left panel (40% flex-basis), right panel (60% flex-grow)
- **Responsive**: SVG set to `max-width: 100%`, `height: auto`
- **Scrolling**: Patch viewer container has `overflow-y: auto`, `overflow-x: auto`
- **Z-index**: Stats and controls positioned with `z-index: 100` to stay on top

### Update Lifecycle
When slider changes:
1. `buildAndCompile()` called with new particle count
2. Patch rebuilt with new DomainN param
3. `patchViewer.render(patch)` called
4. Mermaid re-renders entire diagram
5. Canvas animation continues uninterrupted

### Known Limitations
- **HTML in labels**: Mermaid doesn't fully support HTML formatting in flowchart node labels
  - `<b>`, `<i>`, `<br/>` tags are stripped/ignored
  - Text content is preserved but flattened to single line
  - Separator `---` still visible but no line breaks
  - Impact: Minor cosmetic issue, doesn't affect functionality

## Performance Characteristics
- **Initial render**: <100ms for 27-node graph
- **Re-render on slider change**: <100ms (includes patch rebuild and Mermaid render)
- **Memory**: No observed leaks during repeated slider changes
- **Canvas performance**: Unaffected by patch viewer presence

## Dark Theme Colors
Matches existing UI:
- Primary: `#16213e`
- Border: `#0f3460`
- Text: `#eee`
- Line: `#4ecdc4`
- Background: `#1a1a2e`, `#0f0f23`

## Test Coverage Gaps
- No E2E tests for patch viewer rendering
- No tests for Mermaid error handling
- No visual regression tests
- No performance benchmarks for large graphs

## Future Considerations
If HTML formatting becomes important:
- Alternative 1: Use plain text with careful spacing
- Alternative 2: Custom CSS targeting `.node` elements
- Alternative 3: Different diagram library (D3, Cytoscape, etc.)
- Current state: Acceptable for read-only visualization
