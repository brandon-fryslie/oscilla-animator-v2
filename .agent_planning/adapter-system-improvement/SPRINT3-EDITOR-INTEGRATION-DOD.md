# Definition of Done: Sprint 3 - Editor Integration

**Generated**: 2026-01-27
**Status**: READY FOR IMPLEMENTATION
**Plan**: SPRINT3-EDITOR-INTEGRATION-PLAN.md

## Acceptance Criteria

### PatchStore Methods (P0 - Critical)

#### addLens()
- [ ] Method signature matches spec: `addLens(blockId, portId, lensType, sourceAddress, params?): string`
- [ ] Returns generated lens ID
- [ ] Validates block exists (throws meaningful error if not)
- [ ] Validates port exists in registry (throws if not)
- [ ] Validates lensType is a registered block (throws if not)
- [ ] Uses `generateLensId(sourceAddress)` for ID generation
- [ ] Creates `LensAttachment` with correct structure
- [ ] Appends to existing lenses array (does not replace)
- [ ] Creates lenses array if undefined
- [ ] Sets sortKey appropriately (last in array)
- [ ] Throws if lens already exists for (port, sourceAddress) pair
- [ ] Invalidates snapshot cache
- [ ] Emits GraphCommitted event for recompilation
- [ ] Decorated with MobX `action`

#### removeLens()
- [ ] Method signature: `removeLens(blockId, portId, lensId): void`
- [ ] Validates block exists
- [ ] Validates port has lenses
- [ ] Throws if specific lensId not found
- [ ] Removes only the specified lens
- [ ] Sets lenses to undefined when last lens removed
- [ ] Invalidates snapshot cache
- [ ] Emits GraphCommitted event
- [ ] Decorated with MobX `action`

#### getLensesForPort()
- [ ] Method signature: `getLensesForPort(blockId, portId): readonly LensAttachment[]`
- [ ] Returns empty array if no lenses
- [ ] Returns empty array if port not found (graceful)
- [ ] Returns defensive copy (not internal reference)
- [ ] Does not throw for missing data

#### updateLensParams()
- [ ] Method signature: `updateLensParams(blockId, portId, lensId, params): void`
- [ ] Validates lens exists
- [ ] Shallow merges params with existing
- [ ] Invalidates snapshot cache
- [ ] Emits GraphCommitted event
- [ ] Decorated with MobX `action`

---

### Available Lenses Registry (P1 - High)
- [ ] `getAvailableLensTypes()` function exists
- [ ] Returns array of `LensTypeInfo` objects
- [ ] Filters blocks by category 'adapter'
- [ ] Each entry has: blockType, label, description, inputType, outputType
- [ ] Sorted alphabetically by label
- [ ] Works with current block registry

---

### Port Visual Indicators (P1 - High)

