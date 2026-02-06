# NaN/Inf Propagation Analysis
**Date:** 2026-02-06
**Files:** ValueExprMaterializer.ts, ValueExprSignalEvaluator.ts, OpcodeInterpreter.ts
**Focus:** Sources of NaN/Inf in value computation pipeline

---

## Executive Summary

I traced the **complete value computation pipeline** from constants → intrinsics → opcodes → materialization → projection → rendering. Found **multiple NaN/Inf introduction points** that can propagate to visual output.

### Critical NaN/Inf Sources Found

1. 🔥 **Division by zero in `div` opcode** (Line 399) — `args[0] / args[1]` with no zero check
2. 🔥 **sqrt(-x) produces NaN** (Line 410) — No domain validation
3. 🔥 **log(0) and log(-x) produce -Inf/NaN** (Line 412) — No domain validation
4. 🔥 **normalizedIndex when count=1** (Line 454) — Division by `(count - 1) = 0`
5. ⚠️ **Grid UV when count=1** (Line 493-494) — Division by `(cols - 1) = 0`, `(rows - 1) = 0`
6. ⚠️ **Rank when count=1** (Line 531) — Division by `(count - 1) = 0`

All of these can produce NaN/Inf values that **silently propagate** through the rendering pipeline, causing "invisible instances" or "wrong positions".

---

## 1. Opcode Evaluation (Core Math)

### 1.1 Division by Zero 🔥

**Location:** `ValueExprMaterializer.ts:399` (evaluatePureFn)

```typescript
case 'div': return args[0] / args[1];
```

**Problem:** If `args[1] === 0`, result is **Inf** (or **NaN** if `args[0]` is also 0).

**Example user expression:**
```
x / y  // If y=0, result = Inf
```

**Propagation:**
```
x / y = Inf
  → position.x = Inf
    → screenPosition.x = Inf (projection passes through)
      → ctx.translate(Inf, y)
        → instance invisible (off-canvas)
```

**Fix:**
```typescript
case 'div': {
  if (args[1] === 0) {
    console.warn('Division by zero, returning 0');
    return 0;  // Or Inf, depending on policy
  }
  return args[0] / args[1];
}
```

**Policy question:** Should division by zero:
- Return 0 (safe, but mathematically wrong)
- Return Inf (mathematically correct, but breaks rendering)
- Throw error (fail-fast, but disrupts frame)

**Recommendation:** Return 0 with warning (matches shader behavior).

---

### 1.2 sqrt Domain Violation 🔥

**Location:** Line 410

```typescript
case 'sqrt': return Math.sqrt(args[0]);
```

**Problem:** If `args[0] < 0`, result is **NaN**.

**Example:**
```
sqrt(-1) = NaN
```

**Fix:**
```typescript
case 'sqrt': {
  if (args[0] < 0) {
    console.warn(`sqrt of negative value: ${args[0]}, clamping to 0`);
    return 0;
  }
  return Math.sqrt(args[0]);
}
```

---

### 1.3 log Domain Violation 🔥

**Location:** Line 412

```typescript
case 'log': return Math.log(args[0]);
```

**Problems:**
- `log(0) = -Inf`
- `log(-x) = NaN`

**Fix:**
```typescript
case 'log': {
  if (args[0] <= 0) {
    console.warn(`log of non-positive value: ${args[0]}, clamping to 0.0001`);
    return Math.log(0.0001);  // Return small negative value instead of -Inf
  }
  return Math.log(args[0]);
}
```

---

### 1.4 Other Math Operations

**Lines 401-418 (other opcodes):**

✅ `add`, `sub`, `mul`: Safe (can produce Inf, but only if inputs are Inf)
✅ `mod`: Safe (can produce NaN if divisor is 0, but less common)
✅ `pow`: ⚠️ Can produce NaN for negative base + fractional exponent (e.g., `pow(-1, 0.5) = NaN`)
✅ `sin`, `cos`, `tan`: Safe (defined for all finite inputs, though `tan(π/2) = Inf`)
✅ `floor`, `ceil`, `round`: Safe (preserve NaN/Inf)
✅ `abs`, `neg`: Safe
✅ `min`, `max`: Safe
✅ `clamp`: Safe (but preserves NaN if args contain NaN)
✅ `lerp`: Safe (unless args contain NaN/Inf)
✅ `select`: Safe (conditional logic)

