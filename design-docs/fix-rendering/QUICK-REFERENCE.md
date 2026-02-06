# Rendering Bug Investigation - Quick Reference
**For:** Developers fixing rendering bugs
**Last Updated:** 2026-02-06

---

## Common Symptoms → Root Cause

| User Reports... | Check... | Likely Bug |
|-----------------|----------|------------|
| "Everything disappeared" | Camera position, projection kernels | Degenerate camera (#1, #2) |
| "Single instance doesn't render" | normalizedIndex, count=1 cases | Bug #5 |
| "Instances are black" | Color expressions using sqrt/log | Domain violation (#4) |
| "Rotated shapes render at 2x angle" | ELLIPSE/RECT rotation params | Double rotation (#6) |
| "Division by zero error" | User expressions with `/` operator | Bug #3 |
| "Flickering visuals" | Depth sorting, NaN in projection | Depth bugs (#7, #8) |
| "Performance degradation" | RECT rendering | Redundant save/restore |

---

## Quick Diagnostic Checklist

### Camera Issues
```typescript
// Check if camera is degenerate
const camToTarget = {
  dx: camPosX - camTargetX,
  dy: camPosY - camTargetY,
  dz: camPosZ - camTargetZ,
};
const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

if (distance < 1e-6) {
  console.error('Degenerate camera: camPos === camTarget');
  // Bug #1
}

if (Math.abs(tilt) > 89 * Math.PI / 180) {
  console.warn('Near-vertical tilt may cause parallel up vector');
  // Bug #2
}
```

### Projection Validation
```typescript
// After projectInstances()
for (let i = 0; i < count; i++) {
  if (!Number.isFinite(screenPosition[i*2]) || !Number.isFinite(screenPosition[i*2+1])) {
    console.error(`Instance ${i} has NaN/Inf screen position`);
    // Bugs #1-5 propagated to projection
  }
  if (depth[i] < 0) {
    console.warn(`Instance ${i} has negative depth: ${depth[i]}`);
    // Bug #7
  }
}
```

### Value Computation
```typescript
// Check user expressions for division by zero
if (expr.opcode === 'div' && rightValue === 0) {
  console.error('Division by zero in user expression');
  // Bug #3
}

// Check domain violations
if (expr.opcode === 'sqrt' && arg < 0) {
  console.error('sqrt of negative value');
  // Bug #4
}
if (expr.opcode === 'log' && arg <= 0) {
  console.error('log of non-positive value');
  // Bug #4
}
```

---

## Files to Check by Symptom

### Invisible Instances
1. `src/projection/perspective-kernel.ts` — Lines 157-163, 166-172
2. `src/projection/ortho-kernel.ts` — Line 85
3. `src/runtime/ValueExprMaterializer.ts` — Lines 399, 410, 412, 454

### Wrong Colors
1. `src/runtime/ValueExprMaterializer.ts` — Lines 410, 412 (sqrt, log)
2. Color space conversion (hslToRgb)

### Wrong Positions/Transforms
1. `src/shapes/topologies.ts` — Lines 34, 64 (rotation)
2. `src/projection/*-kernel.ts` — Lines 85, 245 (depth)
3. `src/render/canvas/Canvas2DRenderer.ts` — Lines 154-209 (transforms)

---

## Bug Fix Templates

### Template 1: Add Domain Validation
```typescript
// Before
case 'sqrt': return Math.sqrt(args[0]);

// After
case 'sqrt': {
  if (args[0] < 0) {
    console.warn(`sqrt of negative value: ${args[0]}, clamping to 0`);
    return 0;
  }
  return Math.sqrt(args[0]);
}
```

### Template 2: Add Division-by-Zero Check
```typescript
// Before
const result = numerator / denominator;

// After
const result = denominator !== 0 ? numerator / denominator : 0;
```

### Template 3: Add Fallback for Normalization
```typescript
// Before
const len = Math.sqrt(x*x + y*y + z*z);
x /= len;
y /= len;
z /= len;

// After
const len = Math.sqrt(x*x + y*y + z*z);
if (len < 1e-6) {
  // Degenerate: use default vector
  x = 0; y = 0; z = 1;
} else {
  x /= len;
  y /= len;
  z /= len;
}
```

### Template 4: Add NaN/Inf Sanitization
```typescript
// Before
out[i] = someComputation();

// After
const value = someComputation();
if (!Number.isFinite(value)) {
  console.warn(`Non-finite value at index ${i}: ${value}`);
  out[i] = 0;  // Safe default
} else {
  out[i] = value;
}
```

---

## Test Patterns

### Pattern 1: Edge Case Regression Test
```typescript
describe('Bug #X: Description', () => {
  it('handles edge case correctly', () => {
    const result = functionUnderTest(edgeCaseInput);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(expectedValue);
  });
});
```

### Pattern 2: Propagation Chain Test
```typescript
describe('Bug #X: NaN Propagation', () => {
  it('does not propagate NaN through pipeline', () => {
    const input = createInputWithNaN();
    const output = renderPipeline(input);
    expect(output.ops.length).toBeGreaterThan(0);
    expect(output.ops[0].instances.count).toBeGreaterThan(0);
  });
});
```

### Pattern 3: Visual Regression Test
```typescript
describe('Bug #X: Visual Regression', () => {
  it('renders correctly for edge case', async () => {
    const frame = renderFrame(edgeCaseSetup);
    const screenshot = await captureCanvas();
    expect(screenshot).toMatchSnapshot();
  });
});
```

---

## Performance Profiling

### Check Hotspots
```typescript
// Measure projection time
const t0 = performance.now();
const projection = projectInstances(...);
const tProj = performance.now() - t0;
if (tProj > 5) {
  console.warn(`Projection took ${tProj}ms for ${count} instances`);
}

// Measure render time
const t1 = performance.now();
renderFrame(ctx, frame, width, height);
const tRender = performance.now() - t1;
if (tRender > 16) {
  console.warn(`Render took ${tRender}ms (missed 60fps)`);
}
```

### Common Performance Issues
- Redundant save/restore in RECT (Bug #14)
- Repeated projection for grouped instances (already optimized)
- Arena overflow causing reallocation (check peak stats)

---

## Validation Helpers

### NaN/Inf Checker
```typescript
function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is not finite: ${value}`);
  }
}

// Usage
assertFinite(screenPos[i*2], `screenPos[${i}].x`);
assertFinite(depth[i], `depth[${i}]`);
```

### Buffer Bounds Checker
```typescript
function assertBufferSize(buf: Float32Array, expectedSize: number, name: string): void {
  if (buf.length < expectedSize) {
    throw new Error(`${name} too small: expected ${expectedSize}, got ${buf.length}`);
  }
}

// Usage
assertBufferSize(outScreenPos, N * 2, 'outScreenPos');
```

### Camera Validator
```typescript
function validateCamera(camera: PerspectiveCameraParams): void {
  const distance = Math.sqrt(
    Math.pow(camera.camPosX - camera.camTargetX, 2) +
    Math.pow(camera.camPosY - camera.camTargetY, 2) +
    Math.pow(camera.camPosZ - camera.camTargetZ, 2)
  );

  if (distance < 1e-6) {
    throw new Error('Degenerate camera: camPos === camTarget');
  }

  if (camera.far <= camera.near) {
    throw new Error('Invalid depth range: far <= near');
  }
}
```

---

## Debugging Commands

### Enable Verbose Logging
```typescript
// In browser console
localStorage.setItem('debug:projection', 'true');
localStorage.setItem('debug:rendering', 'true');
```

### Inspect Render Frame
```typescript
// After assembleRenderFrame()
console.log('Render frame:', {
  ops: frame.ops.length,
  totalInstances: frame.ops.reduce((sum, op) => sum + op.instances.count, 0),
  firstOp: frame.ops[0],
});
```

### Check Arena Stats
```typescript
const stats = arena.getPeakStats();
console.log('Arena peak usage:', {
  f32: `${stats.peakF32}/${stats.maxElements}`,
  vec2: `${stats.peakVec2}/${stats.maxElements}`,
  vec3: `${stats.peakVec3}/${stats.maxElements}`,
  rgba: `${stats.peakRGBA}/${stats.maxElements}`,
});
```

---

## When to Escalate

### Escalate if:
1. Bug persists after implementing documented fix
2. New symptom not covered in this guide
3. Performance regression after fix (>5% slowdown)
4. Fix causes test failures in unrelated code

### Before Escalating:
1. ✅ Check all 15 documented bugs
2. ✅ Run full test suite
3. ✅ Profile with Chrome DevTools
4. ✅ Capture minimal reproduction case
5. ✅ Check recent git commits for regressions

---

## Related Documentation

- **Full Investigation:** [00-INDEX.md](./00-INDEX.md)
- **Summary:** [SUMMARY.md](./SUMMARY.md)
- **Projection Bugs:** [02-projection-kernel-analysis.md](./02-projection-kernel-analysis.md)
- **NaN Propagation:** [04-nan-propagation-analysis.md](./04-nan-propagation-analysis.md)

---

**End of Quick Reference**

*For detailed analysis, see full investigation docs.*
