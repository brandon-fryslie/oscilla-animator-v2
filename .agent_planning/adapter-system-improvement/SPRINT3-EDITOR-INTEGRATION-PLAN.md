# Sprint 3: Editor Integration for Lenses System

**Generated**: 2026-01-27
**Confidence**: HIGH: 12, MEDIUM: 3, LOW: 0
**Status**: READY FOR IMPLEMENTATION
**Source**: STATUS.md, SPRINT2-REDESIGN-LENSES.md, SPRINT2-SUMMARY.md

## Sprint Goal

Enable users to add, view, and remove lenses through the editor UI by implementing PatchStore CRUD methods and UI components for lens management.

## Scope

**Deliverables:**
1. PatchStore lens management methods (addLens, removeLens, getLensesForPort, updateLensParams)
2. Visual indicator on ports that have lenses attached
3. PortInfoPopover extension to display lens information
4. PortContextMenu extension with lens management options
5. Available lens types registry for UI selection

## Prerequisites (Completed in Sprint 2)

- [x] Data model: `LensAttachment` type defined in `src/graph/Patch.ts`
- [x] Data model: `InputPort.lenses` field exists
- [x] Data model: `OutputPort.lenses` reserved for future
- [x] Pass 2 Phase 1: `expandExplicitLenses()` implemented
- [x] Pass 2 Phase 2: `autoInsertAdapters()` preserved (backwards compat)
- [x] Addressing: `LensAddress` for `v1:blocks.{block}.inputs.{port}.lenses.{id}`
- [x] ID generation: `generateLensId()` for deterministic IDs

---

## Work Items

### P0 (Critical) - PatchStore Lens Methods

#### 1. Implement `addLens()` method
**Dependencies**: None
**Spec Reference**: Sprint 2 Data Model
**Status Reference**: SPRINT2-SUMMARY.md

##### Description
Add a lens to an input port. Creates a `LensAttachment` and appends it to the port's `lenses` array. Generates deterministic lens ID from source address. Emits appropriate events to trigger recompilation.

##### Acceptance Criteria
- [x] Method signature: `addLens(blockId: BlockId, portId: string, lensType: string, sourceAddress: string, params?: Record<string, unknown>): string`
- [x] Returns the generated lens ID
- [x] Validates block and port exist
- [x] Validates lensType is a registered block
- [x] Generates lens ID using `generateLensId(sourceAddress)`
- [x] Appends lens to port.lenses array (creates array if undefined)
- [x] Sets sortKey to be last in the array
- [x] Invalidates snapshot and emits GraphCommitted event
- [x] Throws if lens already exists for this (port, sourceAddress) pair

##### Technical Notes
```typescript
// Location: src/stores/PatchStore.ts
addLens(
  blockId: BlockId,
  portId: string,
  lensType: string,
  sourceAddress: string,
  params?: Record<string, unknown>
): string {
  const block = this._data.blocks.get(blockId);
  if (!block) throw new Error(`Block ${blockId} not found`);

  // Validate port exists
  const port = block.inputPorts.get(portId);
  if (!port) {
    const blockDef = requireBlockDef(block.type);
    if (!blockDef.inputs[portId]) {
      throw new Error(`Port ${portId} not found on block ${blockId}`);
    }
  }

  // Validate lens type
  requireBlockDef(lensType); // Throws if not found

  // Generate lens ID
  const lensId = generateLensId(sourceAddress);

  // Check for duplicate
  const existingLenses = port?.lenses ?? [];
  if (existingLenses.some(l => l.sourceAddress === sourceAddress)) {
    throw new Error(`Lens already exists for source ${sourceAddress} on port ${portId}`);
  }

  // Create lens attachment
  const lens: LensAttachment = {
    id: lensId,
    lensType,
    sourceAddress,
    params,
    sortKey: existingLenses.length,
  };

  // Update port
  const updatedPort = {
    ...port ?? { id: portId, combineMode: 'last' as const },
    lenses: [...existingLenses, lens],
  };

  // ... update block and invalidate
  return lensId;
}
```

---