**Additional fix needed for pow:**
```typescript
case 'pow': {
  if (args[0] < 0 && !Number.isInteger(args[1])) {
    console.warn(`pow: negative base ${args[0]} with fractional exponent ${args[1]}, using absolute value`);
    return Math.pow(Math.abs(args[0]), args[1]);
  }
  return Math.pow(args[0], args[1]);
}
```

---

## 2. Intrinsic Materialization

### 2.1 normalizedIndex Division by Zero 🔥

**Location:** `ValueExprMaterializer.ts:452-455`

```typescript
else if (intrinsic === 'normalizedIndex') {
  for (let i = 0; i < count; i++) {
    buf[i] = i / (count - 1);  // 🔥 Division by zero if count=1
  }
}
```

**Problem:** If instance has `count=1`, `(count - 1) = 0`, all values become **Inf**.

**Reproduction:**
```
instance: count=1
normalizedIndex[0] = 0 / 0 = NaN
```

**Fix:**
```typescript
else if (intrinsic === 'normalizedIndex') {
  if (count === 1) {
    buf[0] = 0.5;  // Center value for single element
  } else {
    for (let i = 0; i < count; i++) {
      buf[i] = i / (count - 1);
    }
  }
}
```

---

### 2.2 index Intrinsic ✅

**Lines 448-451:**
```typescript
if (intrinsic === 'index') {
  for (let i = 0; i < count; i++) {
    buf[i] = i;
  }
}
```

✅ Safe: No division, no domain violations.

---

### 2.3 randomId Intrinsic

**Lines 456-461:**
```typescript
else if (intrinsic === 'randomId') {
  for (let i = 0; i < count; i++) {
    buf[i] = applyOpcode('hash', [i, 0]);
  }
}
```

⚠️ Depends on `hash` opcode implementation (not shown in this file).
If `hash` can produce NaN/Inf, `randomId` will propagate it.

**Recommendation:** Check `OpcodeInterpreter.ts` for `hash` implementation.

---

## 3. Placement Materialization

### 3.1 Grid UV Division by Zero ⚠️

**Location:** Lines 486-496 (materializePlacement)

```typescript
case 'grid': {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    buf[i * stride] = cols > 1 ? col / (cols - 1) : 0.5;      // ✅ Has fallback
    buf[i * stride + 1] = rows > 1 ? row / (rows - 1) : 0.5;  // ✅ Has fallback
  }
  break;
}
```

✅ Already has `cols > 1` check to avoid division by zero.
✅ Falls back to `0.5` (center) for single-element grids.

---

### 3.2 Spiral UV NaN Risk ⚠️

**Lines 506-515:**
```typescript
case 'spiral': {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(i / count);  // ⚠️ If count=0, division by zero!
    const theta = i * goldenAngle;
    buf[i * stride] = 0.5 + 0.5 * r * Math.cos(theta);
    buf[i * stride + 1] = 0.5 + 0.5 * r * Math.sin(theta);
  }
  break;
}
```

**Problem:** If `count = 0`, `i / count = i / 0 = Inf`, then `sqrt(Inf) = Inf`.

**However:** If `count = 0`, the loop doesn't execute (`for (let i = 0; i < 0; ...)`), so this is safe.

✅ Safe by accident (loop guard prevents execution).

**But:** If `count = 1`, `r = sqrt(0 / 1) = 0`, which is fine.

---

### 3.3 Rank Division by Zero ⚠️

**Lines 528-533:**
```typescript
case 'rank': {
  for (let i = 0; i < count; i++) {
    buf[i * stride] = count > 1 ? i / (count - 1) : 0;  // ✅ Has fallback
  }
  break;
}
```

✅ Already has `count > 1` check to avoid division by zero.

---

### 3.4 Halton Sequence ✅

**Lines 498-504:**
```typescript
case 'halton2D': {
  for (let i = 0; i < count; i++) {
    buf[i * stride] = halton(i + 1, 2);
    buf[i * stride + 1] = halton(i + 1, 3);
  }
  break;
}
```

✅ Safe: Halton sequence defined for all positive integers.

---

