# Architectural Decisions: Auto-Arrange Layout

**Issue:** oscilla-animator-v2-8fp
**Date:** 2026-01-19

---

## Decision Log

### D1: Layout Algorithm Choice - ELK vs Dagre

**Context:**
Beads issue suggested two options:
1. dagre - Simpler, good enough
2. elkjs - More powerful, what Rete used

**Decision:** Use elkjs ✅

**Rationale:**
1. **Already implemented** - layout.ts uses ELK, working code exists
2. **Parity with Rete** - Original editor used ELK, users expect same quality
3. **More powerful** - Better handling of complex hierarchical layouts
4. **Proven** - Successfully used in Rete.js version

**Trade-offs:**
- ELK: Larger bundle size (~200KB), more features, better layout quality
- dagre: Smaller bundle (~50KB), simpler API, acceptable but not great layouts

**Winner:** ELK wins on quality and parity grounds. Bundle size acceptable for desktop editor.

**Status:** IMPLEMENTED (src/ui/reactFlowEditor/layout.ts)

---

### D2: Layout Configuration Values

**Context:**
What spacing values should we use?

**Options:**
1. Minimum from spec: 50px horizontal, 40px vertical
2. Rete values: 100px horizontal, 80px vertical
3. Custom optimized values: TBD

**Decision:** Use Rete values (100px, 80px) ✅

**Rationale:**
1. **Parity goal** - Match Rete.js editor behavior
2. **User expectations** - Users migrating from Rete expect same spacing
3. **Readability** - Generous spacing improves graph clarity
4. **Already implemented** - layout.ts uses these values

**Configuration:**
```typescript
const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'RIGHT',    // Left-to-right flow
  nodeSpacing: 100,      // Horizontal spacing
  layerSpacing: 80,      // Vertical spacing (between layers)
};
```

**Status:** IMPLEMENTED (src/ui/reactFlowEditor/layout.ts:20-24)

---

### D3: Edge Case Handling Strategy

**Context:**
How should we handle empty graphs and single nodes?

**Options:**
1. Let ELK handle everything (simplest)
2. Early return for empty graph (performance)
3. Special case single node (skip layout, just zoom)

**Decision:** Implement options 2 and 3 ✅

**Rationale:**
1. **Empty graph:**
   - ELK would work but wasteful
   - No-op is obvious correct behavior
   - Performance: Skip unnecessary async layout call

2. **Single node:**
   - ELK layout is overkill for one node
   - Just need to center/zoom to node
   - Performance: Skip 50-100ms layout computation

**Implementation:**
```typescript
// Empty graph
if (nodes.length === 0) {
  return; // No-op
}

// Single node
if (nodes.length === 1) {
  fitView({ padding: 0.1 });
  return;
}

// Multi-node: Run ELK layout
const { nodes: layoutedNodes } = await getLayoutedElements(nodes, edges);
```

**Status:** TO BE IMPLEMENTED (PLAN-20260119.md Step 4)

---

### D4: Error Handling Approach

**Context:**
What happens if ELK layout fails?

**Options:**
1. No error handling (let it crash)
2. Silent failure (catch, log, continue)
3. User notification (catch, log, show message)

**Decision:** Option 3 - User notification ✅

**Rationale:**
1. **User feedback** - User needs to know layout failed
2. **Debugging** - Console log helps developers diagnose
3. **Graceful degradation** - UI remains usable after error
4. **CLAUDE.md alignment** - Errors should be visible, not hidden

**Implementation:**
```typescript
try {
  const { nodes: layoutedNodes } = await getLayoutedElements(nodes, edges);
  setNodes(layoutedNodes);
  setTimeout(() => fitView({ padding: 0.1 }), 50);
} catch (error) {
  console.error('Auto-arrange failed:', error);
  // TODO: Show user notification (toast/snackbar)
} finally {
  setIsLayouting(false);
}
```

**Trade-off:** Requires notification UI component (toast/snackbar). For MVP, console error is acceptable. User notification can be added later.

