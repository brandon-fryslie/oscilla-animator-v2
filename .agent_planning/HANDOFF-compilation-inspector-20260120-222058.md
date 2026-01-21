# Handoff: Compilation Pipeline Inspector

**Created**: 2026-01-20 22:20:58
**For**: Runtime testing and user validation
**Status**: Implementation complete, ready for testing

---

## Objective

Validate that the Compilation Pipeline Inspector correctly captures and displays all 7 compiler passes with their IR outputs, enabling developers to trace data flow through the compilation pipeline and debug transformation issues.

## Current State

### What's Been Done
- ✅ CompilationInspectorService with MobX observable, circular reference handling, and search
- ✅ Compiler integration capturing all 7 passes (normalization, type-graph, time, depgraph, scc, block-lowering, schedule)
- ✅ UI components: CompilationInspector, IRTreeView, IRNodeDetail
- ✅ Panel registration in Dockview (bottom-left tab group)
- ✅ Search functionality for block/slot/instance IDs
- ✅ 47 unit tests (all passing)
- ✅ TypeScript compilation passes
- ✅ Build completes successfully
- ✅ Scroll bug fixed (panels now scrollable)

### What's In Progress
- 🔄 Runtime validation with work-evaluator agent (running in background)
- 🔄 Manual testing of all acceptance criteria

### What Remains
- [ ] Manual testing checklist (8 test scenarios from DoD)
- [ ] Performance verification (Q5: tree render <100ms, Q6: search <50ms)
- [ ] User feedback on UX and usability
- [ ] Potential polish based on real-world usage

## Context & Background

### Why We're Doing This
The Compilation Pipeline Inspector addresses a critical debugging gap: when compilation produces incorrect IR or runtime values don't match expectations, developers need to see exactly what each compiler pass generated. This tool visualizes the entire compilation data flow, making it trivial to identify which pass introduced incorrect transformations.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Store last 2 compilations only | Prevents memory growth, still allows before/after comparison | 2026-01-20 |
| Show only final NormalizedPatch (not sub-passes) | Normalization will be refactored out of compiler, avoid premature dependency | 2026-01-20 |
| Default tree expansion depth 1 | Balance between showing structure and preventing lag on large IR | 2026-01-20 |
| Custom JSON replacer for circular refs | IR structures contain backreferences, need safe serialization | 2026-01-20 |
| MobX observable service | Follows existing DebugService pattern, enables reactive UI | 2026-01-20 |

### Important Constraints
- Must not break compilation if inspector fails (all captures wrapped in try-catch)
- Must handle circular references without crashing (WeakSet tracking)
- Must serialize functions as type/name only (no function bodies in display)
- Must follow existing UI patterns (InspectorContainer, MobX observer)
- No performance impact when panel is closed (lazy capture)

## Acceptance Criteria

### Functional Requirements (F1-F9)
- [x] **F1:** Service captures output from all 7 passes
- [x] **F2:** Service stores last 2 compilation snapshots
- [x] **F3:** UI displays pass selector with all 7 passes
- [x] **F4:** UI displays tree view of selected pass output
- [x] **F5:** Tree nodes are collapsible/expandable
- [x] **F6:** Clicking a node shows full details
- [x] **F7:** Raw JSON toggle shows serialized output
- [x] **F8:** Search finds block/slot/instance IDs
- [x] **F9:** Panel is accessible from app UI

### Pass Capture (P1-P7)
- [x] **P1:** Normalization output captured
- [x] **P2:** Pass 2 (type-graph) output captured
- [x] **P3:** Pass 3 (time) output captured
- [x] **P4:** Pass 4 (depgraph) output captured
- [x] **P5:** Pass 5 (scc) output captured
- [x] **P6:** Pass 6 (block-lowering) output captured
- [x] **P7:** Pass 7 (schedule) output captured

