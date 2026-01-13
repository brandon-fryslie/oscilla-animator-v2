# Evaluation: Sprint 2 - patch-editor-ui Advanced Rete.js Features

**Date:** 2026-01-13 03:43
**Topic:** patch-editor-ui Sprint 2 Planning
**Reference Documents:**
- Sprint 1 PLAN: PLAN-20260112-190000.md
- Sprint 1 DOD: DOD-20260112-190000.md
- Sprint 1 WORK-EVALUATION: WORK-EVALUATION-20260112-220000.md

---

## Executive Summary

Sprint 1 successfully established the Rete.js foundation with **basic node rendering, bidirectional sync, and core infrastructure**. However, critical interactive features remain **broken or untested** (add block, socket validation, delete, pan/zoom). Sprint 2 must address these blockers while adding advanced features.

**Recommendation:** Sprint 2 should be split into two sub-sprints:
- **Sprint 2A**: Fix Sprint 1 blockers + Undo/Redo
- **Sprint 2B**: Advanced features (auto-layout, minimap, custom rendering, parameter editing)

---

## Sprint 1 Summary

### ✅ What Works (Verified)

1. **Basic Rete.js Integration**
   - Editor tab renders in center panel
   - 27 nodes display with correct labels and ports
   - Connection lines visible between nodes
   - Dark background (#1a1a2e) renders correctly

2. **Bidirectional Sync (Partial)**
   - PatchStore → Editor: Initial load works (27 nodes, 36 edges)
   - Patch switching: Updates editor view correctly
   - `isSyncing` guard prevents infinite loops
   - Sync code exists for Editor → PatchStore (not runtime-verified)

3. **Infrastructure**
   - OscillaNode class with blockId/blockType
   - Socket type system with `isCompatibleWith()` rules
   - EditorContext for accessing editor handle
   - TypeScript compiles, tests pass

### ❌ Critical Blockers (Must Fix Before Sprint 2)

From WORK-EVALUATION-20260112-220000.md:

1. **Add Block from Library - BROKEN**
   - Double-click registered but node doesn't appear
   - Likely issues: editorHandle timing, viewport coordinates, async timing
   - **Impact:** HIGH - Primary block addition method unusable

2. **Socket Type Validation - UNTESTED**
   - `isCompatibleWith()` implemented but not runtime-verified
   - Need to verify: signal→signal, signal→field, field→signal rejection
   - **Impact:** HIGH - Type safety is core feature

3. **Delete Block - UNTESTED**
   - Context menu implementation unclear
   - Delete flow not verified
   - **Impact:** HIGH - Core editing functionality

4. **Pan/Zoom - UNTESTED**
   - Core navigation not verified
   - May need additional Rete extensions
   - **Impact:** MEDIUM - Can't navigate large graphs

### 📊 Sprint 1 Completion Status

| Work Item | Status | Confidence |
|-----------|--------|------------|
| P0: Rete.js Setup | 70% | Medium |
| P1: Socket Type System | 80% | Low (untested) |
| P2: OscillaNode Class | 100% | High |
| P3: Bidirectional Sync | 60% | Medium |
| P4: Add Block | 0% (BROKEN) | Low |
| P5: Delete Block | 0% (UNTESTED) | Low |

**Verdict:** Sprint 1 is **INCOMPLETE** with critical blockers.

---

## Sprint 2 Features Analysis

### Feature 1: Undo/Redo (History Plugin)

**Complexity:** Medium
**Dependencies:** P3 bidirectional sync
**Technical Approach:**
```typescript
import { HistoryPlugin } from 'rete-history-plugin';

// Setup
const history = new HistoryPlugin<Schemes>();
editor.use(history);

// Enable undo/redo
history.setup();

// Listen to changes and commit to history
editor.addPipe(context => {
  if (context.type === 'connectioncreated' || 
      context.type === 'connectionremoved' ||
      context.type === 'nodecreated' ||
      context.type === 'noderemoved') {
    // Commit to history
    history.push();
  }
  return context;
});
```

**Integration Requirements:**
- Must work with existing `isSyncing` guard
- History commits only on user actions (not programmatic sync)
- Undo/redo should update PatchStore (maintain single source of truth)

**Risks:**
- Sync conflicts: Undo might revert to stale PatchStore state
- History bloat: Too many commits on rapid changes
- Performance: Large graphs with extensive history

**Estimated Effort:** 2-3 days

---

### Feature 2: Auto-layout (Auto-arrange Plugin)

**Complexity:** Low-Medium
**Dependencies:** P0 (node positioning)
**Technical Approach:**
```typescript
import { AutoArrangePlugin } from 'rete-auto-layout-plugin';

// Setup
const autoArrange = new AutoArrangePlugin<Schemes>();
area.use(autoArrange);

// Trigger layout
autoArrange.layout();

// Options for grid or force-directed layout
autoArrange.layout({
  direction: 'LR', // Left-to-right
  spacing: [100, 80] // [horizontal, vertical]
});
```

**Integration Requirements:**
- Preserve manual node positions if user has positioned them
- Option to auto-arrange all nodes vs. selected subgraph
- Should integrate with viewport zoom (zoom to fit after layout)
- Store layout preference in editor state (not PatchStore)

**Risks:**
- Overwrites manual positioning (user frustration)
- Complex graphs may produce overlapping nodes
- Performance on large graphs (100+ nodes)

**Estimated Effort:** 2 days

---

### Feature 3: Minimap

**Complexity:** Medium
**Dependencies:** P0 (editor rendering)
**Technical Approach:**
```typescript
import { MinimapPlugin } from 'rete-minimap-plugin';

// Setup
const minimap = new MinimapPlugin<Schemes>({
  width: 200,
  height: 150,
  margin: 10
});
area.use(minimap);

// Position minimap (typically top-right corner)
minimap.position('top-right');
```

**Integration Requirements:**
- Sync with viewport pan/zoom
- Click on minimap to navigate to region
- Highlight currently visible region
- Collapsible/expandable for space efficiency
- Should not interfere with main editor interaction

**Risks:**
- Screen real estate on small displays
- Performance impact with large graphs
- Distracting visual clutter

**Estimated Effort:** 2-3 days

---

### Feature 4: Custom Node Rendering

**Complexity:** High
**Dependencies:** P2 (OscillaNode class)
**Technical Approach:**
```typescript
import { ReactPlugin } from 'rete-react-plugin';

// Custom node component
class OscillaNodeComponent extends React.Component {
  render() {
    const { node, editor, getSocketColor } = this.props;
    
    return (
      <div className="oscilla-node">
        <div className="node-header">{node.label}</div>
        <div className="node-ports">
          {/* Custom input/output rendering */}
        </div>
        <div className="node-controls">
          {/* Parameter controls here (Feature 5) */}
        </div>
      </div>
    );
  }
}

// Register custom renderer
reactPlugin.addPreset(ReactPresets.classic.setup({
  customize: {
    node() { return OscillaNodeComponent; }
  }
}));
```

**Integration Requirements:**
- Must still work with Rete's socket system
- Custom controls must sync with PatchStore parameters
- Maintain node selection, dragging, connection interactions
- Support for node resizing based on content

**Risks:**
- Complexity of maintaining React + Rete integration
- Performance with many custom-rendered nodes
- Breaking existing node behavior (ports, dragging, etc.)

**Estimated Effort:** 4-5 days

---

### Feature 5: Parameter Editing in Nodes

**Complexity:** Very High
**Dependencies:** Feature 4 (custom node rendering)
**Technical Approach:**
```typescript
// Extend OscillaNode with parameter controls
class OscillaNode extends ClassicPreset.Node {
  public readonly blockId: BlockId;
  public readonly blockType: string;
  public readonly controls: Map<string, ClassicPreset.Control>;

  constructor(blockDef: BlockDef, blockId: BlockId, displayName?: string) {
    super(displayName || blockDef.label);
    
    // Add parameter controls
    for (const param of blockDef.parameters) {
      const control = this.createControlForParameter(param);
      this.controls.set(param.id, control);
    }
  }

  private createControlForParameter(param: ParameterDef): ClassicPreset.Control {
    // Create appropriate control based on parameter type
    // - Slider for numeric values
    // - Dropdown for enums
    // - Toggle for booleans
    // - Text input for strings
    return new CustomParameterControl(param);
  }
}

// Custom control that syncs to PatchStore
class CustomParameterControl extends ClassicPreset.Control {
  constructor(private param: ParameterDef) {
    super();
  }

  // React renders the control UI
  render() {
    return <ParameterInput 
      value={this.param.value}
      onChange={(value) => this.updateParameter(value)}
    />;
  }

  private updateParameter(value: any) {
    // Sync to PatchStore
    patchStore.updateBlockParameter(this.node.blockId, this.param.id, value);
  }
}
```

**Integration Requirements:**
- Must integrate with existing parameter editing UI (BlockInspector)
- Real-time preview of parameter changes
- Parameter validation (min/max, type checking)
- Support for different parameter types (float, int, bool, enum, string)
- Must work with custom node rendering (Feature 4)

**Risks:**
- Very complex - requires significant architecture changes
- Sync complexity: Parameter changes in nodes, inspector, and programmatic updates
- Performance: Many nodes with many parameters updating frequently
- UI/UX: Fitting controls in node without overcrowding
- State consistency: PatchStore as single source of truth

**Estimated Effort:** 8-10 days

---

## Sprint 2 Architecture Requirements

### 1. Enhanced Sync Layer

Current sync handles blocks/connections. Need to extend for:
- History states (undo/redo)
- Node positions (manual vs auto-layout)
- Parameter values (for parameter editing)

```typescript
// Enhanced sync interface
interface EditorSync {
  // Existing
  syncBlocks(): Promise<void>;
  syncConnections(): Promise<void>;
  
  // New
  syncNodePositions(): Promise<void>;
  syncParameters(): Promise<void>;
  pushHistoryState(): void;
  undo(): void;
  redo(): void;
}
```

### 2. State Management

Need to distinguish between:
- **Persistent state** (in PatchStore): blocks, edges, parameters
- **Transient state** (in editor only): node positions, viewport, selection, history
- **Derived state** (computed): layout, minimap view

### 3. Plugin Architecture

Sprint 2 adds multiple Rete plugins:
- History plugin
- Auto-arrange plugin
- Minimap plugin
- Custom rendering

Need clear initialization order and plugin dependencies.

---

## Feature Dependencies

```
Sprint 2A (Stabilization + History)
├── Fix Sprint 1 blockers (CRITICAL)
│   ├── Add block from Library
│   ├── Socket type validation
│   ├── Delete block
│   └── Pan/zoom
└── Undo/Redo (History plugin)

Sprint 2B (Advanced Features)
├── Auto-layout
├── Minimap
└── Custom Node Rendering
    └── Parameter Editing (depends on custom rendering)
```

**Critical Path:** Parameter editing requires custom node rendering (4-5 days before parameter editing can start).

---

## Technical Risks

### High Risk

1. **Parameter Editing Complexity**
   - Risk: May require significant refactoring of existing architecture
   - Mitigation: Split into smaller pieces, prototype first
   - Contingency: Defer parameter editing to Sprint 3 if too complex

2. **Sprint 1 Blockers**
   - Risk: Add block/delete issues may indicate deeper sync problems
   - Mitigation: Dedicated sprint 2A to stabilize Sprint 1
   - Contingency: Fix critical bugs, defer advanced features

### Medium Risk

3. **Sync State Conflicts**
   - Risk: Undo/redo with PatchStore as source of truth
   - Mitigation: History stores PatchStore deltas, not Rete state
   - Contingency: Restrict undo/redo scope to editor-only actions

4. **Custom Rendering Compatibility**
   - Risk: Custom nodes break existing socket/connection behavior
   - Mitigation: Extensive testing of port interactions
   - Contingency: Incremental enhancement (custom header only, not full node)

### Low Risk

5. **Auto-layout Quality**
   - Risk: Layout algorithm produces poor results
   - Mitigation: Multiple layout options (grid, force-directed)
   - Contingency: Manual positioning remains primary option

6. **Minimap Performance**
   - Risk: Performance impact on large graphs
   - Mitigation: Cached rendering, throttled updates
   - Contingency: Disable minimap for graphs >100 nodes

---

## Sprint 2 Recommendations

### Recommendation 1: Split Sprint 2

**Sprint 2A: Stabilization (3-5 days)**
- Fix all Sprint 1 blockers
- Add undo/redo (History plugin)
- Stabilize bidirectional sync

**Sprint 2B: Advanced Features (10-15 days)**
- Auto-layout
- Minimap
- Custom node rendering
- Parameter editing

**Rationale:**
- Sprint 1 has critical bugs that must be fixed
- Advanced features depend on stable foundation
- Split allows validation of fixes before adding complexity

### Recommendation 2: Add Plugin Registry

Create centralized plugin management:

```typescript
// src/ui/editor/plugins/index.ts
export interface RetePlugin {
  name: string;
  init(editor: NodeEditor, area: AreaPlugin): void;
  destroy(): void;
}

export class PluginRegistry {
  private plugins = new Map<string, RetePlugin>();
  
  register(plugin: RetePlugin) {
    this.plugins.set(plugin.name, plugin);
  }
  
  async initAll(editor: NodeEditor, area: AreaPlugin) {
    for (const plugin of this.plugins.values()) {
      plugin.init(editor, area);
    }
  }
}
```

**Benefits:**
- Clear plugin initialization order
- Easier testing of individual plugins
- Plugin dependencies explicit

### Recommendation 3: E2E Testing Strategy

Sprint 2 must include comprehensive E2E tests:

```typescript
// tests/e2e/editor-undo-redo.test.ts
test('undo/redo after add/delete block', async () => {
  // Add block
  await page.dblclick('[data-block-type="Constant"]');
  let blocks = await page.locator('.rete-node').count();
  expect(blocks).toBe(1);
  
  // Delete block
  await page.rightclick('.rete-node');
  await page.click('[data-action="delete"]');
  blocks = await page.locator('.rete-node').count();
  expect(blocks).toBe(0);
  
  // Undo
  await page.keyboard.press('Control+Z');
  blocks = await page.locator('.rete-node').count();
  expect(blocks).toBe(1);
});

// tests/e2e/editor-auto-layout.test.ts
test('auto-layout arranges nodes without overlap', async () => {
  // Add 10 blocks randomly positioned
  // Trigger auto-layout
  // Verify no overlapping nodes
  // Verify reasonable spacing
});
```

### Recommendation 4: Incremental Custom Rendering

Start with minimal custom rendering, expand gradually:

1. **Phase 1:** Custom node header styling
2. **Phase 2:** Custom port styling (colors, icons)
3. **Phase 3:** Inline parameter controls (basic)
4. **Phase 4:** Full parameter editing

Each phase tested before proceeding.

---

## What Needs to be Planned

Based on this evaluation, Sprint 2 planning should include:

### Sprint 2A Planning Items

1. **Fix Sprint 1 Blockers**
   - Debug and fix add block from Library
   - Verify and fix socket type validation
   - Test and fix delete block flow
   - Verify pan/zoom functionality

2. **Undo/Redo (History Plugin)**
   - Install rete-history-plugin
   - Integrate with existing sync guard
   - Define history commit triggers
   - Add keyboard shortcuts (Ctrl+Z, Ctrl+Y)

3. **Enhanced Sync Architecture**
   - Extend sync.ts with new sync operations
   - Add history state management
   - Prevent sync conflicts

### Sprint 2B Planning Items

4. **Auto-layout**
   - Install rete-auto-layout-plugin
   - Add "Auto Arrange" button to toolbar
   - Implement layout options (grid, force-directed)
   - Preserve manual positions when possible

5. **Minimap**
   - Install rete-minimap-plugin
   - Position minimap in editor
   - Sync minimap with viewport
   - Add minimap toggle

6. **Custom Node Rendering**
   - Design custom node component
   - Implement OscillaNodeComponent
   - Preserve existing socket behavior
   - Add node resizing support

7. **Parameter Editing**
   - Design parameter control UI
   - Implement parameter controls for each type
   - Sync with PatchStore and BlockInspector
   - Add validation and error handling

---

## Success Criteria for Sprint 2

### Sprint 2A Success Criteria

- [ ] All Sprint 1 blockers fixed and tested
- [ ] Add block from Library works (double-click creates node)
- [ ] Socket type validation verified (compatible/incompatible connections)
- [ ] Delete block works (context menu and delete key)
- [ ] Pan/zoom verified (drag background, scroll zoom)
- [ ] Undo/redo works (10+ steps, keyboard shortcuts)
- [ ] No sync loops or conflicts
- [ ] All E2E tests pass

### Sprint 2B Success Criteria

- [ ] Auto-layout works (button arranges nodes, no overlap)
- [ ] Minimap visible and interactive (click to navigate)
- [ ] Custom node rendering (styled headers, custom ports)
- [ ] Parameter editing (inline controls, PatchStore sync)
- [ ] Performance: Editor responsive with 50+ nodes
- [ ] No regression in Sprint 2A features

---

## Open Questions for Sprint 2 Planning

1. **Parameter Editing Scope**
   - Which parameter types first? (float, int, bool, enum, string)
   - Inline editing vs. modal popup?
   - Integration with existing BlockInspector?

2. **Auto-layout Algorithm**
   - Grid layout (simpler) or force-directed (better)?
   - User preference or automatic?
   - Handle subgraphs or entire graph?

3. **Custom Rendering Extent**
   - Styling only or full custom UI?
   - Maintain compatibility with existing Rete features?
   - Performance budget (how many custom nodes)?

4. **Minimap Implementation**
   - Always visible or toggle?
   - Size and position preferences?
   - Large graph handling (>100 nodes)?

5. **History Depth**
   - How many undo steps? (50, 100, unlimited?)
   - History persistence across sessions?
   - History size management?

---

## Conclusion

Sprint 1 established a solid Rete.js foundation but left critical interactive features broken or untested. Sprint 2 must address these issues while adding advanced features. 

**The path forward is clear:**
1. **Sprint 2A** stabilizes Sprint 1 and adds undo/redo
2. **Sprint 2B** adds advanced features (auto-layout, minimap, custom rendering, parameter editing)

This phased approach reduces risk, ensures quality, and delivers value incrementally.

**Next Step:** Create Sprint 2A and Sprint 2B planning documents with detailed acceptance criteria, technical designs, and implementation timelines.