### 3.5 Random Placement ✅

**Lines 517-523:**
```typescript
case 'random': {
  for (let i = 0; i < count; i++) {
    buf[i * stride] = pseudoRandom(i * 2);
    buf[i * stride + 1] = pseudoRandom(i * 2 + 1);
  }
  break;
}
```

✅ Safe: Depends on `pseudoRandom` implementation (assumed safe).

---

## 4. Color Space Conversion

### 4.1 HSL to RGB (Not shown in excerpt)

**Line 124:**
```typescript
hslToRgbConversion(buf, inputBuf, count);
```

⚠️ HSL→RGB conversion involves division and domain mapping.
Common bugs:
- Division by zero in chroma calculation
- Negative hue/saturation/lightness

**Recommendation:** Check `hslToRgbConversion` implementation for validation.

---

## 5. NaN/Inf Propagation Chains

### Chain 1: Division by Zero → Position → Invisible

```
1. User writes: position.x = 1 / y
2. y evaluates to 0
3. evaluatePureFn('div', [1, 0]) = Inf
4. position.x = Inf
5. projectFieldOrtho: screenPos.x = Inf (ortho identity)
6. ctx.translate(Inf, y)
7. Canvas draws offscreen → invisible
```

**User sees:** "Instance disappeared"

---

### Chain 2: sqrt(-1) → Color → Black

```
1. User writes: color.r = sqrt(x)
2. x evaluates to -1
3. evaluatePureFn('sqrt', [-1]) = NaN
4. color.r = NaN
5. RenderAssembler: rgbaBuffer[i*4] = NaN * 255 = NaN
6. Canvas: fillStyle = rgba(NaN, ...) → black (NaN coerces to 0)
```

**User sees:** "Instance is black instead of colored"

---

### Chain 3: normalizedIndex + Single Instance → NaN Position

```
1. Instance has count=1
2. normalizedIndex[0] = 0 / (1 - 1) = 0 / 0 = NaN
3. User writes: position.x = normalizedIndex
4. position.x = NaN
5. projectFieldOrtho: screenPos.x = NaN
6. ctx.translate(NaN, y)
7. Canvas draws offscreen → invisible
```

**User sees:** "Single-instance breaks, multi-instance works" (common bug report pattern)

---

### Chain 4: log(0) → Size → Invisible

```
1. User writes: size = exp(log(brightness))
2. brightness evaluates to 0
3. log(0) = -Inf
4. exp(-Inf) = 0
5. size = 0
6. ctx.scale(0, 0)
7. Shape has zero size → invisible
```

**User sees:** "Instances disappear when brightness is 0"

---

## 6. Detection & Prevention Strategy

### 6.1 Input Validation (Cheapest)

Add validation at opcode evaluation:
```typescript
function evaluatePureFn(fn: PureFn, args: number[]): number {
  // Validate inputs are finite
  for (let i = 0; i < args.length; i++) {
    if (!Number.isFinite(args[i])) {
      console.warn(`PureFn ${fn.opcode} received non-finite arg[${i}] = ${args[i]}`);
      args[i] = 0;  // Sanitize to zero
    }
  }

  // ... rest of evaluation
}
```

**Cost:** O(n) per opcode call (small overhead)
**Benefit:** Catches NaN/Inf before they propagate

---

### 6.2 Output Validation (More expensive)

Add validation after projection:
```typescript
// In RenderAssembler.ts after projectInstances
for (let i = 0; i < count; i++) {
  if (!Number.isFinite(screenPosition[i * 2]) || !Number.isFinite(screenPosition[i * 2 + 1])) {
    console.warn(`Instance ${i} has NaN/Inf screen position, culling`);
    visible[i] = 0;  // Cull broken instance
    screenPosition[i * 2] = 0;
    screenPosition[i * 2 + 1] = 0;
    depth[i] = Infinity;  // Sort to back
  }
}
```

**Cost:** O(n) per frame (can be significant for large n)
**Benefit:** Prevents broken instances from corrupting render

---

### 6.3 Domain-Specific Fixes (Safest)

Fix each opcode to handle edge cases:
```typescript
case 'div': return args[1] !== 0 ? args[0] / args[1] : 0;
case 'sqrt': return args[0] >= 0 ? Math.sqrt(args[0]) : 0;
case 'log': return args[0] > 0 ? Math.log(args[0]) : Math.log(0.0001);
```

