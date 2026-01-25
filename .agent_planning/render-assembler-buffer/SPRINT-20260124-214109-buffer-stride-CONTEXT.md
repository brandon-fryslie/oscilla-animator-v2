# Implementation Context: buffer-stride
Generated: 2026-01-24-214109
Plan: SPRINT-20260124-214109-buffer-stride-PLAN.md
Source: EVALUATION-20260124-213847.md

## File 1: RenderAssembler.test.ts

**Path**: `/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/RenderAssembler.test.ts`

### Line 231 - Reference Equality Fix

**Current code** (line 231):
```typescript
expect(op.instances.position).toBe(positionBuffer);
```

**Replace with**:
```typescript
expect(op.instances.position).toBeInstanceOf(Float32Array);
expect(op.instances.position).toHaveLength(4); // 2 instances x stride-2
```

**Context** (lines 169-172):
```typescript
it('assembles DrawPathInstancesOp for path topologies', () => {
  const state = createMockState();
  const positionBuffer = new Float32Array([0.1, 0.2, 0.3, 0.4]); // 2 instances
```

The input is already stride-2 (4 floats for 2 instances). Output will also be stride-2 but in a new buffer.

---

## File 2: RenderAssembler-per-instance-shapes.test.ts

**Path**: `/Users/bmf/code/oscilla-animator-v2/src/runtime/__tests__/RenderAssembler-per-instance-shapes.test.ts`

### Lines 433-436 - Circle Position Expectation

**Current code**:
```typescript
expect(circleOp.instances.position).toEqual(new Float32Array([
  0.1, 0.1, 0, // instance 0 (vec3)
  0.4, 0.4, 0, // instance 3 (vec3)
]));
```

**Replace with**:
```typescript
expect(circleOp.instances.position).toEqual(new Float32Array([
  0.1, 0.1, // instance 0 (projected vec2)
  0.4, 0.4, // instance 3 (projected vec2)
]));
```

### Lines 444-447 - Square Position Expectation

**Current code**:
```typescript
expect(squareOp.instances.position).toEqual(new Float32Array([
  0.2, 0.2, 0, // instance 1 (vec3)
  0.3, 0.3, 0, // instance 2 (vec3)
]));
```

**Replace with**:
```typescript
expect(squareOp.instances.position).toEqual(new Float32Array([
  0.2, 0.2, // instance 1 (projected vec2)
  0.3, 0.3, // instance 2 (projected vec2)
]));
```

**Context** (lines 373-380 - input buffer setup):
```typescript
const positionBuffer = new Float32Array([
  0.1, 0.1, 0, // instance 0 (circle) - vec3
  0.2, 0.2, 0, // instance 1 (square) - vec3
  0.3, 0.3, 0, // instance 2 (square) - vec3
  0.4, 0.4, 0, // instance 3 (circle) - vec3
]);
```

Input is stride-3, but projection outputs stride-2 discarding z.

---

## File 3: level1-vec3-data.test.ts

**Path**: `/Users/bmf/code/oscilla-animator-v2/src/projection/__tests__/level1-vec3-data.test.ts`

### Lines 231-243 - Buffer Length and Validation Loop

**Current code**:
```typescript
// L1 INVARIANT: position buffer is contiguous Float32Array with stride 3
expect(position).toBeInstanceOf(Float32Array);
expect(position.length).toBe(N * 3); // 16 instances × 3 floats per position

// All z values must be exactly 0.0, all x/y must be finite
for (let i = 0; i < N; i++) {
  const x = position[i * 3 + 0];
  const y = position[i * 3 + 1];
  const z = position[i * 3 + 2];
  expect(Number.isFinite(x)).toBe(true);
  expect(Number.isFinite(y)).toBe(true);
  expect(z).toBe(0.0); // Explicit z=0.0, written by gridLayout kernel
}
```

**Replace with**:
```typescript
// L1 INVARIANT: position buffer is contiguous Float32Array with stride 2 (projected)
expect(position).toBeInstanceOf(Float32Array);
expect(position.length).toBe(N * 2); // 16 instances × 2 floats per position

// All x/y values must be finite (z discarded by projection)
for (let i = 0; i < N; i++) {
  const x = position[i * 2 + 0];
  const y = position[i * 2 + 1];
  expect(Number.isFinite(x)).toBe(true);
  expect(Number.isFinite(y)).toBe(true);
}
```

**Context**:
- N = 16 (defined earlier in test)
- Test uses `executeFrame()` which includes projection
- GridLayout produces stride-3 world-space positions
- Projection converts to stride-2 screen-space positions

---

## Reference: Projection Contract

**File**: `/Users/bmf/code/oscilla-animator-v2/src/runtime/RenderAssembler.ts`

**Lines 87-89** - ProjectionOutput interface:
```typescript
export interface ProjectionOutput {
  /** Screen-space positions (Float32Array, stride 2, normalized [0,1]) */
  screenPosition: Float32Array;
```

**Line 243** - Allocation:
```typescript
const screenPosition = new Float32Array(count * 2);
```

---

## Pattern Reference

See passing projection tests for stride-2 expectations:
- `/Users/bmf/code/oscilla-animator-v2/src/projection/__tests__/level7-depth-culling.test.ts` lines 48-50:
```typescript
screenPosition: new Float32Array([
  0.0, 0.0,  // idx 0
  0.1, 0.1,  // idx 1
```

This shows the expected stride-2 format.
