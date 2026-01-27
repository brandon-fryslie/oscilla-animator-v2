# Implementation Context: Stride Architecture Debt

## Problem Summary

Stride (the number of scalar components per buffer element) is now intrinsic to `ConcretePayloadType`. Each payload type has a `.stride` field:

```typescript
export type ConcretePayloadType =
  | { readonly kind: 'float'; readonly stride: 1 }
  | { readonly kind: 'int'; readonly stride: 1 }
  | { readonly kind: 'bool'; readonly stride: 1 }
  | { readonly kind: 'vec2'; readonly stride: 2 }
  | { readonly kind: 'vec3'; readonly stride: 3 }
  | { readonly kind: 'color'; readonly stride: 4 }
  | { readonly kind: 'shape'; readonly stride: 8 }
  | { readonly kind: 'cameraProjection'; readonly stride: 1 };
```

**However, there are still HIGH priority architectural debts:**

1. **Duplicate switch statements in IRBuilderImpl.ts** that recompute stride instead of using `payload.stride` directly
2. **Hardcoded multipliers in renderers** (`i * 2`, `i * 3`, `i * 4`) instead of deriving stride from type information

**Constraint:** Stride must ALWAYS come from `payload.stride` (for concrete types) or `strideOf(type)` (which returns `payload.stride`). NO hardcoded constants like `STRIDE_POSITION = 2`, NO magic numbers in loops.

## Source of Truth: ConcretePayloadType.stride

**File:** `src/core/canonical-types.ts` (lines 167-175)

**Direct field access (preferred):**
```typescript
const stride = payload.stride;  // For ConcretePayloadType
```

**Or through strideOf() function:**
```typescript
export function strideOf(type: PayloadType): number {
  if (isPayloadVar(type)) {
    throw new Error(`Cannot get stride for payload variable ${type.id} - resolve payload first`);
  }
  // After check, type is ConcretePayloadType with stride field
  return (type as ConcretePayloadType).stride;
}
```

**Singleton instances (use these, not recreating objects):**
```typescript
export const FLOAT: ConcretePayloadType = { kind: 'float', stride: 1 } as const;
export const VEC2: ConcretePayloadType = { kind: 'vec2', stride: 2 } as const;
export const VEC3: ConcretePayloadType = { kind: 'vec3', stride: 3 } as const;
export const COLOR: ConcretePayloadType = { kind: 'color', stride: 4 } as const;
export const SHAPE: ConcretePayloadType = { kind: 'shape', stride: 8 } as const;
export const INT: ConcretePayloadType = { kind: 'int', stride: 1 } as const;
export const BOOL: ConcretePayloadType = { kind: 'bool', stride: 1 } as const;
export const CAMERA_PROJECTION: ConcretePayloadType = { kind: 'cameraProjection', stride: 1 } as const;
```

**Key Points:**
- Stride is intrinsic to `ConcretePayloadType` via `.stride` field
- Access stride via `payload.stride` (direct field access)
- Use `strideOf(type)` for PayloadType (handles both concrete and variables)
- All stride information derives from the type object itself
- No separate lookup table needed (stride is part of the type contract)

## HIGH Priority Issue 1: Duplicate Switch Statements in IRBuilderImpl.ts

**Location:** Lines 498-519 and 559-579

**Current Code:**
Recomputes stride with a switch statement instead of using `payload.stride` directly.

**Problem:**
- Duplicates stride logic that's already in the type object
- Violates DRY and ONE SOURCE OF TRUTH principles
- Makes stride harder to maintain (change in one place, must update here too)
- Special case logic (shape = 0) is scattered instead of localized

**Solution:**
Replace switch with direct access to `payload.stride`:
```typescript
// OLD (bad)
let stride: number;
switch (type.payload) {
  case 'vec2': stride = 2; break;
  // ... etc
}

// NEW (good)
const stride = strideOf(type.payload);  // Returns type.payload.stride
```

**Note on shape stride:** Shape has `stride: 8` in the type, but slot allocation may use different logic. Verify the special-case handling is intentional and document why shape differs from other payloads.

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
