# Sprint: Type-Aware Const Editor

Generated: 2026-01-25T16:56:28Z
Confidence: HIGH: 1, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Implement type-dispatch logic in Const block editor so it renders the appropriate control UI based on the resolved payload type.

## Scope

**Deliverable:**
- Type-aware editor dispatch in BlockInspector for Const blocks
- Support all payload types: float, int, bool, vec2, color, shape, cameraProjection

## Work Items

### P0: Implement Type-Based Editor Dispatch

**Location**: `src/ui/components/BlockInspector.tsx:1424-1435`

**Current Code**:
```tsx
// Currently hardcoded float editor
<SliderWithInput
  value={numValue}
  onChange={(v) => handleConstValueChange(v)}
/>
```

**Required Changes**:
1. Get resolved `payloadType` from `block.params.payloadType`
2. Switch on payloadType to select editor component:
   - `float` → `SliderWithInput` (current, unchanged)
   - `int` → `SliderWithInput` (with integer constraints)
   - `bool` → Checkbox
   - `vec2` → `HintedControl` with xy hint (already exists at line 1849+)
   - `color` → `ColorInput` (src/ui/components/common/ColorInput.tsx)
   - `shape` → Show message "Shape values configured via geometry properties"
   - `cameraProjection` → Show message "Camera projection values configured via properties"
3. Handle unresolved type (no payloadType yet) → Show float slider as fallback

**Acceptance Criteria**:
- [ ] Float Const blocks render float slider
- [ ] Int Const blocks render integer-constrained slider (step: 1)
- [ ] Bool Const blocks render checkbox
- [ ] Vec2 Const blocks render X/Y coordinate inputs
- [ ] Color Const blocks render color picker
- [ ] Shape and CameraProjection render appropriate guidance text
- [ ] Unresolved type falls back to float slider
- [ ] Value changes propagate correctly to block.params.value
- [ ] No console errors when switching between types

**Technical Notes**:
- Use existing `HintedControl` component for vec2 (line 1849+)
- Use existing `ColorInput` from common components
- Check how checkbox is currently implemented for other payload types
- Value stored as JSON string in `block.params.value` - ensure serialization works for all types

**Code Pattern**:
```tsx
if (!block.params.payloadType) {
  // Fallback for unresolved type
  return <SliderWithInput ... />;
}

switch (block.params.payloadType) {
  case 'float':
    return <SliderWithInput ... />;
  case 'int':
    return <SliderWithInput step={1} ... />;
  case 'bool':
    return <Checkbox ... />;
  // ... etc
}
```

## Dependencies

- None - all UI components already exist

## Risks

- **Type mismatch after value change**: If user changes payloadType, old value may not be valid. Mitigation: Reset value to default when type changes.
- **Serialization for complex types**: vec2, color, shape need proper JSON serialization. Mitigation: Check existing patterns for these types.

## Related Work

- Item 2 (validation) will depend on this being implemented first
