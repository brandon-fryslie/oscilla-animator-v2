# Definition of Done: Type-Aware Const Editor

## Pre-Implementation Checklist

- [ ] Read BlockInspector.tsx lines 1424-1435 (current const editor)
- [ ] Read HintedControl implementation (lines 1849-1949)
- [ ] Verify ColorInput exists and is imported
- [ ] Check how checkbox is rendered for other payload types
- [ ] Understand block.params.value serialization format

## Implementation Checklist

- [ ] Type-dispatch logic implemented
- [ ] All 7 payload types handled (float, int, bool, vec2, color, shape, cameraProjection)
- [ ] Unresolved type fallback implemented
- [ ] Value serialization/deserialization works for all types
- [ ] Type transitions reset value to safe default

## Testing Checklist

- [ ] Create/open Const block in editor
- [ ] Connect to float input port → show float slider
- [ ] Connect to int input port → show int slider (step=1)
- [ ] Connect to bool input port → show checkbox
- [ ] Connect to vec2 input port → show X/Y inputs
- [ ] Connect to color input port → show color picker
- [ ] Connect to shape input port → show guidance text
- [ ] Connect to cameraProjection input port → show guidance text
- [ ] Disconnect from port → fallback to float slider
- [ ] Change values for each type → values persist in block.params.value
- [ ] Switch connection between different types → value resets appropriately
- [ ] No console errors or warnings
- [ ] No React key warnings in DevTools

## Validation Checklist

- [ ] Type dispatch covers all payload types
- [ ] Each editor type matches its semantics
- [ ] Fallback behavior safe (float slider as default)
- [ ] Value changes don't cause compilation errors

## Code Quality

- [ ] No unused imports
- [ ] No console.logs left in
- [ ] Consistent with project code style
- [ ] Comments added for non-obvious logic