**Status:** TO BE IMPLEMENTED (PLAN-20260119.md Step 4)

---

### D5: Testing Strategy - E2E Required

**Context:**
What level of testing is sufficient?

**Options:**
1. Manual testing only
2. Unit tests for layout.ts
3. E2E tests via Playwright
4. All of the above

**Decision:** E2E tests required (option 3), manual testing supplementary ✅

**Rationale:**
1. **CLAUDE.md principle:** "Goals must be verifiable" - automated tests required
2. **Integration complexity** - Layout touches React Flow, state, viewport - unit tests insufficient
3. **Regression prevention** - E2E tests catch UI breakage
4. **User-facing feature** - Must verify actual user experience

**What to test:**
- Button visibility and interaction
- Layout produces no overlaps (geometry checks)
- Zoom-to-fit behavior
- Edge cases (empty, single)
- Loading state during layout

**Why not unit tests:**
- layout.ts calls ELK (external library, don't test their code)
- React Flow integration too coupled for unit tests
- User behavior is what matters (end-to-end)

**Status:** TO BE IMPLEMENTED (PLAN-20260119.md Step 5)

---

### D6: Performance Targets

**Context:**
How fast must layout be?

**Options:**
1. No target (best effort)
2. Conservative: <2s for any graph
3. Aggressive: <500ms for 50 nodes

**Decision:** Option 3 - <500ms for 50 nodes, <2s for 100+ ✅

**Rationale:**
1. **User expectation** - Layout should feel instant (<500ms perceived as instant)
2. **Typical use case** - Most graphs <50 nodes
3. **Acceptable fallback** - 2s for large graphs (rare) is tolerable
4. **ELK performance** - Algorithm is fast, should easily meet targets

**Measurement:**
- E2E tests can measure layout time
- Console timing logs for debugging
- Performance regression tests optional (nice-to-have)

**Status:** TARGET SET, measurement TO BE IMPLEMENTED

---

### D7: Position Persistence - Not Persisted

**Context:**
Should auto-arranged positions be saved to PatchStore?

**Options:**
1. Persist positions (save to store)
2. Transient only (lost on reload)

**Decision:** Transient only (option 2) ✅

**Rationale:**
1. **Scope limitation** - Position persistence is separate feature
2. **Existing behavior** - Manual node positions already not persisted
3. **Complexity** - Persistence requires schema changes, serialization
4. **User workflow** - Auto-arrange is "one-off" operation, re-run if needed

**Trade-off:** User must re-run auto-arrange after reload. Acceptable for MVP.

**Future work:** Position persistence tracked in separate issue (if needed).

**Status:** OUT OF SCOPE (by design)

---

### D8: Button Placement - Top-Left Panel

**Context:**
Where should auto-arrange button appear?

**Options:**
1. Top-left panel (current)
2. Toolbar (with other editor actions)
3. Context menu (right-click)
4. Multiple locations

**Decision:** Top-left panel (option 1) ✅

**Rationale:**
1. **Already implemented** - Button exists at ReactFlowEditor.tsx:302-310
2. **React Flow convention** - Controls panel is standard location
3. **Visibility** - Always visible, no menu navigation needed
4. **Proximity to viewport** - Near zoom controls (logical grouping)

**Implementation:**
```tsx
<Panel position="top-left" className="react-flow-panel">
  <button onClick={handleAutoArrange} disabled={isLayouting}>
    {isLayouting ? 'Arranging...' : 'Auto Arrange'}
  </button>
</Panel>
```

**Status:** IMPLEMENTED (ReactFlowEditor.tsx:302-310)

---

### D9: Zoom-to-Fit Timing - Post-Layout

**Context:**
When should zoom-to-fit be triggered?

**Options:**
1. Before layout (show starting state)
2. After layout (show result)
3. Both (show before and after)

**Decision:** After layout only (option 2) ✅

**Rationale:**
1. **User expectation** - Want to see result of layout
2. **Single interaction** - One button click, one result
3. **Performance** - Avoid double viewport animation

**Implementation:**
```typescript
const { nodes: layoutedNodes } = await getLayoutedElements(nodes, edges);
setNodes(layoutedNodes);
// Fit view after layout completes
setTimeout(() => fitView({ padding: 0.1 }), 50);
```

**Why setTimeout?**
- React Flow needs time to measure new node positions
- 50ms is imperceptible to user
- Ensures fitView has accurate bounds

**Status:** IMPLEMENTED (ReactFlowEditor.tsx:178)

---

### D10: Concurrent Operation Prevention

**Context:**
What happens if user clicks button during active layout?

**Options:**
1. Queue operations (run sequentially)
2. Cancel previous, start new
3. Ignore new clicks (disabled button)

**Decision:** Option 3 - Ignore clicks, disable button ✅

**Rationale:**
1. **Simplicity** - No queue or cancellation logic needed
2. **User feedback** - Disabled button + "Arranging..." text shows state
3. **Predictability** - Each click completes before next allowed

**Implementation:**
```typescript
const [isLayouting, setIsLayouting] = useState(false);

const handleAutoArrange = useCallback(async () => {
  if (isLayouting) return; // Guard: ignore if already running
  setIsLayouting(true);
  try {
    // ... layout logic ...
  } finally {
    setIsLayouting(false); // Always re-enable
  }
}, [isLayouting]);

<button onClick={handleAutoArrange} disabled={isLayouting}>
  {isLayouting ? 'Arranging...' : 'Auto Arrange'}
</button>
```

**Status:** IMPLEMENTED (ReactFlowEditor.tsx:97, 168, 306)

---

## Summary of Decisions

| Decision | Choice | Status |
|----------|--------|--------|
| D1: Algorithm | elkjs | ✅ Implemented |
| D2: Spacing | 100px/80px | ✅ Implemented |
| D3: Edge cases | Handle empty/single | ⏳ To implement |
| D4: Errors | User notification | ⏳ To implement |
| D5: Testing | E2E required | ⏳ To implement |
| D6: Performance | <500ms/50 nodes | ✅ Target set |
| D7: Persistence | Not persisted | ✅ By design |
| D8: Button location | Top-left panel | ✅ Implemented |
| D9: Zoom timing | Post-layout | ✅ Implemented |
| D10: Concurrency | Disable button | ✅ Implemented |

---

## Open Questions

None. All architectural decisions made and documented.

---

## Future Considerations

**Not in scope for this issue, but worth tracking:**

1. **Position Persistence**
   - Save auto-arranged positions to PatchStore
   - Requires schema changes and serialization
   - Separate feature request

2. **Custom Layout Options**
   - UI to configure spacing, direction
   - Multiple layout algorithms (dagre, force-directed)
   - Power-user feature

3. **Layout Undo/Redo**
   - Already handled by existing undo/redo system
   - No additional work needed

4. **Performance Optimization**
   - Web Worker for large graphs (100+ nodes)
   - Incremental layout (only changed nodes)
   - Only needed if performance targets missed

---

## Principle Alignment Check

### CLAUDE.md Principles

**✅ ONE SOURCE OF TRUTH:**
- layout.ts is canonical implementation
- No duplicate layout logic

**✅ SINGLE ENFORCER:**
- ELK algorithm is single layout enforcer
- No manual position calculations elsewhere

**✅ ONE-WAY DEPENDENCIES:**
- layout.ts depends on: elkjs, reactflow types
- ReactFlowEditor depends on: layout.ts
- No cycles ✅

**✅ GOALS MUST BE VERIFIABLE:**
- E2E tests required (D5)
- Manual verification process defined
- Acceptance criteria measurable

**✅ LOCALITY/SEAM:**
- Layout logic isolated in layout.ts
- Editor integration via clean interface
- Changes to layout don't force editor changes

---

## References

- **PLAN-20260119.md** - Implementation steps
- **DOD-20260119.md** - Acceptance criteria
- **CONTEXT-20260119.md** - Background and requirements
- **CLAUDE.md** - Project architectural principles
