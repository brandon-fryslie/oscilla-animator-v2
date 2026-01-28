# Sprint: clean-materializer-map - Remove Scalar Kernels from Materializer Map

**Generated:** 2026-01-21T03:55:17Z
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Remove scalar math kernels from Materializer.ts `applyMap` function. Map should only route through opcodes for scalar operations, not kernels.

## Scope

**Deliverables:**
1. Remove sqrt/floor/ceil/round kernel cases from `applyMap`
2. Move `fieldGoldenAngle` to `applyKernel` (it's a field kernel, not scalar math)
3. Simplify `applyMap` to only support opcodes
4. Add explicit error for kernel kind in map context

## Work Items

### P0: Simplify applyMap to opcodes-only

**File:** `src/runtime/Materializer.ts`

**Current code (lines 423-478):**

```typescript
function applyMap(
  out: ArrayBufferView,
  input: ArrayBufferView,
  fn: PureFn,
  N: number,
  type: CanonicalType
): void {
  const outArr = out as Float32Array;
  const inArr = input as Float32Array;

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < N; i++) {
      outArr[i] = applyOpcode(op, [inArr[i]]);
    }
  } else if (fn.kind === 'kernel') {
    // Handle single-input kernel functions
    switch (fn.name) {
      case 'sqrt':
        // ... lines 441-444
      case 'floor':
        // ... lines 445-448
      case 'ceil':
        // ... lines 449-452
      case 'round':
        // ... lines 453-456
      case 'fieldGoldenAngle':
        // ... lines 457-467
      default:
        throw new Error(`Unknown map kernel: ${fn.name}`);
    }
  } else {
    throw new Error(`Map function kind ${fn.kind} not implemented`);
  }
}
```

**Acceptance Criteria:**
- [ ] Remove lines 438-477 (entire `fn.kind === 'kernel'` branch)
- [ ] Replace with error throw for kernel kind
- [ ] Keep only opcode path

**Technical Notes - Line-by-Line Instructions:**

```typescript
// File: src/runtime/Materializer.ts
// Replace lines 423-478 with:

/**
 * Apply map function to buffer
 *
 * LAYER CONTRACT: Map only supports opcodes for scalar math.
 * Kernels are not allowed in map context - use zip or zipSig for field kernels.
 */
function applyMap(
  out: ArrayBufferView,
  input: ArrayBufferView,
  fn: PureFn,
  N: number,
  type: CanonicalType
): void {
  const outArr = out as Float32Array;
  const inArr = input as Float32Array;

  if (fn.kind === 'opcode') {
    const op = fn.opcode;
    for (let i = 0; i < N; i++) {
      outArr[i] = applyOpcode(op, [inArr[i]]);
    }
  } else if (fn.kind === 'kernel') {
    // Map is not the place for kernels - they belong in zip/zipSig
    throw new Error(
      `Map only supports opcodes, not kernels. ` +
      `Kernel '${fn.name}' should use zip or zipSig instead.`
    );
  } else {
    throw new Error(`Map function kind ${fn.kind} not implemented`);
  }
}
```

### P1: Move fieldGoldenAngle to applyKernel

**File:** `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] Add `fieldGoldenAngle` case to `applyKernel` function (around line 536)
- [ ] It should handle single-input field case

**Technical Notes:**

```typescript
// File: src/runtime/Materializer.ts
// Inside applyKernel function (around line 745, before the final else block)
// Add new case:

  } else if (kernelName === 'fieldGoldenAngle') {
    // Golden angle: angle = id01 * turns * goldenAngle
    // Inputs: [id01] (single field input)
    // Note: turns=50 is baked in; future: make configurable via signal
    if (inputs.length !== 1) {
      throw new Error('fieldGoldenAngle requires exactly 1 input (id01)');
    }
    const outArr = out as Float32Array;
    const id01Arr = inputs[0] as Float32Array;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996
    const turns = 50;

    for (let i = 0; i < N; i++) {
      outArr[i] = id01Arr[i] * turns * goldenAngle;
    }
  }
```

### P2: Update any IR that routes sqrt/floor/ceil/round through kernel

**Acceptance Criteria:**
- [ ] Search for IR emitting these as kernels in map context
- [ ] Update to use opcode instead

**Technical Notes:**

```bash
# Find IR builder references
grep -rn "fieldGoldenAngle\|'sqrt'\|'floor'\|'ceil'\|'round'" --include="*.ts" src/compiler/
```

If found in map context, change from:
```typescript
{ kind: 'map', input: fieldId, fn: { kind: 'kernel', name: 'sqrt' } }
```
To:
```typescript
{ kind: 'map', input: fieldId, fn: { kind: 'opcode', opcode: 'sqrt' } }
```

### P3: Add Materializer header contract comment

**File:** `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] Update lines 1-6 with full layer contract

**Technical Notes:**

```typescript
// Replace lines 1-6 with:

/**
 * Field Materializer
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
 *
 * LAYER CONTRACT:
 * ─────────────────────────────────────────────────────────────
 * Materializer responsibilities:
 * 1. IR → buffer orchestration (materialize, fillBuffer)
 * 2. Cache management (field buffer caching)
 * 3. Intrinsic field production (index, normalizedIndex, randomId)
 * 4. Layout field production (position, radius via layout spec)
 * 5. Dispatch to field kernels for vec2/color/field operations
 *
 * Materializer does NOT:
 * - Define scalar math (that's OpcodeInterpreter)
 * - Define signal kernels (that's SignalEvaluator)
 * - Define geometry/coord semantics (that's block-level)
 *
 * FIELD KERNEL REGISTRY (applyKernel/applyKernelZipSig):
 * - makeVec2, hsvToRgb, jitter2d, fieldJitter2D
 * - attract2d, fieldAngularOffset, fieldRadiusSqrt, fieldAdd
 * - fieldPolarToCartesian, fieldPulse, fieldHueFromPhase
 * - applyOpacity, circleLayout, circleAngle, polygonVertex
 * - fieldGoldenAngle
 *
 * Field kernels operate on typed array buffers (vec2/color/float).
 * They are coord-space agnostic - blocks define world/local semantics.
 * ─────────────────────────────────────────────────────────────
 */
```

## Dependencies

- Sprint 1 (add-opcodes) MUST complete first - sqrt/floor/ceil/round must exist as opcodes

## Risks

| Risk | Mitigation |
|------|------------|
| Existing IR uses kernel path for math | Update IR builder to use opcode path |
| fieldGoldenAngle breaks | Move to applyKernel with same logic |