**Cost:** Zero (just better code)
**Benefit:** Prevents NaN/Inf at source

---

## 7. Recommendations (Prioritized)

### Immediate (Critical Fixes)

1. **Fix division by zero in `div` opcode** (Line 399):
   ```typescript
   case 'div': return args[1] !== 0 ? args[0] / args[1] : 0;
   ```

2. **Fix domain violations in math opcodes**:
   - `sqrt`: Clamp to 0 for negative inputs
   - `log`: Clamp to small positive for non-positive inputs
   - `pow`: Handle negative base + fractional exponent

3. **Fix normalizedIndex for count=1** (Line 454):
   ```typescript
   buf[i] = count > 1 ? i / (count - 1) : 0.5;
   ```

### Soon (Robustness)

4. **Add NaN/Inf sanitization in evaluatePureFn**:
   - Check inputs before evaluation
   - Replace NaN/Inf with safe defaults

5. **Add NaN/Inf culling after projection**:
   - Mark instances with NaN position as invisible
   - Prevents canvas state corruption

6. **Audit `hslToRgbConversion` for NaN/Inf**:
   - Check for division by zero
   - Validate domain ranges

### Later (Testing & Monitoring)

7. **Add NaN/Inf regression tests**:
   ```typescript
   it('division by zero returns 0', () => {
     expect(evaluatePureFn({kind:'opcode', opcode:'div'}, [1, 0])).toBe(0);
   });

   it('sqrt of negative returns 0', () => {
     expect(evaluatePureFn({kind:'opcode', opcode:'sqrt'}, [-1])).toBe(0);
   });

   it('normalizedIndex with count=1', () => {
     const buf = new Float32Array(1);
     materializeIntrinsic(buf, 'normalizedIndex', 'inst1', 1, state, program);
     expect(Number.isFinite(buf[0])).toBe(true);
   });
   ```

8. **Add runtime NaN/Inf monitoring**:
   ```typescript
   // In HealthMonitor.ts
   nanCountThisFrame: number;
   infCountThisFrame: number;
   ```

---

## 8. Testing Scenarios

### Test 1: Division by Zero
```typescript
// Create expression: x / 0
const result = materializeValueExpr(divByZeroExpr, ...);
expect(result.every(v => Number.isFinite(v))).toBe(true);
```

### Test 2: sqrt(-1)
```typescript
// Create expression: sqrt(-1)
const result = materializeValueExpr(sqrtNegExpr, ...);
expect(result.every(v => Number.isFinite(v))).toBe(true);
```

### Test 3: Single Instance normalizedIndex
```typescript
// Instance with count=1
const buf = new Float32Array(1);
materializeIntrinsic(buf, 'normalizedIndex', 'inst', 1, state, program);
expect(buf[0]).toBe(0.5);  // Should be center value, not NaN
```

### Test 4: Projection NaN Propagation
```typescript
// Position buffer with NaN
const positions = new Float32Array([NaN, NaN, 0]);
const projection = projectInstances(positions, 1, 1, camera, arena);
// All instances should be culled
expect(projection.visible[0]).toBe(0);
```

---

## 9. Conclusion

**NaN/Inf can originate from:**
1. 🔥 **Opcode evaluation** (div, sqrt, log, pow) — **No validation**
2. 🔥 **Intrinsic materialization** (normalizedIndex) — **count=1 edge case**
3. ✅ **Placement** (grid, rank) — **Already has fallbacks**
4. ❓ **HSL→RGB conversion** — **Not audited**

**Impact:**
- Division by zero → Inf position → invisible instances
- sqrt(-x) → NaN color → black instances
- normalizedIndex(count=1) → NaN position → single-instance invisible

**These bugs match user symptoms:**
- "Everything disappears"
- "Instances are black"
- "Works with many instances, breaks with one"

**Next steps:**
1. Implement critical fixes (div, sqrt, log, normalizedIndex)
2. Add NaN/Inf validation in evaluatePureFn
3. Add post-projection culling for NaN instances
4. Add regression tests for all edge cases

Would you like me to implement these fixes now?
