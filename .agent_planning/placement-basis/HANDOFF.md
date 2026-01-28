# Handoff: PlacementBasis Implementation

> **For**: Agent implementing PlacementBasis abstraction
> **From**: Session exploring architecture alignment
> **Date**: 2026-01-27
> **ChatGPT Conversation**: https://chatgpt.com/c/69783b5b-8104-8333-b871-a290e297f8e0 (GaugeInvariantLayouts)

---

## Problem Statement

### The Velocity Snap Bug

When element count `N` changes (e.g., 50 -> 100 elements), layouts using `normalizedIndex(i, N)` cause **velocity discontinuities** ("velocity snaps"):

```
Before: normalizedIndex(25, 50) = 0.5  -> position = center
After:  normalizedIndex(25, 100) = 0.25 -> position = 1/4 from start
```

Element 25 **snaps** from center to 1/4 position instantly, even though it's the "same" element conceptually.

### Why This Matters

- **Animation breaks**: Elements jump when count changes
- **Hot-swap jank**: Live editing feels broken
- **Count-dependent position**: Everyone moves when anyone is added/removed
- **Violates gauge invariance**: The system produces visible discontinuities

### Current Workaround (Inadequate)

The continuity system (spec 11) provides slew/crossfade, but this only **masks** the problem - elements still transition to the wrong positions. The root cause is that layout reads `normalizedIndex` which is inherently count-dependent.

---

## Proposed Solution: PlacementBasis Abstraction

### Core Concept

**PlacementBasis** provides stable, per-element placement coordinates that are **independent of N**. Instead of deriving position from `index/N`, each element carries its own placement identity.

### PlacementBasis Fields

Each element in an instance has three stable fields:

| Field | Type | Range | Semantics |
|-------|------|-------|-----------|
| `uv` | `vec2` | [0,1] x [0,1] | 2D placement coordinate |
| `rank` | `float` | [0,1] | Activation order (determines who appears first when N grows) |
| `seed` | `float` | [0,1] | Per-element deterministic random |

### Key Invariant

**Fields are keyed by `(InstanceId, BasisKind)` and persist across recompilation/hot-swap.**

When N changes:
- **Existing elements keep their uv/rank/seed unchanged**
- **New elements get new values from deterministic generator**
- **Removed elements' values are garbage-collected**

### Instance Activation Model

Elements are **activated by rank order**:

```typescript
// Active elements are those with rank <= activeThreshold
activeThreshold = N / maxCapacity  // or similar

// Element i is visible if: rank[i] <= activeThreshold
```