#### 2. Implement `removeLens()` method
**Dependencies**: None
**Spec Reference**: Sprint 2 Data Model
**Status Reference**: SPRINT2-SUMMARY.md

##### Description
Remove a lens from an input port by lens ID. Filters out the lens from the port's `lenses` array.

##### Acceptance Criteria
- [x] Method signature: `removeLens(blockId: BlockId, portId: string, lensId: string): void`
- [x] Validates block and port exist
- [x] Removes lens from port.lenses array
- [x] If array becomes empty, sets lenses to undefined (clean up)
- [x] Invalidates snapshot and emits GraphCommitted event
- [x] Throws if lens not found

##### Technical Notes
```typescript
// Filter out the lens by ID
const existingLenses = port?.lenses ?? [];
const newLenses = existingLenses.filter(l => l.id !== lensId);
if (newLenses.length === existingLenses.length) {
  throw new Error(`Lens ${lensId} not found on port ${portId}`);
}
```

---

#### 3. Implement `getLensesForPort()` method
**Dependencies**: None
**Spec Reference**: Sprint 2 Data Model
**Status Reference**: SPRINT2-SUMMARY.md

##### Description
Get all lenses attached to an input port. Returns empty array if none.

##### Acceptance Criteria
- [x] Method signature: `getLensesForPort(blockId: BlockId, portId: string): readonly LensAttachment[]`
- [x] Returns empty array if port has no lenses
- [x] Returns defensive copy (not reference to internal array)
- [x] Works even if port doesn't exist in inputPorts map (returns empty)

##### Technical Notes
```typescript
getLensesForPort(blockId: BlockId, portId: string): readonly LensAttachment[] {
  const block = this._data.blocks.get(blockId);
  if (!block) return [];
  const port = block.inputPorts.get(portId);
  return port?.lenses ? [...port.lenses] : [];
}
```

---

#### 4. Implement `updateLensParams()` method
**Dependencies**: None
**Spec Reference**: Sprint 2 Data Model
**Status Reference**: SPRINT2-SUMMARY.md

##### Description
Update parameters for an existing lens. Used for parameterized lenses like scaling factors.

##### Acceptance Criteria
- [x] Method signature: `updateLensParams(blockId: BlockId, portId: string, lensId: string, params: Record<string, unknown>): void`
- [x] Validates lens exists
- [x] Merges new params with existing (shallow merge)
- [x] Invalidates snapshot and emits GraphCommitted event

##### Technical Notes
```typescript
// Find and update the lens
const newLenses = existingLenses.map(l =>
  l.id === lensId ? { ...l, params: { ...l.params, ...params } } : l
);
```

---

### P1 (High) - UI Indicators and Display

#### 5. Create Available Lenses Registry
**Dependencies**: None
**Spec Reference**: adapter-blocks.ts
**Status Reference**: N/A

##### Description
Create a utility that returns available lens block types for UI selection. Filters adapter blocks from the registry.

##### Acceptance Criteria
- [x] Function: `getAvailableLensTypes(): LensTypeInfo[]`
- [x] Returns all blocks in category 'adapter'
- [x] Each entry includes: blockType, label, description, inputType, outputType
- [x] Sorted alphabetically by label

##### Technical Notes
```typescript
// Location: src/ui/reactFlowEditor/lensUtils.ts
export interface LensTypeInfo {
  blockType: string;
  label: string;
  description: string;
  inputType: CanonicalType;
  outputType: CanonicalType;
}

export function getAvailableLensTypes(): LensTypeInfo[] {
  return getBlockTypesByCategory('adapter').map(def => ({
    blockType: def.type,
    label: def.label,
    description: def.description ?? '',
    inputType: def.inputs['in']?.type,
    outputType: def.outputs['out']?.type,
  }));
}
```

---

#### 6. Add Lens Indicator to Port Handles
**Dependencies**: getLensesForPort
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Add a visual indicator on input port handles that have lenses attached. Shows a small badge or icon.

##### Acceptance Criteria
- [x] Visual indicator appears on ports with lenses
- [x] Indicator does not interfere with port interaction
- [x] Indicator is color-coded (suggest amber/orange like adapter edge styling)
- [x] Indicator shows count if multiple lenses
- [x] Indicator is subtle but noticeable

