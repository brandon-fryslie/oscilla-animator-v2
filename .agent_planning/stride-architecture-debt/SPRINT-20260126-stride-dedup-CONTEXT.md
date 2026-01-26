# Implementation Context: Stride Architecture Debt

## Problem Summary

Stride (the number of scalar components per buffer element) has two sources of truth:
1. **Canonical:** `PAYLOAD_STRIDE` lookup table in `src/core/canonical-types.ts`
2. **Duplicated:** Switch statements that recompute stride throughout the codebase

Additionally, renderers use hardcoded multipliers (`i * 2`, `i * 3`, `i * 4`) instead of deriving stride from the type system.

**Constraint:** Stride must NEVER be stored as a constant like `STRIDE_POSITION = 2`. It must always be computed from `strideOf(payloadType)`.

## Source of Truth: PAYLOAD_STRIDE

**File:** `src/core/canonical-types.ts` (lines 223-246)

```typescript
export const PAYLOAD_STRIDE: Record<ConcretePayloadType, number> = {
  float: 1,
  int: 1,
  bool: 1,
  vec2: 2,
  vec3: 3,
  color: 4,
  shape: 8,
  cameraProjection: 1,
};

export function strideOf(type: PayloadType): number {
  if (isPayloadVar(type)) {
    throw new Error(`Cannot get stride for payload variable ${type.id} - resolve payload first`);
  }
  return PAYLOAD_STRIDE[type as ConcretePayloadType];
}
```

**Key Points:**
- Only source of truth for stride
- Exported and available throughout codebase
- Requires concrete payload type (not a type variable)
- Returns 1-8 (scalar counts per element)

## High Priority Issues

### Issue 1: Duplicate Switch Statements in IRBuilderImpl.ts

**Location:** Lines 498-519 and 559-579

**Current Code:**
```typescript
let stride: number;
switch (type.payload) {
  case 'float':
  case 'int':
  case 'bool':
  case 'cameraProjection':
    stride = 1;
    break;
  case 'vec2':
    stride = 2;
    break;
  case 'vec3':
    stride = 3;
    break;
  case 'color':
    stride = 4;
    break;
  case 'shape':
    stride = 0; // Shape slots don't occupy f64 storage
    break;
  default:
    stride = 1; // Fallback (dangerous!)
}
```

**Problem:**
- Duplicated from canonical table
- Has fallback to 1 (dangerous for unknown types)
- Violates DRY principle
- If PAYLOAD_STRIDE changes, this code is out of sync

**Solution:**
Replace with direct call:
```typescript
const stride = strideOf(type.payload);
```

**Note:** The special case `stride = 0` for shape is interesting—verify this is intentional and document it.

---

### Issue 2: Hardcoded Stride Multipliers in Renderers

**Locations:**
- `src/render/canvas/Canvas2DRenderer.ts` (40+ instances)
- `src/render/svg/SVGRenderer.ts` (15+ instances)
- `src/runtime/RenderAssembler.ts` (20+ instances)

**Examples:**
```typescript
// Canvas2DRenderer.ts line 151
const x = position[i * 2] * width;  // Assumes position is vec2 (stride 2)

// Canvas2DRenderer.ts line 164
ctx.scale(scale2[i * 2], scale2[i * 2 + 1]);  // Assumes scale2 is vec2

// Canvas2DRenderer.ts line 183
ctx.fillStyle = rgbaToCSS(style.fillColor!, i * 4);  // Assumes color is RGBA (stride 4)

// RenderAssembler.ts line 226
pooledScreenPos[out * 2] = screenPosition[src * 2];  // stride 2 hardcoded
```

**Problem:**
- Magic numbers scattered throughout rendering code
- No connection to type system
- If a buffer type changes, multipliers must be updated in 20+ places
- Semantic label (e.g., "position") is used as a proxy for stride

**Solution Approach:**
The renderers need to know the stride of each buffer they process. Options:

**Option A: Type Information at Render Time**
- RenderAssembler knows the payload type of each buffer
- Passes type to renderers or renderers query it
- Renderers call `strideOf(type)` when accessing buffer elements

