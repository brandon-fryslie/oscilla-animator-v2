# Implementation Context: Multi-Component Signal Support

## Architecture Overview

### Current State (Scalar-Only)

```
Signal Evaluation:
  evaluateSignal(sigId) → number (single value)

Slot Storage:
  sigValues: Float64Array  // One f64 per signal
  sigStamps: Uint32Array   // One stamp per signal

Signal Kernel:
  (inputs: number[]) → number  // All scalars
```

### Target State (Multi-Component)

```
Signal Evaluation:
  evaluateSignal(sigId) → number (for scalar)
  evaluateSignalMulti(sigId, stride) → number[] (for multi-component)

Slot Storage:
  sigValues: Float64Array  // stride*N f64s for signal with stride
  strideMap: Map<SigExprId, number>  // Track stride per signal

Signal Kernel:
  packVec3(x, y, z) → writes to 3 contiguous slots
```

## Files to Modify

### 1. IRBuilderImpl.ts - Slot Allocation

```typescript
// Current
allocSlot(): ValueSlot

// Target
allocSlot(stride?: number): ValueSlot
// Allocates `stride` contiguous positions in slot array
```

### 2. ScheduleExecutor.ts - Signal Write

```typescript
// Current (exists but unused for signals)
function writeF64Strided(state, lookup, values: Float64Array): void

// Need to connect this to signal evaluation path
// Or add new function for signal-specific multi-write
```

### 3. SignalEvaluator.ts - Kernels

```typescript
// Add new kernels
case 'packVec2': {
  // Input: [x, y]
  // Output: writes x to slot[0], y to slot[1]
  // Challenge: current eval returns single number
}

case 'packVec3':
case 'vec3FromComponents': {
  // Input: [x, y, z]
  // Output: writes to 3 slots
}

case 'packColor': {
  // Input: [r, g, b, a]
  // Output: writes to 4 slots
}
```

### 4. Block Files - Signal Paths

**signal-blocks.ts (Const block):**
```typescript
// Line ~119-130: Const<vec2>
// Line ~131-145: Const<color>
// Need to use new multi-component kernel invocation
```

**geometry-blocks.ts:**
```typescript
// PolarToCartesian signal path (~lines 62-78)
// OffsetVec signal path (~lines 185-199)
```

**field-operations-blocks.ts:**
```typescript
// SetZ signal path (~line 1030)
// JitterVec signal path (~line 856)
```

## Key Architectural Decision

### Option A: Return Array from Kernel

```typescript
// Kernel returns array
case 'packVec3':
  return [inputs[0], inputs[1], inputs[2]]; // number[]

// Caller writes to multiple slots
const values = evalKernel('packVec3', [x, y, z]);
for (let i = 0; i < stride; i++) {
  state.sigValues[baseSlot + i] = values[i];
}
```

**Pros:** Clean separation
**Cons:** Allocation overhead, type system complexity (number vs number[])

### Option B: Kernel Writes Directly

```typescript
// Kernel receives slot reference
case 'packVec3':
  state.sigValues[slot + 0] = inputs[0];
  state.sigValues[slot + 1] = inputs[1];
  state.sigValues[slot + 2] = inputs[2];
  return NaN; // Sentinel - value already written

// Caller checks for sentinel
const value = evalKernel('packVec3', [x, y, z], slot);
if (!isNaN(value)) {
  state.sigValues[slot] = value;
}
```

**Pros:** No allocation, efficient
**Cons:** Side effects in kernel, NaN sentinel is hacky

### Option C: Separate Multi-Component Path

```typescript
// New function for multi-component
function evaluateSignalMulti(
  sigId: SigExprId,
  signals: readonly SigExpr[],
  state: RuntimeState,
  stride: number
): Float64Array {
  // Dedicated path for multi-component
  // Returns Float64Array of length stride
}

// Caller chooses path based on stride
if (stride === 1) {
  const value = evaluateSignal(sigId, signals, state);
} else {
  const values = evaluateSignalMulti(sigId, signals, state, stride);
}
```

**Pros:** Clean separation, no scalar path changes
**Cons:** Code duplication

### Recommendation: Option C

Most maintainable - keeps scalar path fast and simple, adds dedicated multi-component path.

## Reference: How Field Kernels Handle Multi-Component

FieldKernels.ts already does this correctly:

```typescript
// fieldPolarToCartesian outputs vec3 (stride 3)
for (let i = 0; i < N; i++) {
  outArr[i * 3 + 0] = x;  // Writes to consecutive positions
  outArr[i * 3 + 1] = y;
  outArr[i * 3 + 2] = z;
}
```

Signal kernels need the same pattern, just for a single value instead of N values.

## Test Strategy

1. **Unit test pack kernels:**
   - packVec2([1, 2]) → slots contain [1, 2]
   - packVec3([1, 2, 3]) → slots contain [1, 2, 3]
   - packColor([1, 2, 3, 4]) → slots contain [1, 2, 3, 4]

2. **Integration test blocks:**
   - Const<vec2>({x: 1, y: 2}) → output slot contains [1, 2]
   - PolarToCartesian with signal angle/radius → output slot contains [x, y, 0]

3. **End-to-end test:**
   - Pure-signal graph with multi-component output renders correctly