##### Technical Notes
```tsx
// Location: src/ui/reactFlowEditor/OscillaNode.tsx
// In the Handle rendering section, add:

{/* Lens Indicator */}
{input.lensCount > 0 && (
  <div
    style={{
      position: 'absolute',
      left: '-3px',
      top: `calc(${topPercent}% + 10px)`,
      width: input.lensCount > 1 ? '14px' : '8px',
      height: '8px',
      borderRadius: '4px',
      background: '#f59e0b', // Amber color matching adapter edges
      pointerEvents: 'none',
      fontSize: '8px',
      color: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
    }}
    title={`${input.lensCount} lens${input.lensCount > 1 ? 'es' : ''} attached`}
  >
    {input.lensCount > 1 ? input.lensCount : ''}
  </div>
)}
```

**Required changes to PortData interface:**
```typescript
// src/ui/reactFlowEditor/nodes.ts
export interface PortData {
  // ... existing fields
  /** Number of lenses attached to this port (inputs only) */
  lensCount?: number;
  /** Lens details for popover display */
  lenses?: readonly LensAttachment[];
}
```

---

#### 7. Extend PortInfoPopover for Lenses
**Dependencies**: getLensesForPort, Available Lenses Registry
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Extend the port info popover to show lens information when hovering over a port that has lenses.

##### Acceptance Criteria
- [x] Shows "Lenses" section when port has lenses
- [x] Lists each lens with type and source
- [x] Shows lens parameters if present
- [x] Uses consistent styling with existing popover sections

##### Technical Notes
```tsx
// Location: src/ui/reactFlowEditor/PortInfoPopover.tsx
// Add new section after Default Source:

{/* Lenses (for inputs with attached lenses) */}
{isInput && port.lenses && port.lenses.length > 0 && (
  <Box>
    <Text size="xs" c="dimmed">
      Lenses
    </Text>
    <Stack gap={4} mt={4}>
      {port.lenses.map((lens) => (
        <Group key={lens.id} gap="xs">
          <Badge size="xs" color="orange" variant="light">
            {getLensLabel(lens.lensType)}
          </Badge>
          <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
            {lens.sourceAddress.split('.').pop()}
          </Text>
        </Group>
      ))}
    </Stack>
  </Box>
)}
```

---

### P1 (High) - Context Menu Integration

#### 8. Add "Add Lens" to PortContextMenu
**Dependencies**: addLens, Available Lenses Registry
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Add menu items to the port context menu for adding lenses to input ports.

##### Acceptance Criteria
- [x] "Add Lens" submenu appears for input ports only
- [x] Submenu lists available lens types
- [x] Selecting a lens type calls addLens with connected edge's source as sourceAddress
- [x] Disabled if port has no incoming connections
- [x] Shows which lens types are compatible with the port's type

##### Technical Notes
```tsx
// Location: src/ui/reactFlowEditor/menus/PortContextMenu.tsx

// Section: Add Lens (input ports only)
if (isInput) {
  // Find incoming edge to get source address
  const incomingEdge = patch.edges.find(
    e => e.to.blockId === blockId && e.to.slotId === portId
  );

  if (incomingEdge) {
    const sourceBlock = patch.blocks.get(incomingEdge.from.blockId as BlockId);
    const sourceAddress = `v1:blocks.${sourceBlock?.displayName}.outputs.${incomingEdge.from.slotId}`;

    // Get compatible lens types
    const lensTypes = getAvailableLensTypes();
    const inputPort = blockDef.inputs[portId];
    const compatibleLenses = lensTypes.filter(lens =>
      // Type compatibility check
      canApplyLens(sourceType, lens.inputType, lens.outputType, inputPort.type)
    );

    if (compatibleLenses.length > 0) {
      menuItems.push({
        label: 'Add Lens',
        icon: <TransformIcon fontSize="small" />,
        submenu: compatibleLenses.map(lens => ({
          label: lens.label,
          action: () => patch.addLens(blockId, portId, lens.blockType, sourceAddress),
        })),
      });
    }
  }
}
```

