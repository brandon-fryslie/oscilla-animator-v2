# PlacementBasis Implementation Plan

> **Topic**: placement-basis
> **Generated**: 2026-01-27
> **Source**: HANDOFF.md, CHATGPT-CONVERSATION.md, design-docs/CANONICAL-oscilla-v2.5-20260109/

---

## Executive Summary

### Problem
Current layouts use `normalizedIndex(i, N)` which causes **velocity snaps** when element count N changes. Position may be C0-continuous (position preserved), but velocity is not C1-continuous. Users perceive this as elements "teleporting" or "snapping" during live editing.

### Root Cause
Layout position is derived from `i / (N-1)`, which changes for ALL elements when N changes. The continuity system can mask the position jump, but the underlying trajectory change causes velocity discontinuity.

### Solution: PlacementBasis Abstraction
Provide stable per-element placement coordinates (`uv`, `rank`, `seed`) that are **independent of N**. Layouts consume these stable coordinates instead of count-dependent intrinsics. When N changes:
- Existing elements keep their `uv/rank/seed` unchanged
- New elements get new values from deterministic generator
- No re-indexing of existing elements

### Key Invariant
**Fields are keyed by `(InstanceId, BasisKind)` and persist across recompilation/hot-swap.** This enables true gauge invariance (I2) for layout positions.

---

## Current State Analysis

### Existing Layout System
**Files**: `src/blocks/instance-blocks.ts`, `src/projection/layout-kernels.ts`

Current layouts (CircleLayout, LineLayout, GridLayout) use:
```typescript
const normalizedIndexField = ctx.b.fieldIntrinsic(
  instanceId,
  'normalizedIndex',  // <-- FORBIDDEN after migration
  signalTypeField(FLOAT, 'default')
);
```

This is the velocity snap source.

### Existing Intrinsic System
**Files**: `src/compiler/ir/types.ts` (line 175-178)

```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';
```

Intrinsics are materialized in `src/runtime/Materializer.ts` via `fillBufferIntrinsic()`.

### Existing Continuity System
**Files**: `src/runtime/ContinuityState.ts`, `src/runtime/ContinuityApply.ts`

Already handles element identity (I11), gauge buffers, and slew. PlacementBasis extends this with richer per-element state.

### Existing Instance System
**Files**: `src/compiler/ir/types.ts` (InstanceDecl)

```typescript
export interface InstanceDecl {
  readonly id: string;
  readonly domainType: string;
  readonly count: number | 'dynamic';
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number;
}
```

PlacementBasis will be stored separately, not in InstanceDecl.

---

## Architecture Design

### PlacementBasis Fields

| Field | Type | Range | Purpose |
|-------|------|-------|---------|
| `uv` | vec2 | [0,1] x [0,1] | 2D placement coordinate |
| `rank` | float | [0,1] | Activation order |
| `seed` | float | [0,1] | Per-element deterministic random |

### Storage Strategy
**Option B (Recommended)**: Separate PlacementBasis store in runtime state.

```typescript
// In RuntimeState or ContinuityState
placementBasis: Map<InstanceId, PlacementBasisBuffers>

interface PlacementBasisBuffers {
  uv: Float32Array;      // N * 2 floats
  rank: Float32Array;    // N floats
  seed: Float32Array;    // N floats
  capacity: number;      // Max capacity
  activeCount: number;   // Current active elements
}
```

This keeps InstanceDecl minimal and allows PlacementBasis to survive hot-swap independently.

### Generation Strategy
- **rank**: `fract(i * PHI)` where PHI = 0.618033988749... (golden ratio for good distribution)
- **seed**: `hash(instanceId, i)` deterministic from instance+element
- **uv**: Halton sequence `H2(i)` for low-discrepancy 2D coverage

### Instance Activation Model
Elements are activated by rank order:
```typescript
activeThreshold = N_active / maxCapacity
// Element i is visible if: rank[i] <= activeThreshold
```

When N increases: elements with smallest ranks (already visible) keep their positions. New elements with larger ranks appear.

---

## Sprint Overview

