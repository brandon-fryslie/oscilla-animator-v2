# Sprint: Editor UI - Composite Block Editor
Generated: 2026-01-27T15:02:00Z
Confidence: HIGH: 3, MEDIUM: 2, LOW: 1
Status: PARTIALLY READY

## Sprint Goal
Build a complete, intuitive editor for creating and editing composite blocks in-app.

## Scope
**Deliverables:**
- Composite Editor tab component (ReactFlow-based graph editing)
- Create/edit composite workflow
- Port exposure UI (select which ports to expose)
- Composite naming and metadata editing
- Save/cancel workflow with validation
- Integration with existing BlockLibrary panel

## Work Items

### P0: CompositeEditorStore [HIGH]
**Acceptance Criteria:**
- [ ] MobX store for composite editor state
- [ ] Track internal blocks and edges being edited
- [ ] Track port exposure selections
- [ ] Track composite metadata (name, label, category)
- [ ] Dirty state tracking (unsaved changes)
- [ ] Validation state (errors blocking save)

**Technical Notes:**
```typescript
class CompositeEditorStore {
  // State
  @observable compositeId: string | null = null;  // null = creating new
  @observable internalBlocks: Map<string, InternalBlockDef>;
  @observable internalEdges: InternalEdge[];
  @observable exposedInputs: ExposedInputPort[];
  @observable exposedOutputs: ExposedOutputPort[];
  @observable metadata: { name: string; label: string; category: string };
  @observable isDirty: boolean;
  @observable validationErrors: ValidationError[];

  // Actions
  @action addBlock(type: string, position: Vec2): void;
  @action removeBlock(id: string): void;
  @action addEdge(edge: InternalEdge): void;
  @action removeEdge(edgeId: string): void;
  @action exposeInputPort(blockId: string, portId: string, externalId: string): void;
  @action unexposePort(externalId: string): void;
  @action updateMetadata(meta: Partial<CompositeMetadata>): void;
  @action save(): CompositeBlockDef | null;
  @action cancel(): void;
  @action loadExisting(compositeId: string): void;
}
```

### P1: CompositeEditor Component [HIGH]
**Acceptance Criteria:**
- [ ] Tab in main editor area (same level as graph editor)
- [ ] ReactFlow canvas for internal graph editing
- [ ] Block library sidebar (reused from main editor)
- [ ] Add blocks by drag-drop from library
- [ ] Connect blocks by dragging between ports
- [ ] Delete blocks/edges with keyboard or context menu
- [ ] Pan/zoom controls like main editor

**Technical Notes:**
- Reuse OscillaNode component for rendering blocks
- Reuse edge rendering from ReactFlowEditor
- Need separate ReactFlow instance (not shared with main editor)

### P2: Port Exposure Panel [HIGH]
**Acceptance Criteria:**
- [ ] Sidebar panel showing all internal ports
- [ ] Checkbox or toggle for each port's exposure state
- [ ] Exposed ports show external name (editable)
- [ ] Visual indicator on graph showing exposed ports
- [ ] Validation: warn if no inputs/outputs exposed

**Technical Notes:**
- Port list organized by block
- Exposed ports highlighted in different color on graph
- Default external name = internal port name (can customize)

### P3: Metadata Panel [MEDIUM]
**Acceptance Criteria:**
- [ ] Composite name input (used as block type)
- [ ] Display label input (shown in UI)
- [ ] Category selector (for library organization)
- [ ] Optional description field
- [ ] Name validation (unique, valid identifier)

**Technical Notes:**
- Name must be valid TypeScript identifier (no spaces/special chars)
- Check for conflicts with existing block types

### P4: Save/Cancel Workflow [MEDIUM]
**Acceptance Criteria:**
- [ ] Save button validates and registers composite
- [ ] Cancel button discards changes with confirmation if dirty
- [ ] Validation errors shown inline + summary toast
- [ ] On successful save, close editor tab
- [ ] New composite appears in BlockLibrary immediately

**Technical Notes:**
- Save calls `registerBlock()` with built CompositeBlockDef
- For edit mode, need to handle "redefining" existing composite
- User composites stored in localStorage (or file in future)

### P5: BlockLibrary Integration [LOW]
**Acceptance Criteria:**
- [ ] "Composites" category in block library
- [ ] Library composites and user composites distinguished
- [ ] "Create Composite" button in library panel
- [ ] Context menu on composite to "Edit" or "Delete"
- [ ] Drag composite from library to main graph

#### Unknowns to Resolve
- How to distinguish library vs user composites visually?
- Should user composites be deletable if used in patch?

#### Exit Criteria
- UI mockups reviewed with user
- Edit/delete workflow clearly defined

## Dependencies
- Sprint 1 (Core Infrastructure) must be complete
- CompositeBlockDef types available
- Registry accepts composite registration

## Risks
- **ReactFlow instance management**: Two ReactFlow instances could conflict
  - Mitigation: Ensure separate React contexts
- **State synchronization**: Editor state vs registered composite
  - Mitigation: Clear save/cancel semantics, no live sync
- **UX complexity**: Too many panels/controls
  - Mitigation: Start simple, iterate based on feedback
