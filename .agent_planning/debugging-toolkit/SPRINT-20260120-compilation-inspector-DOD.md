# Definition of Done: Compilation Pipeline Inspector

**Sprint:** compilation-inspector
**Date:** 2026-01-20

---

## Functional Requirements

### Core Functionality

- [ ] **F1:** Service captures output from all 7 passes (normalization, pass2-7)
- [ ] **F2:** Service stores last 2 compilation snapshots
- [ ] **F3:** UI displays pass selector with all 7 passes
- [ ] **F4:** UI displays tree view of selected pass output
- [ ] **F5:** Tree nodes are collapsible/expandable
- [ ] **F6:** Clicking a node shows full details
- [ ] **F7:** Raw JSON toggle shows serialized output
- [ ] **F8:** Search finds block/slot/instance IDs
- [ ] **F9:** Panel is accessible from app UI

### Pass Capture

- [ ] **P1:** Normalization output captured (final NormalizedPatch only)
- [ ] **P2:** Pass 2 (type-graph) output captured
- [ ] **P3:** Pass 3 (time) output captured
- [ ] **P4:** Pass 4 (depgraph) output captured
- [ ] **P5:** Pass 5 (scc) output captured
- [ ] **P6:** Pass 6 (block-lowering) output captured
- [ ] **P7:** Pass 7 (schedule) output captured

### Edge Cases

- [ ] **E1:** Handles compilation failure (shows error pass, stops capture)
- [ ] **E2:** Handles empty patch (shows empty output)
- [ ] **E3:** Handles circular references in IR (doesn't crash)
- [ ] **E4:** Handles functions in IR (serializes type/name)

---

## Technical Requirements

### Service Layer

- [ ] **T1:** Singleton pattern like DebugService
- [ ] **T2:** MobX observable for reactive updates
- [ ] **T3:** Custom JSON replacer for circular references
- [ ] **T4:** Per-pass timing tracked (durationMs)
- [ ] **T5:** Memory bounded (max 2 snapshots)

### Compiler Integration

- [ ] **T6:** Capture calls don't break compilation on error
- [ ] **T7:** Capture is synchronous after each pass
- [ ] **T8:** No performance impact when inspector closed

### UI Layer

- [ ] **T9:** Uses InspectorContainer for styling
- [ ] **T10:** MobX observer for reactivity
- [ ] **T11:** Tree expands to depth 1 by default
- [ ] **T12:** Responsive in Dockview panel

---

## Quality Requirements

### Code Quality

- [ ] **Q1:** No TypeScript errors
- [ ] **Q2:** No ESLint warnings in new files
- [ ] **Q3:** Service has unit tests
- [ ] **Q4:** Follows existing code patterns

### Performance

- [ ] **Q5:** Tree renders in <100ms for typical patch (10-50 blocks)
- [ ] **Q6:** Search returns results in <50ms
- [ ] **Q7:** No memory leaks (snapshots properly cleared)

---

## Acceptance Verification

### Manual Testing Checklist

1. **Basic Capture:**
   - [ ] Create a patch with 3+ blocks
   - [ ] Trigger compilation
   - [ ] Open Compilation Inspector panel
   - [ ] Verify 7 passes appear in selector

2. **Tree View:**
   - [ ] Select "normalization" pass
   - [ ] Verify tree shows NormalizedPatch structure
   - [ ] Expand a node, verify children appear
   - [ ] Collapse node, verify children hidden

3. **Pass Navigation:**
   - [ ] Select each pass 2-7
   - [ ] Verify output changes appropriately
   - [ ] Verify timing shows for each pass

4. **Node Details:**
   - [ ] Click a signal expression node
   - [ ] Verify detail panel shows full structure
   - [ ] Click a field expression node
   - [ ] Verify detail panel updates

5. **Search:**
   - [ ] Enter a known block ID in search
   - [ ] Verify matching nodes highlight
   - [ ] Navigate to match
   - [ ] Search for slot ID, verify found

6. **JSON Toggle:**
   - [ ] Click "JSON" toggle
   - [ ] Verify raw JSON output displays
   - [ ] Toggle back to tree view

7. **History Comparison:**
   - [ ] Make an edit to patch
   - [ ] Trigger recompilation
   - [ ] Verify both snapshots available
   - [ ] Trigger third compilation
   - [ ] Verify oldest snapshot dropped

8. **Error Handling:**
   - [ ] Create patch with type error
   - [ ] Compile
   - [ ] Verify inspector shows error pass
   - [ ] Verify later passes not captured

---

## Exit Criteria

All items above must be checked for sprint completion.

**Sprint is DONE when:**
1. All F1-F9 functional requirements met
2. All P1-P7 pass captures working
3. All E1-E4 edge cases handled
4. All T1-T12 technical requirements met
5. All Q1-Q7 quality requirements met
6. Manual testing checklist completed