| Sprint | Name | Confidence | Key Deliverables |
|--------|------|------------|------------------|
| 1 | Type Foundation | HIGH | PlacementBasis types, storage interfaces |
| 2 | Generation & Materialization | HIGH | Value generators, IRBuilder method |
| 3 | Layout Kernels | HIGH | New UV-based layout kernels |
| 4 | Layout Block Migration | MEDIUM | Migrate CircleLayout, LineLayout, GridLayout |
| 5 | Compiler Validation | MEDIUM | Forbid index intrinsics in layouts |
| 6 | Persistence & Hot-Swap | MEDIUM | State migration across recompilation |
| 7 | Testing & Verification | HIGH | Determinism tests, velocity continuity tests |

---

## Sprint 1: Type Foundation

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: None
**Effort**: Small (1-2 hours)

### Work Items

#### 1.1 Define PlacementBasis Types

**File**: `src/compiler/ir/types.ts`

Add new type definitions:

```typescript
/**
 * PlacementBasis field names (stable per-element coordinates).
 * These replace normalizedIndex in layout blocks.
 */
export type PlacementFieldName = 'uv' | 'rank' | 'seed';

/**
 * Basis generation algorithm.
 * Determines how uv/rank/seed are computed.
 */
export type BasisKind =
  | 'halton2D'    // Low-discrepancy sequence (default)
  | 'random'      // Pure random (specified seed)
  | 'spiral'      // Spiral pattern (good for circles)
  | 'grid';       // Grid-aligned (good for grid layouts)
```

**Acceptance Criteria**:
- [ ] `PlacementFieldName` type exported from `src/compiler/ir/types.ts`
- [ ] `BasisKind` type exported from `src/compiler/ir/types.ts`
- [ ] Types are documented with JSDoc
- [ ] TypeScript compiles without errors

#### 1.2 Define PlacementBasisBuffers Interface

**File**: `src/runtime/PlacementBasis.ts` (new file)

```typescript
/**
 * Per-instance placement basis buffers.
 * Persists across frames and hot-swap.
 */
export interface PlacementBasisBuffers {
  readonly uv: Float32Array;      // N * 2 floats
  readonly rank: Float32Array;    // N floats
  readonly seed: Float32Array;    // N floats
  readonly capacity: number;      // Max capacity allocated
  readonly basisKind: BasisKind;  // Generation algorithm used
}
```

**Acceptance Criteria**:
- [ ] Interface defined in new `PlacementBasis.ts` module
- [ ] All fields are readonly
- [ ] Module exports interface

#### 1.3 Add PlacementBasis to RuntimeState or ContinuityState

**File**: `src/runtime/ContinuityState.ts` or `src/runtime/RuntimeState.ts`

Add storage:

```typescript
/** Per-instance placement basis, keyed by InstanceId */
placementBasis: Map<string, PlacementBasisBuffers>;
```

**Acceptance Criteria**:
- [ ] `placementBasis` map added to state interface
- [ ] Initialization code creates empty map
- [ ] Map survives frame boundaries

---

## Sprint 2: Generation & Materialization

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 1
**Effort**: Medium (2-4 hours)

### Work Items

#### 2.1 Implement Halton Sequence Generator

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Generate 2D Halton sequence value for index i.
 * Deterministic low-discrepancy sequence for uniform coverage.
 */
export function halton2D(i: number, base1: number = 2, base2: number = 3): [number, number] {
  return [halton(i, base1), halton(i, base2)];
}

function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}
```

**Acceptance Criteria**:
- [ ] `halton2D` produces values in [0,1] x [0,1]
- [ ] Deterministic: same i always produces same value
- [ ] Good spatial coverage (visual inspection for N=100)
- [ ] Unit tests pass

#### 2.2 Implement Rank/Seed Generators

**File**: `src/runtime/PlacementBasis.ts`

```typescript
const PHI = 0.6180339887498949; // Golden ratio conjugate

/**
 * Generate rank value for index i.
 * Uses golden ratio for low-discrepancy 1D sequence.
 */
export function generateRank(i: number): number {
  return (i * PHI) % 1.0;
}