**Option B: Stride Metadata on Buffers**
- Each buffer carries a `stride` property alongside the data
- Renderers use `buffer.stride` directly
- No need to know payload type

**Option C: Type Information in RenderOp**
- RenderOp structures include type information for each buffer
- Renderers extract stride from the operation metadata

---

## Investigation Required for P1

Before implementing P1, you must answer:

1. **Does RenderAssembler have access to buffer types?**
   - Check: What information does RenderAssembler have about position, color, scale2 buffers?
   - Answer will determine whether stride comes from type or metadata

2. **What's the data contract between compilation and rendering?**
   - How are buffers created and passed to RenderAssembler?
   - What metadata travels with each buffer?

3. **Can renderers access type information?**
   - Do Canvas2DRenderer and SVGRenderer receive type hints?
   - Or do they only see raw buffer data?

**Suggested Investigation:**
```bash
# Trace RenderAssembler's public interface
grep -n "export.*RenderOp\|export.*assembleRenderFrame\|position.*Float32Array\|color.*buffer" src/runtime/RenderAssembler.ts | head -20

# Check RenderOp type definition
grep -n "export interface RenderOp\|position\|color\|scale2" src/compiler/ir/types.ts | head -30

# Check how renderers are called
grep -n "Canvas2DRenderer\|SVGRenderer" src/ui/components/ -r | head -20
```

---

## Files to Modify

### P0: High Confidence (Ready to implement)
1. **src/compiler/ir/IRBuilderImpl.ts**
   - Lines 498-519: Replace first switch with `strideOf()` call
   - Lines 559-579: Replace second switch with `strideOf()` call
   - Verify tests still pass

### P1: Medium Confidence (Requires investigation first)
1. **src/runtime/RenderAssembler.ts**
   - Understand type information available
   - Decide: type lookup or metadata attachment
   - Refactor stride-based operations

2. **src/render/canvas/Canvas2DRenderer.ts**
   - Determine stride lookup mechanism
   - Replace hardcoded multipliers (lines 151, 164, 183, etc.)

3. **src/render/svg/SVGRenderer.ts**
   - Determine stride lookup mechanism
   - Replace hardcoded multipliers (lines 41, 48, 55, etc.)

---

## Related Code Patterns (Good Examples)

**Pattern 1: Using strideOf() correctly**
```typescript
// src/blocks/math-blocks.ts (good)
stride: strideOf(outType.payload)
```

**Pattern 2: Field kernels using stride-aware indexing**
```typescript
// src/runtime/FieldKernels.ts (good - stride parameterized)
for (let i = 0; i < N; i++) {
  outArr[i * stride + lane] = value;  // stride is parameter, not hardcoded
}
```

**Pattern 3: What NOT to do**
```typescript
// ContinuityApply.ts:321 (bad - semantic-based heuristic)
const stride = semantic === 'position' ? 2 : 1;  // WRONG!

// IRBuilderImpl.ts:498 (bad - duplicate switch)
switch (type.payload) { ... }  // Should call strideOf() instead
```

---

## Testing Strategy

### P0 Testing
- Run existing test suite: `npm run test`
- No new tests needed (pure refactoring)
- Verify no behavioral changes

### P1 Testing
- **Unit tests:** Verify stride lookup mechanism works correctly
- **Rendering tests:** Steel-thread tests should produce identical output
- **Visual regression:** Compare rendered frames pixel-by-pixel
- **Type safety:** No TypeScript errors or `any` casts

---

## Performance Considerations

- **P0:** No performance impact (logic unchanged)
- **P1:** Minimal impact (function call vs. literal). Profile if concerned, but unlikely to matter since rendering is already I/O-bound

---

## Success Metrics

1. **No duplicate switch statements** on payload type remain in codebase
2. **All stride computations** trace back to `strideOf()` or documented metadata
3. **Tests pass** with no regressions
4. **Code is more maintainable** (DRY principle applied)
5. **Stride information** flows deterministically from type system