#### Lens Count Badge
- [ ] Visible indicator on ports with lenses
- [ ] Uses amber/orange color (#f59e0b)
- [ ] Shows count when > 1 lens
- [ ] Does not show count for single lens (just dot)
- [ ] Has title attribute for tooltip
- [ ] Does not interfere with handle click/drag

#### PortData Extension
- [ ] `lensCount?: number` field added to PortData
- [ ] `lenses?: readonly LensAttachment[]` field added
- [ ] `createPortData` function populates these fields
- [ ] `createNodeFromBlock` passes lens data correctly

---

### PortInfoPopover Extension (P1 - High)
- [ ] Shows "Lenses" section for input ports with lenses
- [ ] Lists each lens with readable label
- [ ] Shows source address (abbreviated)
- [ ] Shows params if present
- [ ] Consistent styling with other sections
- [ ] Section hidden when no lenses

---

### Context Menu: Add Lens (P1 - High)

#### PortContextMenu
- [ ] "Add Lens" submenu appears for input ports
- [ ] Only shows when port has incoming connection
- [ ] Shows available lens types
- [ ] Disabled if no compatible lenses
- [ ] Clicking adds lens via `addLens()`
- [ ] Uses correct sourceAddress from incoming edge

#### EdgeContextMenu
- [ ] "Add Lens" option appears in edge menu
- [ ] Shows compatible lens types for this edge
- [ ] Clicking adds lens to target port
- [ ] Menu item has appropriate icon

---

### Context Menu: Remove Lens (P1 - High)
- [ ] "Remove Lens" appears when port has lenses
- [ ] Single lens: direct option with lens label
- [ ] Multiple lenses: submenu listing each
- [ ] Clicking removes specific lens via `removeLens()`
- [ ] Menu updates after removal

---

### Edge Visualization (P2 - Medium)
- [ ] Edges with lenses show visual indicator
- [ ] Lens label appears on edge
- [ ] Edge styled with amber color
- [ ] Tooltip shows lens details
- [ ] Does not conflict with adapter edge styling

---

### Type Compatibility (P2 - Medium)
- [ ] `canApplyLens()` function exists
- [ ] Takes source type, lens types, target type
- [ ] Returns boolean for compatibility
- [ ] Used to filter lens options in menus

---

### PatchBuilder (P2 - Medium)
- [ ] `addLens(blockId, portId, lensType, sourceAddress, params?)` method exists
- [ ] Chainable (returns `this`)
- [ ] Creates correct LensAttachment structure
- [ ] Works with existing builder methods

---

### MobX Integration (P3 - Low)
- [ ] All lens methods decorated in `makeObservable`
- [ ] Computed properties react to lens changes
- [ ] No MobX warnings in console

---

### Exports (P3 - Low)
- [ ] `LensAttachment` exported from `src/stores/index.ts`
- [ ] New utility functions exported appropriately

---

## Test Coverage Requirements

### Unit Tests
- [ ] `src/stores/__tests__/PatchStore-lens.test.ts` exists
- [ ] All PatchStore methods have test coverage
- [ ] Edge cases tested (empty, single, multiple lenses)
- [ ] Error cases tested (not found, duplicate, invalid)
- [ ] Event emission tested

### Integration Tests
- [ ] UI components render lens indicators
- [ ] Context menus show lens options
- [ ] Actions trigger correct store methods

### Regression Tests
- [ ] All 1907 existing tests pass
- [ ] No new TypeScript errors
- [ ] Build completes successfully

---

## Non-Functional Requirements

### Performance
- [ ] No noticeable UI lag when adding/removing lenses
- [ ] Snapshot invalidation efficient

### Backwards Compatibility
- [ ] Patches without lenses load correctly
- [ ] Existing patches continue to work
- [ ] No breaking changes to public API

### Code Quality
- [ ] No `any` types without justification
- [ ] Consistent error messages
- [ ] JSDoc comments on public methods
- [ ] No console warnings in development

---

## Exit Criteria

Sprint 3 is DONE when:

1. All acceptance criteria above are checked
2. All unit tests pass
3. All integration tests pass
4. Manual testing confirms:
   - Can add lens via port context menu
   - Can add lens via edge context menu
   - Can remove lens via context menu
   - Lens indicators visible on ports
   - Lens info shows in popover
   - Graph recompiles after lens changes
5. Code review approved (if applicable)
6. Documentation updated:
   - SPRINT3-EDITOR-INTEGRATION-PLAN.md status updated
   - STATUS.md updated with completion

---

## Verification Checklist

Before marking Sprint 3 complete:

```bash
# Run all tests
npm run test

# Verify build
npm run build

# Verify typecheck
npm run typecheck

# Manual testing checklist:
# [ ] Open editor
# [ ] Add a block with typed ports (e.g., Phasor -> Sin)
# [ ] Connect them
# [ ] Right-click input port -> Add Lens menu appears
# [ ] Add a lens -> indicator appears on port
# [ ] Hover port -> popover shows lens info
# [ ] Right-click port -> Remove Lens option appears
# [ ] Remove lens -> indicator disappears
# [ ] Right-click edge -> Add Lens option works
# [ ] Verify graph compiles after each change
```