/**
 * Generate deterministic seed for instance+element.
 */
export function generateSeed(instanceId: string, elementIndex: number): number {
  // Simple hash combining instance and index
  const hash = hashString(instanceId) ^ (elementIndex * 2654435761);
  return (hash >>> 0) / 4294967295; // Normalize to [0,1]
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
```

**Acceptance Criteria**:
- [ ] `generateRank` produces values in [0,1]
- [ ] Rank distribution is uniform (visual inspection)
- [ ] `generateSeed` is deterministic
- [ ] Different instances produce different seeds

#### 2.3 Implement PlacementBasis Buffer Allocator

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Create or resize PlacementBasis buffers for an instance.
 * Preserves existing values when count increases.
 */
export function ensurePlacementBasis(
  store: Map<string, PlacementBasisBuffers>,
  instanceId: string,
  count: number,
  basisKind: BasisKind = 'halton2D'
): PlacementBasisBuffers {
  const existing = store.get(instanceId);

  if (existing && existing.capacity >= count) {
    return existing;
  }

  // Allocate with headroom
  const capacity = Math.max(count * 2, existing?.capacity ?? 64);

  const buffers: PlacementBasisBuffers = {
    uv: new Float32Array(capacity * 2),
    rank: new Float32Array(capacity),
    seed: new Float32Array(capacity),
    capacity,
    basisKind,
  };

  // Copy existing values
  if (existing) {
    buffers.uv.set(existing.uv.subarray(0, existing.capacity * 2));
    buffers.rank.set(existing.rank.subarray(0, existing.capacity));
    buffers.seed.set(existing.seed.subarray(0, existing.capacity));
  }

  // Generate new values for indices beyond existing
  const startIdx = existing?.capacity ?? 0;
  fillPlacementBasis(buffers, instanceId, startIdx, capacity, basisKind);

  store.set(instanceId, buffers);
  return buffers;
}
```

**Acceptance Criteria**:
- [ ] New values generated for new indices only
- [ ] Existing values preserved on resize
- [ ] Capacity grows with headroom to reduce allocations
- [ ] Store is updated correctly

#### 2.4 Add IRBuilder.fieldPlacement() Method

**File**: `src/compiler/ir/IRBuilder.ts` (interface)
**File**: `src/compiler/ir/IRBuilderImpl.ts` (implementation)

Interface addition:
```typescript
/**
 * Create a field from placement basis.
 * Replaces normalizedIndex for gauge-invariant layouts.
 */
fieldPlacement(
  instanceId: InstanceId,
  field: PlacementFieldName,
  type: SignalType
): FieldExprId;
```

**Acceptance Criteria**:
- [ ] Method added to IRBuilder interface
- [ ] Implementation in IRBuilderImpl
- [ ] Returns valid FieldExprId
- [ ] Type system validates field name

#### 2.5 Add FieldExprPlacement to IR

**File**: `src/compiler/ir/types.ts`

```typescript
export interface FieldExprPlacement {
  readonly kind: 'placement';
  readonly instanceId: InstanceId;
  readonly field: PlacementFieldName;
  readonly type: SignalType;
}
```

Update FieldExpr union:
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprArray
  | FieldExprStateRead
  | FieldExprPathDerivative
  | FieldExprPlacement;  // NEW
```

**Acceptance Criteria**:
- [ ] FieldExprPlacement interface defined
- [ ] FieldExpr union updated
- [ ] TypeScript compiles without errors

#### 2.6 Add Materializer Support

**File**: `src/runtime/Materializer.ts`

Add case to `fillBuffer` for `placement` kind:

```typescript
case 'placement': {
  const expr = field as FieldExprPlacement;
  const basis = state.continuity.placementBasis.get(expr.instanceId);
  if (!basis) {
    throw new Error(`No PlacementBasis for instance ${expr.instanceId}`);
  }

  const outArr = out as Float32Array;
  switch (expr.field) {
    case 'uv':
      outArr.set(basis.uv.subarray(0, N * 2));
      break;
    case 'rank':
      outArr.set(basis.rank.subarray(0, N));
      break;
    case 'seed':
      outArr.set(basis.seed.subarray(0, N));
      break;
    default:
      const _: never = expr.field;
      throw new Error(`Unknown placement field: ${_}`);
  }
  break;
}
```

**Acceptance Criteria**:
- [ ] `placement` case handles all PlacementFieldName values
- [ ] Exhaustive switch with never pattern
- [ ] Correct buffer slicing for uv (stride 2)
- [ ] Unit tests for each field type

---

## Sprint 3: Layout Kernels

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 2
**Effort**: Medium (2-3 hours)

### Work Items

#### 3.1 Create circleLayoutUV Kernel

**File**: `src/runtime/FieldKernels.ts`

```typescript
/**
 * circleLayoutUV: UV-based circle layout (gauge-invariant)
 *
 * Unlike circleLayout which uses normalizedIndex (count-dependent),
 * this kernel uses uv.x as the angular parameter, enabling
 * stable positions when element count changes.
 *
 * Inputs (zipSig):
 *   field: uv (vec2)
 *   signals: [radius, phase]
 * Output: vec3 (world-space position)
 */
```

Implementation in `applyFieldKernelZipSig`:
```typescript
} else if (fieldOp === 'circleLayoutUV') {
  const outArr = out as Float32Array;
  const uvArr = fieldInput as Float32Array;
  const radius = sigVals[0];
  const phase = sigVals[1];
  const TWO_PI = Math.PI * 2;

  for (let i = 0; i < N; i++) {
    const u = uvArr[i * 2 + 0]; // Use u as angular parameter
    const angle = TWO_PI * (u + phase);
    outArr[i * 3 + 0] = 0.5 + radius * Math.cos(angle);
    outArr[i * 3 + 1] = 0.5 + radius * Math.sin(angle);
    outArr[i * 3 + 2] = 0.0;
  }
}
```

**Acceptance Criteria**:
- [ ] Kernel produces circular layout
- [ ] Uses uv.x instead of normalizedIndex
- [ ] Output is world-space [0,1] centered at (0.5, 0.5)
- [ ] Unit tests verify output matches expected positions

#### 3.2 Create lineLayoutUV Kernel

**File**: `src/runtime/FieldKernels.ts`

```typescript
/**
 * lineLayoutUV: UV-based line layout (gauge-invariant)
 *
 * Uses uv.x as the interpolation parameter along the line.
 *
 * Inputs (zipSig):
 *   field: uv (vec2)
 *   signals: [x0, y0, x1, y1]
 * Output: vec3 (world-space position)
 */
