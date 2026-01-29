# Implementation Context: Value Validation

## Code Locations

### Validation System
**File**: `src/diagnostics/validators/authoringValidators.ts`

Existing validators follow this pattern:
1. Named function: `validateXxx(block: Block): Diagnostic[]`
2. Return array of diagnostics (empty if valid)
3. Registered in validator registry at bottom of file

### Integration Point
**File**: `src/compiler/passes-v2/pass0-payload-resolution.ts`

After payload resolution, validation should run to check value matches type.

### Block Inspector (value change handler)
**File**: `src/ui/components/BlockInspector.tsx`

When user edits Const value, validation should re-run immediately.

## Validation Rules by Type

### float
- Must parse as number via `Number(value)`
- Should be finite (not Infinity or NaN)
- No hard range constraints (allow any valid float)

### int
- Must parse as integer (no decimal component)
- Check: `Number.isInteger(Number(value))`
- Auto-conversion acceptable: "3.0" → 3

### bool
- Valid values: "true", "false", "0", "1"
- Any other value → error

### vec2
- Must be object with `x` and `y` properties
- Both x and y must be numbers
- Example valid: `{x: 1.5, y: 2.3}`

### color
- Multiple formats acceptable:
  - RGB object: `{r: 0.5, g: 0.5, b: 0.5}` or `{r: 128, g: 128, b: 128}`
  - RGBA object: same with `a` property
  - Hex string: `"#FF0000"`
  - Named color: `"red"`
- Validation: try parsing with existing ColorInput logic

### shape
- Check for required shape descriptor properties
- See `src/shapes/types.ts` for ShapeDesc structure
- At minimum: `{ kind: string, ... }`

### cameraProjection
- Check for required projection properties
- See spec or type definition for CameraProjection structure
- At minimum: numeric scale and aspect ratio values

## Error Message Format

```
"Const block: value '3.5' doesn't match type 'int' (expected integer)"
```

Pattern:
1. Block type and name
2. Value and type mismatch
3. What was expected

## Value Format in Block

Values stored as JSON strings in `block.params.value`:
- Primitive: `"123"` or `"true"`
- Object: `"{\"x\":1,\"y\":2}"`

Parse with `JSON.parse()` before validation.

## Integration with Pass0

After payload resolution sets `block.params.payloadType`, run this validator to catch mismatches early.

## Edge Cases to Handle

1. **Null/undefined value**: Should be error (required field)
2. **Empty string value**: Should be error
3. **Unresolved type**: Skip validation (payloadType not yet set)
4. **Type mismatch after connection change**: Will be caught on next compile

## Testing Approach

Create test cases for each type with:
- Valid values (should pass)
- Invalid values (should fail with specific error)
- Edge cases (empty, null, extreme values)