When N increases (50 -> 100):
- Elements with rank in [0, 0.5] stay visible (their positions don't change)
- Elements with rank in (0.5, 1.0] become newly visible
- No re-indexing of existing elements

### Compiler Enforcement

**Layout blocks are FORBIDDEN from reading `index` or `normalizedIndex` intrinsics.**

Instead, they MUST use PlacementBasis:
- `uv` for 2D position derivation
- `rank` for ordering/activation
- `seed` for randomization

This is a **compile-time rule** - the type system should reject layouts that read forbidden intrinsics.

---

## Relevant Codebase Architecture

### Current Intrinsic System

**Location**: `src/compiler/ir/types.ts` (line 175-178)

```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';
```

**Materialization**: `src/runtime/Materializer.ts` (line 429-472)

The `fillBufferIntrinsic()` function generates intrinsic values per-element. PlacementBasis would be a new category here (not intrinsics per se, but similar materialization).

### Current Layout Blocks

**Location**: `src/blocks/instance-blocks.ts`

Layout blocks (`CircleLayout`, `LineLayout`, `GridLayout`) currently read `normalizedIndex`:

```typescript
// CircleLayout (line 250-254)
const normalizedIndexField = ctx.b.fieldIntrinsic(
  instanceId,
  'normalizedIndex',
  signalTypeField(FLOAT, 'default')
);
```

These must be migrated to use PlacementBasis instead.

### Instance Declaration

**Location**: `src/compiler/ir/types.ts` (line 388-396)

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

PlacementBasis state could be associated with InstanceDecl or stored in a parallel structure.

### Continuity System Integration

**Spec Reference**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md`

**Key Integration Points**:

1. **Element Identity** (Spec 3.1-3.2): The continuity system already defines `DomainInstance` with `elementId: Uint32Array`. PlacementBasis is a richer form of this.

2. **Mapping State** (Spec 3.3): The `byId` mapping algorithm uses element IDs to match old->new elements. PlacementBasis extends this with uv/rank/seed.

3. **State Migration** (`src/runtime/StateMigration.ts`): Already handles lane remapping for field state. PlacementBasis values need similar treatment.

4. **ContinuityState** (`src/runtime/ContinuityState.ts`): Could store PlacementBasis buffers here.

### IRBuilder Interface

**Location**: `src/compiler/ir/IRBuilder.ts`

Would need new method like:
```typescript
fieldPlacement(
  instanceId: InstanceId,
  field: 'uv' | 'rank' | 'seed',
  type: SignalType
): FieldExprId
```

---

## Implementation Considerations

### 1. Storage Strategy

**Option A: Extend InstanceDecl**
```typescript
interface InstanceDecl {
  // ... existing fields ...
  placementBasis?: {
    uv: Float32Array;      // N * 2 floats
    rank: Float32Array;    // N floats
    seed: Float32Array;    // N floats
  };
}
```

**Option B: Separate PlacementBasis Store**
```typescript
// In RuntimeState or ContinuityState
placementBasis: Map<InstanceId, PlacementBasisBuffers>
```

Option B is cleaner - keeps InstanceDecl minimal and allows PlacementBasis to survive hot-swap independently.

### 2. Value Generation

**Rank Generation**:
```typescript
// Rank = normalized position in activation order
// Using golden ratio for good distribution:
rank[i] = fract(i * PHI)  // PHI = 0.618033988749...
```

**UV Generation**:
```typescript
// 2D Halton sequence or similar low-discrepancy sequence
uv[i] = halton2D(i, seed)
```

**Seed Generation**:
```typescript
// Deterministic hash from instance+element
seed[i] = hash(instanceId, i)
```

### 3. Persistence Across N Changes

When N increases (50 -> 100):
1. Keep existing rank/uv/seed for indices [0, 49]
2. Generate new values for indices [50, 99]
3. **No recomputation of existing values**

When N decreases (100 -> 50):
1. Keep rank/uv/seed for indices [0, 49]
2. Indices [50, 99] become dormant (not discarded - may come back)

### 4. Layout Kernel Migration

Current pattern (forbidden):
```typescript
const normalizedIndex = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', ...);
const position = ctx.b.fieldZipSig(normalizedIndex, [...], 'circleLayout', ...);
```

New pattern (required):
```typescript
const uv = ctx.b.fieldPlacement(instanceId, 'uv', ...);
const position = ctx.b.fieldZipSig(uv, [...], 'circleLayoutUV', ...);
```

### 5. Dimension Agnostic

PlacementBasis works for:
- **2D**: Circle, grid, line layouts
- **2.5D**: Layered/stacked layouts
- **3D**: Sphere, volume layouts

The `uv` field is intentionally vec2. For 3D, either:
- Use `uv.x`, `uv.y` + `rank` for Z
- Add optional `uvw` (vec3) for true 3D basis

---

## Integration with Existing Systems

### Identity Mapping

The continuity system's `byId` mapping (Spec 3.4) uses `elementId` arrays. PlacementBasis enhances this:

```typescript
// Old: mapping by integer ID
oldIdMap.set(old.elementId[i], i);

// With PlacementBasis: IDs are implicit (index = ID for stable instances)
// PlacementBasis ensures positions don't depend on count
```

### Gauge Invariance

PlacementBasis enforces gauge invariance (Invariant I2):
- Position is a function of `uv`, not of `index/N`
- When N changes, uv doesn't change, so position doesn't change
- Continuity slew is only needed for genuinely new elements

### Compiler Validation

Add a new compiler pass or validation rule:
```typescript
// In pass6-block-lowering.ts or similar
if (block.category === 'layout') {
  for (const input of Object.values(inputsById)) {
    if (input.k === 'field' && isIndexIntrinsic(input)) {
      throw new Error(`Layout block ${block.type} cannot read index intrinsic`);
    }
  }
}
```

---

## Open Questions

### 1. BasisKind Enum

What basis kinds should we support initially?
- `'halton2D'` - Low-discrepancy sequence (good coverage)
- `'random'` - Pure random (specified seed)
- `'spiral'` - Spiral pattern (good for circles)
- `'grid'` - Grid-aligned (good for grid layouts)

### 2. Rank Semantics

How does rank interact with visibility/activation?
- Is there an explicit `visibility` field, or is it derived from `rank <= threshold`?
- Does rank affect rendering order (Z-ordering)?

### 3. Dynamic Count

For `count: 'dynamic'`, how does PlacementBasis handle per-frame count changes?
- Pre-allocate maximum capacity?
- Lazy generation as needed?

### 4. Migration Path

How do we migrate existing patches that use normalizedIndex layouts?
- Auto-migration? (risky - may change appearance)
- Deprecation warnings? (safer)
- Parallel support period?

### 5. Serialization

PlacementBasis values must be:
- Deterministic (same seed -> same values)
- Potentially serializable (for deterministic export)
- Tied to instance identity

---

## Spec References

### Primary
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/11-continuity-system.md` - Full continuity spec, especially sections 3.1-3.6 on element identity and mapping
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/17-layout-system.md` - Layout kernel contracts, intrinsic usage

### Supporting
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md` - I2 (Gauge Invariance), I11 (Stable Element Identity), I30 (Continuity Determinism)
- `design-docs/_new/shapes-and-layout/15-layout.md` - Target end-state for layout system

### Related Planning
- `.agent_planning/RESEARCH-identity-preservation-20260118.md` - Previous research on instance identity
- `.agent_planning/continuity-system/SPRINT-20260118-identity-foundation-CONTEXT.md` - Identity foundation sprint

---

## Key Files to Modify

### Core Types
- `src/compiler/ir/types.ts` - Add PlacementBasis types, possibly new FieldExpr kind
- `src/compiler/ir/IRBuilder.ts` - Add `fieldPlacement()` method

### Materialization
- `src/runtime/Materializer.ts` - Add PlacementBasis materialization (similar to intrinsics)

### Storage
- `src/runtime/RuntimeState.ts` or `src/runtime/ContinuityState.ts` - Add PlacementBasis buffer storage

### Layout Blocks
- `src/blocks/instance-blocks.ts` - Migrate CircleLayout, LineLayout, GridLayout to use PlacementBasis

### Kernels
- `src/runtime/FieldKernels.ts` - Add new layout kernels that take uv instead of normalizedIndex

### Validation
- `src/compiler/passes-v2/pass6-block-lowering.ts` - Add validation that layouts don't read forbidden intrinsics

---

## Success Criteria

1. **Velocity snaps eliminated**: When N changes, existing elements don't move
2. **Layouts use PlacementBasis**: No layout block reads `normalizedIndex` for positioning
3. **Deterministic**: Same seed produces same PlacementBasis values
4. **Hot-swap safe**: PlacementBasis survives recompilation
5. **Performance**: No per-frame allocation for PlacementBasis buffers
6. **Tests**: Integration test demonstrating N change without position discontinuity

---

## Suggested Implementation Order

1. **Define PlacementBasis types** in `ir/types.ts`
2. **Add storage** in RuntimeState/ContinuityState
3. **Implement generation** (Halton, rank, seed)
4. **Add materialization** in Materializer.ts
5. **Add IRBuilder method** `fieldPlacement()`
6. **Create new layout kernels** that take uv
7. **Migrate one layout block** (CircleLayout) as proof of concept
8. **Add compiler validation** to forbid index in layouts
9. **Migrate remaining layout blocks**
10. **Add determinism tests**

---

## External Context

The ChatGPT conversation (GaugeInvariantLayouts) at https://chatgpt.com/c/69783b5b-8104-8333-b871-a290e297f8e0 contains the full design discussion including:
- Detailed analysis of the velocity snap problem
- Trade-off discussion between different solutions
- The "rank-based activation" model explanation
- Considerations for 2.5D and 3D layouts

Note: The URL may require ChatGPT authentication to access.