```

**Acceptance Criteria**:
- [ ] Kernel produces line layout
- [ ] Uses uv.x as t parameter
- [ ] Interpolates between (x0,y0) and (x1,y1)
- [ ] Unit tests verify interpolation

#### 3.3 Create gridLayoutUV Kernel

**File**: `src/runtime/FieldKernels.ts`

```typescript
/**
 * gridLayoutUV: UV-based grid layout (gauge-invariant)
 *
 * Maps uv directly to grid positions.
 * Unlike gridLayout which uses index (count-dependent),
 * this uses uv.x and uv.y as normalized grid coordinates.
 *
 * Inputs (zipSig):
 *   field: uv (vec2)
 *   signals: [cols, rows] (for potential snapping, currently ignored)
 * Output: vec3 (world-space position)
 */
```

**Acceptance Criteria**:
- [ ] Kernel produces grid layout
- [ ] Maps uv.x to x position, uv.y to y position
- [ ] Covers [0,1] x [0,1] world space
- [ ] Unit tests verify grid coverage

---

## Sprint 4: Layout Block Migration

**Confidence**: MEDIUM
**Status**: RESEARCH REQUIRED

### Unknowns to Resolve
1. **Backwards compatibility**: How to handle existing patches that use normalizedIndex?
2. **Block versioning**: Should old blocks continue to work? Deprecation warnings?
3. **UI changes**: Do layout blocks need new parameters for BasisKind?

### Exit Criteria (to reach HIGH confidence)
- [ ] Decision on backwards compatibility strategy
- [ ] User confirmation on deprecation approach

### Work Items

#### 4.1 Migrate CircleLayout Block

**File**: `src/blocks/instance-blocks.ts`

Before:
```typescript
const normalizedIndexField = ctx.b.fieldIntrinsic(
  instanceId,
  'normalizedIndex',
  signalTypeField(FLOAT, 'default')
);
```

After:
```typescript
const uvField = ctx.b.fieldPlacement(
  instanceId,
  'uv',
  signalTypeField(VEC2, 'default')
);