### Edge Cases (E1-E4)
- [x] **E1:** Handles compilation failure (shows error pass, stops capture)
- [x] **E2:** Handles empty patch (shows empty output)
- [x] **E3:** Handles circular references in IR (doesn't crash)
- [x] **E4:** Handles functions in IR (serializes type/name)

### Technical Requirements (T1-T12)
- [x] **T1:** Singleton pattern like DebugService
- [x] **T2:** MobX observable for reactive updates
- [x] **T3:** Custom JSON replacer for circular references
- [x] **T4:** Per-pass timing tracked (durationMs)
- [x] **T5:** Memory bounded (max 2 snapshots)
- [x] **T6:** Capture calls don't break compilation on error
- [x] **T7:** Capture is synchronous after each pass
- [x] **T8:** No performance impact when inspector closed
- [x] **T9:** Uses InspectorContainer for styling
- [x] **T10:** MobX observer for reactivity
- [x] **T11:** Tree expands to depth 1 by default
- [x] **T12:** Responsive in Dockview panel

### Quality Requirements (Q1-Q7)
- [x] **Q1:** No TypeScript errors
- [x] **Q2:** No ESLint warnings in new files
- [x] **Q3:** Service has unit tests (47 tests)
- [x] **Q4:** Follows existing code patterns
- [ ] **Q5:** Tree renders in <100ms for typical patch (10-50 blocks) - NEEDS RUNTIME TEST
- [ ] **Q6:** Search returns results in <50ms - NEEDS RUNTIME TEST
- [ ] **Q7:** No memory leaks (snapshots properly cleared) - NEEDS RUNTIME TEST

## Scope

### Files Created
- `src/services/CompilationInspectorService.ts` (390 lines) - Service layer with MobX
- `src/services/CompilationInspectorService.test.ts` (831 lines) - 47 unit tests
- `src/ui/components/CompilationInspector.tsx` (293 lines) - Main panel component
- `src/ui/components/IRTreeView.tsx` (398 lines) - Recursive tree renderer
- `src/ui/components/IRNodeDetail.tsx` (277 lines) - Node detail panel
- `src/ui/components/CompilationInspector.css` (560 lines) - Styling
- `src/ui/dockview/panels/CompilationInspectorPanel.tsx` (15 lines) - Panel wrapper

### Files Modified
- `src/compiler/compile.ts` (+35 lines) - 7 capture points integrated
- `src/ui/dockview/panelRegistry.ts` (+3 lines) - Panel registration

### Related Components
- `src/services/DebugService.ts` - Similar singleton pattern for runtime values
- `src/ui/components/InspectorContainer.tsx` - Styling container (pattern reference)
- `src/ui/components/BlockInspector.tsx` - Similar inspector panel (pattern reference)
- `src/compiler/passes-v2/*.ts` - The 7 passes being captured

### Out of Scope (Future Enhancements)
- Side-by-side diff view between passes
- Export compilation snapshot to JSON file
- Keyboard shortcuts (Ctrl+Shift+C to open panel)
- Temporal history beyond 2 snapshots
- Advanced filters (by block type, error status, etc.)

## Implementation Approach

### Architecture Overview

```
User creates patch
    ↓
compile.ts runs 7 passes
    ↓
compilationInspector.capturePass() after each pass
    ↓ (serializeIR with circular ref handling)
CompilationInspectorService stores snapshots
    ↓ (MobX observable)
CompilationInspector UI reactively updates
    ↓
User browses tree, searches IDs, views details
```

### Patterns Followed
- **Singleton service**: `export const compilationInspector = new CompilationInspectorService()`
- **MobX reactivity**: `makeAutoObservable(this)` + `observer()` wrapper on React components
- **Error isolation**: All capture calls wrapped in try-catch to prevent breaking compilation
- **Circular ref handling**: WeakSet tracking in custom JSON replacer
- **Map/Set serialization**: Custom `{ __type: 'Map', entries: {...} }` format

### Known Gotchas
- **Circular references**: IR structures have backreferences (e.g., `builder.debugIndex` points back to builder). The `serializeIR()` function uses WeakSet to detect and replace with `'[Circular]'`.
- **Functions in IR**: `PureFn` objects contain function references. These are serialized as `'[Function]'` to avoid JSON errors.
- **Map/Set serialization**: Standard `JSON.stringify()` loses Map/Set data. Custom replacer converts to `{ __type: 'Map', entries: {...} }` format.
- **MobX tracking**: Must use `observer()` wrapper on React components to trigger re-renders when service snapshots change.
- **Performance on large IR**: Pass 6 (block-lowering) can produce 1000+ signal/field expressions. Tree uses depth-1 default expansion and CSS-only collapse/expand to avoid lag.

## Reference Materials

### Planning Documents
- [SPRINT-20260120-compilation-inspector-PLAN.md](.agent_planning/debugging-toolkit/SPRINT-20260120-compilation-inspector-PLAN.md) - Full implementation plan
- [SPRINT-20260120-compilation-inspector-DOD.md](.agent_planning/debugging-toolkit/SPRINT-20260120-compilation-inspector-DOD.md) - Definition of Done with all acceptance criteria
- [SPRINT-20260120-compilation-inspector-CONTEXT.md](.agent_planning/debugging-toolkit/SPRINT-20260120-compilation-inspector-CONTEXT.md) - Implementation context and patterns
- [EVALUATION-20260120-compilation-inspector.md](.agent_planning/debugging-toolkit/EVALUATION-20260120-compilation-inspector.md) - Pre-implementation evaluation

### Commits
- `c71c2b0` - fix(ui): Enable scrolling in Compilation Inspector panel
- `3ed1525` - fix(tests): Add type assertion for CompilationInspectorService test
- `f3dec81` - test(compilation-inspector): Add comprehensive unit tests for CompilationInspectorService
- `a0b10d1` - feat(debug): Add Compilation Inspector UI components (P2-P4)
- Earlier commits in sprint (service layer + compiler integration)

### Codebase References
- `src/services/DebugService.ts` - Reference singleton pattern
- `src/ui/components/BlockInspector.tsx` - Reference inspector UI pattern
- `src/ui/components/InspectorContainer.tsx` - Styling container component
- `src/compiler/compile.ts` - Integration point (lines 112-195)
- `src/compiler/ir/types.ts` - IR type definitions

### External Resources
- [MobX Documentation](https://mobx.js.org/) - For observable/observer pattern
- [Dockview Documentation](https://dockview.dev/) - For panel registration
- Canonical spec: `design-docs/CANONICAL-oscilla-v2.5-20260109/04-compilation.md` - Compilation pipeline specification

## Testing Strategy

### Existing Tests
- `src/services/CompilationInspectorService.test.ts` (47 tests, 831 lines)
  - Lifecycle management (7 tests)
  - Pass capture (7 tests)
  - Circular references (4 tests)
  - Function serialization (3 tests)
  - Map/Set serialization (4 tests)
  - Memory management (3 tests)
  - Search functionality (8 tests)
  - Error handling (5 tests)
  - Snapshot queries (6 tests)

Coverage: Service layer fully tested, UI components not tested (manual verification)

### Manual Testing Checklist (from DoD)

**1. Basic Capture:**
- [ ] Create a patch with 3+ blocks
- [ ] Trigger compilation (create/edit blocks)
- [ ] Open Compilation Inspector panel (bottom-left tab group, "Compilation" tab)
- [ ] Verify 7 passes appear in tabs

**2. Tree View:**
- [ ] Select "normalization" pass tab
- [ ] Verify tree shows NormalizedPatch structure (blocks, edges, adapters)
- [ ] Expand a node (click arrow), verify children appear
- [ ] Collapse node (click arrow again), verify children hidden

**3. Pass Navigation:**
- [ ] Select each pass tab (normalization, type-graph, time, depgraph, scc, block-lowering, schedule)
- [ ] Verify output changes appropriately for each pass
- [ ] Verify timing displays for each pass (e.g., "2.4ms")

**4. Node Details:**
- [ ] Click a signal expression node in tree
- [ ] Verify detail panel shows full structure on right side
- [ ] Click a field expression node
- [ ] Verify detail panel updates with new node's data

**5. Search:**
- [ ] Enter a known block ID in search input (e.g., type "block-")
- [ ] Verify matching nodes highlight in tree
- [ ] Navigate to match (if multiple results, arrows should navigate)
- [ ] Search for slot ID (e.g., "slot"), verify found

**6. JSON Toggle:**
- [ ] Click "JSON" toggle button
- [ ] Verify raw JSON output displays (formatted with syntax)
- [ ] Toggle back to "Tree" view
- [ ] Verify tree view returns

**7. History Comparison:**
- [ ] Make an edit to patch (add a block)
- [ ] Trigger recompilation
- [ ] Verify both snapshots available (check compile ID display)
- [ ] Trigger third compilation
- [ ] Verify oldest snapshot dropped (only 2 most recent remain)

**8. Error Handling:**
- [ ] Create patch with type error (connect incompatible types)
- [ ] Compile
- [ ] Verify inspector shows error pass (where compilation stopped)
- [ ] Verify later passes not captured (not shown in tabs)

### Performance Testing

**Q5: Tree render performance <100ms**
- Use browser DevTools Performance tab
- Create patch with 20-30 blocks
- Compile and open inspector
- Measure time from tab click to tree fully rendered
- Target: <100ms

**Q6: Search performance <50ms**
- Enter search query
- Measure time from keypress to highlight appearing
- Target: <50ms

**Q7: Memory leak check**
- Compile 10+ times
- Open browser DevTools Memory tab
- Take heap snapshot
- Check `CompilationSnapshot` count is ≤2
- Check no retained detached DOM nodes

## Success Metrics

### Build & Test Validation
- ✅ All 509 tests passing (47 new for CompilationInspectorService)
- ✅ TypeScript compilation passes with no errors
- ✅ Build completes successfully (3.1MB bundle, 25s build time)
- ✅ No ESLint warnings in new files

### Runtime Validation
- [ ] Panel appears in Dockview bottom-left tab group
- [ ] All 7 passes display when compilation completes
- [ ] Tree view is navigable and responsive
- [ ] Search finds IDs correctly
- [ ] No console errors during normal operation
- [ ] Performance targets met (Q5, Q6)

### User Experience
- [ ] Developer can trace data through compilation pipeline
- [ ] Easy to identify which pass introduced incorrect transformation
- [ ] IR structure is understandable (good formatting, detail panel helps)
- [ ] No friction in workflow (panel doesn't interfere with editing)

---

## Questions & Blockers

### Open Questions
- [ ] Should we add export functionality (save snapshot to JSON file)?
- [ ] Should we show internal normalization sub-passes (pass 0-3) or just final result? (Currently: final only)
- [ ] Do we need keyboard shortcut (Ctrl+Shift+C) to open panel?
- [ ] Should search be fuzzy or exact match? (Currently: substring match)

### Current Blockers
- None (implementation complete)

### Need User Input On
- [ ] Is tree view UX intuitive? (expand/collapse, detail panel)
- [ ] Are pass names clear? (e.g., "type-graph" vs "Type Resolution")
- [ ] Is default depth 1 the right balance? (or should we auto-expand more?)
- [ ] Any missing information needed for debugging?

---

## Next Steps for Agent/User

### Immediate Actions for Testing
1. **Start dev server**: `npm run dev` (if not already running)
2. **Open browser**: Navigate to `http://localhost:5173`
3. **Create test patch**: Add 3-5 blocks (e.g., TimeRoot, Oscillator, Circle, Render)
4. **Open panel**: Click "Compilation" tab in bottom-left panel group
5. **Verify capture**: Check that 7 pass tabs appear
6. **Execute manual checklist**: Run through all 8 test scenarios above

### Before Declaring Complete
- [ ] Review all manual test results
- [ ] Verify Q5 and Q6 performance targets
- [ ] Check for any console errors during testing
- [ ] Confirm no memory leaks (Q7)
- [ ] Get user feedback on UX

### When Complete
- [ ] Mark DoD as fully satisfied
- [ ] Update ROADMAP.md to mark compilation-inspector as COMPLETED
- [ ] Document any findings in evaluation or handoff notes
- [ ] Consider next debugging toolkit feature (runtime-value-inspector, patch-export, data-flow-visualizer)

---

## Additional Notes

### Service API Reference

```typescript
// Singleton instance
import { compilationInspector } from './CompilationInspectorService';

// Lifecycle
compilationInspector.beginCompile(compileId: string): void;
compilationInspector.capturePass(passName: string, input: unknown, output: unknown): void;
compilationInspector.endCompile(status: 'success' | 'failure'): void;

// Queries
compilationInspector.getLatestSnapshot(): CompilationSnapshot | undefined;
compilationInspector.getPassSnapshot(compileId: string, passName: string): PassSnapshot | undefined;
compilationInspector.search(query: string): SearchResult[];

// Management
compilationInspector.clear(): void;
```

### Pass Names (as captured)
1. `"normalization"` - NormalizedPatch
2. `"type-graph"` - TypedPatch
3. `"time"` - TimeResolvedPatch
4. `"depgraph"` - DepGraphWithTimeModel
5. `"scc"` - AcyclicOrLegalGraph
6. `"block-lowering"` - UnlinkedIRFragments
7. `"schedule"` - ScheduleIR

### UI Component Structure
```
CompilationInspectorPanel (Dockview wrapper)
  └─ CompilationInspector (main component)
      ├─ Header (compile ID, status, duration)
      ├─ PassSelector (7 tabs)
      ├─ Search (input + result count)
      ├─ PassInfo (timing, errors, sizes)
      ├─ ViewToggle (Tree | JSON)
      └─ Content
          ├─ Tree mode
          │   ├─ IRTreeView (left)
          │   └─ IRNodeDetail (right, when node selected)
          └─ JSON mode (formatted JSON display)
```

### Scroll Fix Applied
Recent commit `c71c2b0` fixed scroll bug:
- Changed `.compilation-inspector-content` overflow from `hidden` to `auto`
- Changed `.compilation-inspector-tree-container` overflow from `hidden` to `auto`
- Added `min-height: 0` to prevent flex overflow issues

Panel should now scroll properly even with large IR trees.