---

#### 9. Add "Remove Lens" to PortContextMenu
**Dependencies**: removeLens, getLensesForPort
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Add menu items to remove existing lenses from input ports.

##### Acceptance Criteria
- [x] "Remove Lens" appears if port has lenses
- [x] If single lens, shows direct "Remove Lens" option
- [x] If multiple lenses, shows submenu with each lens
- [x] Selecting removes the specific lens

##### Technical Notes
```tsx
// Section: Remove Lens
const existingLenses = patch.getLensesForPort(blockId, portId);
if (existingLenses.length > 0) {
  if (existingLenses.length === 1) {
    menuItems.push({
      label: `Remove Lens (${getLensLabel(existingLenses[0].lensType)})`,
      icon: <RemoveCircleIcon fontSize="small" />,
      action: () => patch.removeLens(blockId, portId, existingLenses[0].id),
    });
  } else {
    menuItems.push({
      label: 'Remove Lens',
      icon: <RemoveCircleIcon fontSize="small" />,
      submenu: existingLenses.map(lens => ({
        label: getLensLabel(lens.lensType),
        action: () => patch.removeLens(blockId, portId, lens.id),
      })),
    });
  }
}
```

---

#### 10. Add "Add Lens" to EdgeContextMenu
**Dependencies**: addLens, Available Lenses Registry
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Allow adding lenses from the edge context menu as an alternative entry point.

##### Acceptance Criteria
- [x] "Add Lens" appears in edge context menu
- [x] Shows available lens types for this edge's type pair
- [x] Adding lens uses edge's target port and source address
- [x] Clear labeling of what the lens transforms

##### Technical Notes
```tsx
// Location: src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx

// After "Go to Target", add:
{
  label: 'Add Lens',
  icon: <TransformIcon fontSize="small" />,
  submenu: compatibleLenses.map(lens => ({
    label: `${lens.label} (${formatUnit(lens.inputType)} -> ${formatUnit(lens.outputType)})`,
    action: () => {
      const sourceAddress = `v1:blocks.${sourceBlock.displayName}.outputs.${edge.from.slotId}`;
      patch.addLens(edge.to.blockId as BlockId, edge.to.slotId, lens.blockType, sourceAddress);
    },
  })),
  dividerAfter: true,
}
```

---

### P2 (Medium) - Edge Visualization

#### 11. Indicate Lenses on Edges
**Dependencies**: getLensesForPort
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Visually indicate when an edge has a lens that will be applied to it during compilation.

##### Acceptance Criteria
- [x] Edges with lenses show a visual indicator (badge or icon)
- [x] Indicator shows lens type abbreviation
- [x] Tooltip shows full lens info
- [x] Consistent with existing adapter edge styling

##### Technical Notes
```tsx
// Location: src/ui/reactFlowEditor/nodes.ts - createEdgeFromPatchEdge

// Add lens detection:
const targetBlock = blocks.get(edge.to.blockId as BlockId);
const targetPort = targetBlock?.inputPorts.get(edge.to.slotId);
const portLenses = targetPort?.lenses ?? [];
const lensForThisEdge = portLenses.find(l => {
  // Match source address to this edge's source
  return l.sourceAddress.includes(edge.from.blockId);
});

if (lensForThisEdge) {
  rfEdge.label = `[${getLensLabel(lensForThisEdge.lensType)}]`;
  rfEdge.labelStyle = { fontSize: 10, fill: '#f59e0b' };
  rfEdge.style = { stroke: '#f59e0b', strokeWidth: 2 };
}
```

---

### P2 (Medium) - Type Compatibility Helpers

#### 12. Create Lens Compatibility Checker
**Dependencies**: Available Lenses Registry
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Utility function to check if a lens can be applied between two types.

##### Acceptance Criteria
- [x] Function: `canApplyLens(sourceType, lensInputType, lensOutputType, targetType): boolean`
- [x] Returns true if source matches lens input AND lens output matches target
- [x] Handles type variables correctly
- [x] Used by context menu to filter lens options