const positionField = ctx.b.fieldZipSig(
  uvField,
  [radiusSig, phaseSig],
  { kind: 'kernel', name: 'circleLayoutUV' },
  signalTypeField(VEC3, 'default')
);
```

**Acceptance Criteria**:
- [ ] CircleLayout uses fieldPlacement('uv')
- [ ] CircleLayout uses circleLayoutUV kernel
- [ ] Existing circle layouts still render correctly
- [ ] No velocity snap when N changes

#### 4.2 Migrate LineLayout Block

**File**: `src/blocks/instance-blocks.ts`

Same pattern as CircleLayout.

**Acceptance Criteria**:
- [ ] LineLayout uses fieldPlacement('uv')
- [ ] Uses lineLayoutUV kernel
- [ ] No velocity snap on N change

#### 4.3 Migrate GridLayout Block

**File**: `src/blocks/instance-blocks.ts`

**Acceptance Criteria**:
- [ ] GridLayout uses fieldPlacement('uv')
- [ ] Uses gridLayoutUV kernel
- [ ] No velocity snap on N change

#### 4.4 Migrate LinearLayout Block

**File**: `src/blocks/instance-blocks.ts`

**Acceptance Criteria**:
- [ ] LinearLayout uses fieldPlacement('uv')
- [ ] No velocity snap on N change

---

## Sprint 5: Compiler Validation

**Confidence**: MEDIUM
**Status**: RESEARCH REQUIRED

### Unknowns to Resolve
1. **Enforcement granularity**: Block-level or port-level restriction?
2. **Error messaging**: How to suggest fix when layout uses forbidden intrinsic?
3. **Category detection**: How to robustly identify layout blocks?

### Work Items

#### 5.1 Add Layout Block Category Detection

**File**: `src/blocks/registry.ts`

Ensure `category: 'layout'` is reliably set on layout blocks.

**Acceptance Criteria**:
- [ ] All layout blocks have `category: 'layout'`
- [ ] Category accessible during compilation

#### 5.2 Add Compiler Validation Pass

**File**: `src/compiler/passes-v2/pass6-block-lowering.ts` or new pass

```typescript
/**
 * Validate that layout blocks do not read forbidden intrinsics.
 * Layout blocks MUST use PlacementBasis fields instead of:
 * - index
 * - normalizedIndex
 */
