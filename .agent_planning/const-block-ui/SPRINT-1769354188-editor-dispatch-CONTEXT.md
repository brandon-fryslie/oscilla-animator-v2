# Implementation Context: Type-Aware Const Editor

## Code Locations

### Current Const Editor (needs modification)
**File**: `src/ui/components/BlockInspector.tsx:1424-1435`

Current implementation hardcodes a float slider:
```tsx
<SliderWithInput
  value={numValue}
  onChange={(v) => handleConstValueChange(v)}
/>
```

### Const Block Definition
**File**: `src/blocks/signal-blocks.ts:31-159`

Defines the Const block with generic payload types:
- float, int, bool, vec2, color, shape, cameraProjection

### Type Resolution
**File**: `src/compiler/passes-v2/pass0-payload-resolution.ts`

Propagates resolved type to `block.params.payloadType`

### Existing UI Components to Reuse

**HintedControl** (BlockInspector.tsx:1849-1949):
- Already handles xy, color, boolean hints
- Can be reused for vec2 and bool

**ColorInput** (src/ui/components/common/ColorInput.tsx):
- Already exists for color picker
- Used elsewhere in codebase

**SliderWithInput** (existing):
- Currently used for float
- Can be extended with step=1 for int

## Value Serialization Notes

Values are stored as JSON strings in `block.params.value`. Examples:
- float: `"3.14"`
- int: `"42"`
- bool: `"true"` or `"false"`
- vec2: `"{\"x\":1,\"y\":2}"`
- color: `"{\"r\":1,\"g\":0,\"b\":0,\"a\":1}"` or `"#FF0000"`

When updating value, ensure proper JSON.stringify/parse for complex types.

## Implementation Strategy

1. **Step 1**: Add type guard for payloadType existence
2. **Step 2**: Create switch statement handling each type
3. **Step 3**: Reuse HintedControl for vec2/bool (minimal code)
4. **Step 4**: Reuse ColorInput for color
5. **Step 5**: Extend SliderWithInput for int constraints
6. **Step 6**: Add guidance text for shape/cameraProjection
7. **Step 7**: Test with various block connections

## Testing Strategy

- **Manual**: Connect Const blocks to different input port types, verify correct editor appears
- **Automated**: Could add component tests for each editor type (future work)

## Common Pitfalls to Avoid

1. **Forgotten imports**: ColorInput, HintedControl may need explicit imports
2. **Value format**: Ensure JSON serialization matches what BlockInspector expects
3. **Type transitions**: When payloadType changes, old value may be invalid - consider reset behavior
4. **Unresolved fallback**: Don't assume payloadType exists (validation hasn't run yet)