##### Technical Notes
```typescript
// Location: src/ui/reactFlowEditor/lensUtils.ts
export function canApplyLens(
  sourceType: CanonicalType,
  lensInputType: CanonicalType,
  lensOutputType: CanonicalType,
  targetType: CanonicalType
): boolean {
  // Check if source type is compatible with lens input
  // and lens output is compatible with target type
  return (
    typesCompatible(sourceType, lensInputType) &&
    typesCompatible(lensOutputType, targetType)
  );
}
```

---

### P2 (Medium) - PatchBuilder Extension

#### 13. Add `addLens()` to PatchBuilder
**Dependencies**: addLens implementation
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Extend PatchBuilder for programmatic lens addition in tests.

##### Acceptance Criteria
- [x] Method: `addLens(blockId, portId, lensType, sourceAddress, params?): this`
- [x] Chainable with other builder methods
- [x] Used in test fixtures

##### Technical Notes
```typescript
// Location: src/graph/Patch.ts - PatchBuilder class

addLens(
  blockId: BlockId,
  portId: string,
  lensType: string,
  sourceAddress: string,
  params?: Record<string, unknown>
): this {
  const block = this.blocks.get(blockId);
  if (!block) throw new Error(`Block ${blockId} not found`);

  const port = block.inputPorts.get(portId);
  const lensId = generateLensId(sourceAddress);
  const existingLenses = port?.lenses ?? [];

  const lens: LensAttachment = {
    id: lensId,
    lensType,
    sourceAddress,
    params,
    sortKey: existingLenses.length,
  };

  const updatedPort = {
    ...port ?? { id: portId, combineMode: 'last' as const },
    lenses: [...existingLenses, lens],
  };

  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  this.blocks.set(blockId, { ...block, inputPorts: updatedInputPorts });
  return this;
}
```

---

### P3 (Low) - MobX Observable Integration

#### 14. Add MobX Actions for Lens Methods
**Dependencies**: All lens methods implemented
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Ensure all new lens methods are properly decorated as MobX actions.

##### Acceptance Criteria
- [x] `addLens` is decorated with `action`
- [x] `removeLens` is decorated with `action`
- [x] `updateLensParams` is decorated with `action`
- [x] Computed properties react to lens changes

##### Technical Notes
```typescript
// In PatchStore constructor's makeObservable:
makeObservable<PatchStore, '_data' | '_dataVersion'>(this, {
  // ... existing
  addLens: action,
  removeLens: action,
  updateLensParams: action,
});
```

---

#### 15. Export Lens Types from Stores Index
**Dependencies**: None
**Spec Reference**: N/A
**Status Reference**: N/A

##### Description
Export new lens-related types from the stores module.

##### Acceptance Criteria
- [x] `LensAttachment` type is re-exported from stores/index.ts
- [x] Types can be imported from '@/stores'

##### Technical Notes
```typescript
// src/stores/index.ts
export type { LensAttachment } from '../graph/Patch';
```

---

## Dependencies Between Work Items