function validateLayoutInputs(block: Block, inputsById: Map<string, Input>): void {
  if (block.category !== 'layout') return;

  for (const [portName, input] of inputsById) {
    if (input.k === 'field' && isForbiddenIntrinsic(input)) {
      throw new CompileError({
        code: 'LAYOUT_INDEX_DEPENDENCY_FORBIDDEN',
        message: `Layout block ${block.type} cannot read ${input.intrinsic}. Use PlacementBasis fields (uv, rank, seed) instead.`,
        suggestion: `Replace fieldIntrinsic('${input.intrinsic}') with fieldPlacement('uv')`,
        blockId: block.id,
        portName,
      });
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Compile-time error for layout blocks using normalizedIndex
- [ ] Clear error message with actionable fix
- [ ] Error includes block ID and port name

---

## Sprint 6: Persistence & Hot-Swap

**Confidence**: MEDIUM
**Status**: PARTIALLY READY

### Work Items

#### 6.1 Persist PlacementBasis Across Frames

**File**: `src/runtime/RuntimeState.ts`

Ensure `placementBasis` map is not cleared between frames.

**Acceptance Criteria**:
- [ ] PlacementBasis survives multiple frames
- [ ] Values remain identical across frames

#### 6.2 Persist PlacementBasis Across Hot-Swap

**File**: `src/runtime/StateMigration.ts`

Add migration handling for PlacementBasis:

```typescript
function migratePlacementBasis(
  oldState: ContinuityState,
  newInstances: Map<InstanceId, InstanceDecl>
): Map<InstanceId, PlacementBasisBuffers> {
  const newBasis = new Map();

  for (const [instanceId, decl] of newInstances) {
    // Try to find existing basis
    const existing = oldState.placementBasis.get(instanceId);
    if (existing) {
      // Instance exists - preserve basis (may need resize)
      newBasis.set(instanceId, ensurePlacementBasis(
        oldState.placementBasis, instanceId, decl.count
      ));
    } else {
      // New instance - generate fresh basis
      newBasis.set(instanceId, createPlacementBasis(
        instanceId, decl.count, 'halton2D'
      ));
    }
  }

  return newBasis;
}
```

**Acceptance Criteria**:
- [ ] PlacementBasis preserved when same instance persists
- [ ] New instances get fresh basis values
- [ ] Removed instances are garbage collected

#### 6.3 Integrate with ContinuityMapping

**File**: `src/runtime/ContinuityMapping.ts`

Ensure element mapping (byId) works with PlacementBasis:

- When elements are mapped (old index -> new index), PlacementBasis values follow
- When elements are new (unmapped), new PlacementBasis values are generated

**Acceptance Criteria**:
- [ ] Element ID mapping respects PlacementBasis
- [ ] No velocity snap when elements are reordered

---

## Sprint 7: Testing & Verification

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprints 1-6

### Work Items

#### 7.1 Unit Tests for Generation

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
describe('PlacementBasis', () => {
  describe('halton2D', () => {
    it('produces values in [0,1] x [0,1]', () => {});
    it('is deterministic', () => {});
    it('has low discrepancy (visual coverage)', () => {});
  });

  describe('generateRank', () => {
    it('produces values in [0,1]', () => {});
    it('distributes uniformly', () => {});
  });

  describe('ensurePlacementBasis', () => {
    it('preserves existing values on resize', () => {});
    it('generates new values for new indices', () => {});
  });
});
```

**Acceptance Criteria**:
- [ ] All generator tests pass
- [ ] Determinism verified
- [ ] Distribution uniformity verified

#### 7.2 Integration Test for Velocity Continuity

**File**: `src/runtime/__tests__/velocity-continuity.test.ts`

```typescript
describe('Velocity Continuity (Gauge Invariance)', () => {
  it('preserves position when N increases', () => {
    // Create layout with N=50
    // Record positions for elements 0-49
    // Increase to N=100
    // Verify positions 0-49 unchanged
  });

  it('preserves velocity (C1 continuity) when N changes', () => {
    // Create layout with N=50
    // Advance frame, record velocity (position delta)
    // Increase to N=100
    // Advance frame
    // Verify velocity unchanged for elements 0-49
  });

  it('new elements appear without affecting existing', () => {
    // Verify elements 50-99 have new positions
    // Verify elements 0-49 positions unchanged
  });
});
```

**Acceptance Criteria**:
- [ ] Position preserved test passes
- [ ] Velocity preserved test passes
- [ ] New element test passes

#### 7.3 Determinism Test

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
it('produces identical values across runs', () => {
  const basis1 = createPlacementBasis('instance1', 100, 'halton2D');
  const basis2 = createPlacementBasis('instance1', 100, 'halton2D');

  expect(basis1.uv).toEqual(basis2.uv);
  expect(basis1.rank).toEqual(basis2.rank);
  expect(basis1.seed).toEqual(basis2.seed);
});
```

**Acceptance Criteria**:
- [ ] Identical values for same seed
- [ ] Different values for different instance IDs

#### 7.4 Hot-Swap Persistence Test

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
it('PlacementBasis survives hot-swap', () => {
  // Create runtime with N=50
  // Record PlacementBasis values
  // Trigger hot-swap (recompile)
  // Verify PlacementBasis values unchanged
});
```

**Acceptance Criteria**:
- [ ] PlacementBasis survives recompilation
- [ ] Values identical before and after

---

## Dependency Graph

```
Sprint 1 (Types)
    |
    v
Sprint 2 (Generation)
    |
    +-----> Sprint 3 (Kernels)
    |           |
    v           v
Sprint 4 (Block Migration)
    |
    v
Sprint 5 (Validation)
    |
    v
Sprint 6 (Persistence)
    |
    v
Sprint 7 (Testing) <-- Can start earlier for unit tests
```

---

## Risk Assessment

### High Risk

1. **Backwards Compatibility**
   - Risk: Existing patches break
   - Mitigation: Parallel support period with deprecation warnings
   - Research: Survey existing patches for normalizedIndex usage

2. **Performance Impact**
   - Risk: Additional buffer allocation/copying
   - Mitigation: Pool PlacementBasis buffers, allocate with headroom
   - Verification: Benchmark with N=10000

### Medium Risk

1. **Generation Algorithm Choice**
   - Risk: Halton sequence may not be optimal for all layouts
   - Mitigation: Support multiple BasisKind options
   - Research: Test visual quality for circles/grids/lines

2. **Dynamic Count Handling**
   - Risk: Per-frame count changes may cause issues
   - Mitigation: Pre-allocate to capacity, lazy generation

### Low Risk

1. **Type System Integration**
   - Mitigation: Existing intrinsic pattern provides template
   - The FieldExprPlacement follows FieldExprIntrinsic pattern

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/runtime/PlacementBasis.ts` | PlacementBasis types, generators, allocator |
| `src/runtime/__tests__/PlacementBasis.test.ts` | Unit tests |
| `src/runtime/__tests__/velocity-continuity.test.ts` | Integration tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/ir/types.ts` | Add PlacementFieldName, BasisKind, FieldExprPlacement |
| `src/compiler/ir/IRBuilder.ts` | Add fieldPlacement() method |
| `src/compiler/ir/IRBuilderImpl.ts` | Implement fieldPlacement() |
| `src/runtime/Materializer.ts` | Add 'placement' case to fillBuffer |
| `src/runtime/FieldKernels.ts` | Add circleLayoutUV, lineLayoutUV, gridLayoutUV |
| `src/runtime/ContinuityState.ts` | Add placementBasis map |
| `src/runtime/RuntimeState.ts` | Ensure placementBasis persists |
| `src/runtime/StateMigration.ts` | Migrate PlacementBasis on hot-swap |
| `src/blocks/instance-blocks.ts` | Migrate layout blocks to use fieldPlacement |

---

## Success Criteria

1. **Velocity snaps eliminated**: When N changes, existing elements don't move
2. **Layouts use PlacementBasis**: No layout block reads `normalizedIndex` for positioning
3. **Deterministic**: Same seed produces same PlacementBasis values
4. **Hot-swap safe**: PlacementBasis survives recompilation
5. **Performance**: No per-frame allocation for PlacementBasis buffers
6. **Tests**: Integration test demonstrating N change without position discontinuity

---

## Spec References

### Primary
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md` - Continuity spec
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/17-layout-system.md` - Layout system spec
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md` - I2, I11, I30

### Supporting
- `.agent_planning/placement-basis/HANDOFF.md` - Architecture design
- `.agent_planning/placement-basis/CHATGPT-CONVERSATION.md` - Design rationale

---

## Open Questions (for User Input)

1. **Migration Strategy**: Should existing patches auto-migrate, or require manual update?
2. **BasisKind Selection**: Should users choose BasisKind per layout, or is halton2D always used?
3. **Rank Semantics**: Does rank affect rendering order (Z-ordering), or only activation?
4. **Dynamic maxCount**: Pre-allocate to estimated max, or grow on demand?

---

## Next Steps

1. **Sprint 1**: Begin with type foundation (no risk, enables all later sprints)
2. **User Decision**: Clarify migration strategy before Sprint 4
3. **Parallel Work**: Sprint 7 unit tests can begin alongside Sprint 2-3

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-27 | Claude | Initial plan created from HANDOFF.md analysis |
