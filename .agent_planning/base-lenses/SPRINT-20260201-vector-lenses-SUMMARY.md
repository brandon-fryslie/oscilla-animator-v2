# Sprint Summary: Vector Component Lenses (Extract/Construct)
Date: 2026-02-01
Status: ✓ COMPLETE

## Objective
Implement Extract and Construct lenses for accessing/building vector components from/to vec3 payloads.

## What Was Built

### 1. Extract Block
**File**: `src/blocks/lens/extract.ts`

```typescript
// Extract a single scalar component from vec3
// Example: extract(vec3(1,2,3), component=1) → 2.0
{
  type: 'Extract',
  category: 'lens',
  inputs: {
    in: vec3,
    component: 0|1|2 (config, not exposed as port)
  },
  outputs: {
    out: float
  }
}
```

**Key Features**:
- Type-CHANGING lens (vec3 → float)
- Uses native IR `ctx.b.extract(input, componentIndex, outputType)`
- Component validation (0-2 for vec3)
- Follows standard in/out port convention (discoverable via UI)

### 2. Construct Block
**File**: `src/blocks/lens/construct.ts`

```typescript
// Construct vec3 from three scalar components
// Example: construct(1.0, 2.0, 3.0) → vec3(1, 2, 3)
{
  type: 'Construct',
  category: 'lens',
  inputs: {
    x: float,
    y: float,
    z: float
  },
  outputs: {
    out: vec3
  }
}
```

**Key Features**:
- Type-CHANGING lens (float → vec3)
- Uses native IR `ctx.b.construct([x, y, z], outputType)`
- All inputs exposed as ports (multi-input block)
- Does NOT follow in/out convention (intentionally not discoverable via standard lens picker)

### 3. Tests
**File**: `src/blocks/lens/__tests__/vector-lenses.test.ts`

- 18 comprehensive tests
- Registration verification
- Port structure validation
- Type-changing behavior verification
- Discoverability testing (Extract: yes, Construct: no)

## Critical Discoveries

### IR Already Supports This
The research phase revealed that the IR has native support for component extraction and construction:

**Extract Pattern** (from `SplitColorHSL`):
```typescript
const h = ctx.b.extract(colorInput.id, 0, hueType);  // Extract component 0
```

**Construct Pattern** (from `MakeColorHSL`):
```typescript
const result = ctx.b.construct([h, s, l, a], outType);  // Pack components
```

**No IR extensions were needed** - the existing `ValueExprExtract` and `ValueExprConstruct` IR nodes fully support this functionality.

## Implementation Patterns

### Reference Implementations
- **Extract**: Followed `SplitColorHSL` pattern
- **Construct**: Followed `MakeColorHSL` pattern

### Lens Block Characteristics
All lens blocks share these properties:
- `category: 'lens'`
- `NO adapterSpec` (never auto-inserted)
- `capability: 'pure'` (for these blocks)
- `cardinalityMode: 'preserve'`

### Type-Changing vs Type-Preserving
- **Sprint 1-2 lenses**: Type-PRESERVING (input type == output type)
  - ScaleBias, Clamp, Wrap01, etc. all have `in: float → out: float`
- **Sprint 3 lenses**: Type-CHANGING (input type ≠ output type)
  - Extract: `in: vec3 → out: float`
  - Construct: `x/y/z: float → out: vec3`

## Discoverability Design Decision

The `getAvailableLensTypes()` function filters for blocks with standard `in`/`out` ports:

```typescript
.map(def => ({
  inputType: def.inputs['in']?.type,
  outputType: def.outputs['out']?.type,
}))
.filter(info => !!info.inputType && !!info.outputType)
```

**Result**:
- ✓ Extract: Discoverable (has `in`/`out`)
- ✗ Construct: Not discoverable (has `x`/`y`/`z`, not `in`)

This is **intentional** - Construct is a multi-input block with a different semantic purpose (assembly vs transformation).

## Test Results

**All tests pass**:
- 18 vector lens tests
- 82 total lens tests
- 2173 total project tests

**Pre-existing issues** (unrelated to this work):
- TypeScript compilation has 5 pre-existing errors in UI code
- Vitest reports 1 unhandled error during test run (pre-existing)

## Files Modified/Created

**New Files**:
- `src/blocks/lens/extract.ts` (54 lines)
- `src/blocks/lens/construct.ts` (57 lines)
- `src/blocks/lens/__tests__/vector-lenses.test.ts` (173 lines)

**Modified Files**:
- `src/blocks/lens/index.ts` (added imports)

**Total**: 284 lines added, 2 lines modified

## Git Commit

```
8125c57 feat(lens): add Extract and Construct vector component lenses
```

## Architectural Notes

### IR Operation Signatures

```typescript
// IRBuilder methods used
extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId
construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId
```

### Runtime Behavior

**Extract**: Reads single component from strided buffer
```typescript
// Pseudocode
outputBuf[i] = inputBuf[i * inputStride + componentIndex]
```

**Construct**: Interleaves components into strided buffer
```typescript
// Pseudocode
for (c = 0; c < numComponents; c++) {
  outputBuf[i * outStride + c] = componentBufs[c][i]
}
```

### Payload Stride

The implementation uses `payloadStride(type.payload)` to determine buffer layouts:
- `float`: stride 1
- `vec2`: stride 2
- `vec3`: stride 3
- `color`: stride 4

## Lessons Learned

1. **Research First**: The PLAN document flagged this as "RESEARCH REQUIRED" - research revealed no IR work was needed
2. **Reference Implementations**: Color blocks provided perfect examples of extract/construct patterns
3. **Test Discoverability**: Understanding `getAvailableLensTypes()` filtering logic was crucial for correct test design
4. **Type-Changing Is Different**: These lenses break the "input type == output type" assumption from Sprint 1-2

## Ready for Evaluation

✓ All Definition of Done criteria met
✓ Tests comprehensive and passing
✓ Code follows existing patterns
✓ No regressions
✓ Documentation complete

**Status**: READY FOR USER REVIEW