```
                           +-----------------+
                           | Available Lenses|
                           |    Registry     |
                           |       (5)       |
                           +--------+--------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
        v                           v                           v
+-------+-------+           +-------+-------+           +-------+-------+
| Lens Indicator|           | PortInfoPopover|           | Lens Compat   |
| on Ports (6)  |           | Extension (7)  |           | Checker (12)  |
+---------------+           +---------------+           +-------+-------+
                                                                |
                                    +---------------------------+
                                    |
+---------------+           +-------v-------+           +---------------+
| Add Lens to   |           | Add Lens to   |           | Edge Lens     |
| PortContext(8)|<----------| EdgeContext(10)|          | Indicator (11)|
+-------+-------+           +---------------+           +---------------+
        |
        v
+-------+-------+
| Remove Lens   |
| PortContext(9)|
+---------------+

PatchStore Methods (1-4) are foundational and have no internal dependencies.
PatchBuilder (13) depends on understanding PatchStore methods.
MobX Integration (14-15) are polish items.
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Submenu complexity in context menus | Medium | Low | Use MUI nested menu patterns already in codebase |
| Type compatibility checking | Medium | Medium | Start with exact type matching, expand later |
| Performance with many lenses | Low | Low | Lenses array is small per-port |
| Breaking existing patches | Low | High | Lenses field is optional, defaults to undefined |

---

## Test Strategy

### Unit Tests (src/stores/__tests__/PatchStore-lens.test.ts)

```typescript
describe('PatchStore Lens Methods', () => {
  describe('addLens', () => {
    it('adds lens to port with no existing lenses');
    it('adds lens to port with existing lenses');
    it('generates deterministic lens ID from source address');
    it('throws if lens already exists for source');
    it('throws if block not found');
    it('throws if port not found');
    it('throws if lens type not registered');
    it('triggers recompilation via GraphCommitted event');
  });

  describe('removeLens', () => {
    it('removes lens from port');
    it('clears lenses field when last lens removed');
    it('throws if lens not found');
    it('triggers recompilation');
  });

  describe('getLensesForPort', () => {
    it('returns empty array for port with no lenses');
    it('returns lenses for port with lenses');
    it('returns defensive copy');
  });

  describe('updateLensParams', () => {
    it('updates lens params');
    it('merges with existing params');
    it('throws if lens not found');
  });
});
```

### Integration Tests (src/ui/__tests__/lens-ui.test.tsx)

```typescript
describe('Lens UI Integration', () => {
  it('shows lens indicator on ports with lenses');
  it('shows lens info in port popover');
  it('allows adding lens via port context menu');
  it('allows removing lens via port context menu');
  it('allows adding lens via edge context menu');
});
```

---

## Acceptance Criteria Summary

Sprint 3 is complete when:

1. **PatchStore Methods**: All 4 methods (addLens, removeLens, getLensesForPort, updateLensParams) implemented and tested
2. **Visual Indicators**: Ports with lenses show visible indicator
3. **Popover Extension**: Hovering shows lens details
4. **Context Menus**: Can add/remove lenses via port and edge context menus
5. **Backwards Compatible**: Existing patches without lenses continue to work
6. **All Tests Pass**: 1907+ tests pass (existing + new)

---

## File Modification Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/stores/PatchStore.ts` | MODIFY | Add lens CRUD methods |
| `src/graph/Patch.ts` | MODIFY | Add addLens to PatchBuilder |
| `src/ui/reactFlowEditor/nodes.ts` | MODIFY | Add lensCount/lenses to PortData |
| `src/ui/reactFlowEditor/OscillaNode.tsx` | MODIFY | Add lens indicator to handles |
| `src/ui/reactFlowEditor/PortInfoPopover.tsx` | MODIFY | Add lenses section |
| `src/ui/reactFlowEditor/menus/PortContextMenu.tsx` | MODIFY | Add lens menu items |
| `src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx` | MODIFY | Add lens menu items |
| `src/ui/reactFlowEditor/lensUtils.ts` | CREATE | Lens utilities for UI |
| `src/stores/__tests__/PatchStore-lens.test.ts` | CREATE | Unit tests for lens methods |
| `src/stores/index.ts` | MODIFY | Export lens types |

---

## Estimated Effort

| Phase | Items | Estimated Hours |
|-------|-------|-----------------|
| PatchStore Methods | 1-4 | 3-4 hours |
| Available Lenses Registry | 5 | 1 hour |
| Port Indicators | 6-7 | 2 hours |
| Context Menus | 8-10 | 3-4 hours |
| Edge Visualization | 11 | 1-2 hours |
| Type Compatibility | 12 | 1 hour |
| PatchBuilder | 13 | 0.5 hours |
| MobX/Exports | 14-15 | 0.5 hours |
| Testing | - | 2-3 hours |
| **Total** | | **14-18 hours** |

---

## Implementation Order (Recommended)

1. **Day 1**: PatchStore methods (items 1-4) + unit tests
2. **Day 2**: Available lenses registry (5) + lens utils (12) + PatchBuilder (13)
3. **Day 3**: Port indicators (6) + popover extension (7)
4. **Day 4**: Context menus (8-10)
5. **Day 5**: Edge visualization (11) + MobX integration (14-15) + polish
