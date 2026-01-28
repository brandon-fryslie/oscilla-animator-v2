# PlacementBasis Implementation Plan

> **Topic**: placement-basis
> **Generated**: 2026-01-27
> **Updated**: 2026-01-27 (User decisions incorporated)
> **Source**: HANDOFF.md, CHATGPT-CONVERSATION.md, design-docs/CANONICAL-oscilla-v2.5-20260109/

---

## User Decisions (Resolved)

| Question | Decision |
|----------|----------|
| Migration Strategy | **Manual update only**. No backwards compatibility provisions. |
| BasisKind Selection | **Input parameter** - user-configurable per layout block. |
| Rank Semantics | **Activation only** - does NOT affect Z-ordering. |
| MaxCount | **Pre-allocate to 10k** (define `MAX_ELEMENTS` constant for future updates). |

### Additional Constraints

1. **Write NEW layouts** - leave existing layouts in place (no migration)
2. **Defer compiler validation** - "forbid index intrinsics" comes AFTER new layouts have full gauge-invariant continuity
3. **Comment deprecated code clearly** - goal is ONE path through the pipeline
4. **Test as you go** - not at the end
5. **Use buffer pools exclusively** - no inline allocation in render pipeline
6. **Modular & composable** - separate logic from state, side-effects at boundaries
7. **No arbitrary defaults** - defaults only at boundary layers; missing values in internal code = hard error
8. **Test error-on-missing behavior** - explicit tests for hard errors on missing values

---

## Executive Summary

### Problem
Current layouts use `normalizedIndex(i, N)` which causes **velocity snaps** when element count N changes. Position may be C0-continuous (position preserved), but velocity is not C1-continuous. Users perceive this as elements "teleporting" or "snapping" during live editing.

### Root Cause
Layout position is derived from `i / (N-1)`, which changes for ALL elements when N changes. The continuity system can mask the position jump, but the underlying trajectory change causes velocity discontinuity.

### Solution: PlacementBasis Abstraction
Provide stable per-element placement coordinates (`uv`, `rank`, `seed`) that are **independent of N**. New layouts consume these stable coordinates. When N changes:
- Existing elements keep their `uv/rank/seed` unchanged
- New elements get new values from deterministic generator
- No re-indexing of existing elements

### Key Invariant
**Fields are keyed by `(InstanceId, BasisKind)` and persist across recompilation/hot-swap.** This enables true gauge invariance (I2) for layout positions.

---

## Architecture Design

### Constants

```typescript
// src/runtime/PlacementBasis.ts
/**
 * Maximum elements per instance for PlacementBasis pre-allocation.
 * Matches renderer limit. Update this constant if renderer limit changes.
 */
export const MAX_ELEMENTS = 10_000;
```

### PlacementBasis Fields

| Field | Type | Range | Purpose |
|-------|------|-------|---------|
| `uv` | vec2 | [0,1] × [0,1] | 2D placement coordinate |
| `rank` | float | [0,1] | Activation order (who appears first when N grows) |
| `seed` | float | [0,1] | Per-element deterministic random |

### Storage Strategy

Separate PlacementBasis store in ContinuityState (survives hot-swap):

```typescript
// In ContinuityState
placementBasis: Map<InstanceId, PlacementBasisBuffers>

interface PlacementBasisBuffers {
  readonly uv: Float32Array;      // MAX_ELEMENTS * 2 floats (pre-allocated)
  readonly rank: Float32Array;    // MAX_ELEMENTS floats (pre-allocated)
  readonly seed: Float32Array;    // MAX_ELEMENTS floats (pre-allocated)
  readonly basisKind: BasisKind;  // Generation algorithm used
}
```

### BasisKind (User-Configurable)

```typescript
export type BasisKind =
  | 'halton2D'    // Low-discrepancy sequence (good general coverage)
  | 'random'      // Pure random (specified seed)
  | 'spiral'      // Spiral pattern (good for circles)
  | 'grid';       // Grid-aligned (good for grid layouts)
```

### Generation Strategy
- **uv**: Depends on `BasisKind` - Halton sequence for 'halton2D', etc.
- **rank**: `fract(i * PHI)` where PHI = 0.618033988749... (golden ratio)
- **seed**: `hash(instanceId, i)` deterministic from instance+element

### Instance Activation Model
Elements are activated by rank order:
```typescript
activeThreshold = N_active / MAX_ELEMENTS
// Element i is visible if: rank[i] <= activeThreshold
```

**Note**: Rank affects activation ONLY, not Z-ordering. Z-ordering is orthogonal.

---

## Sprint Overview

| Sprint | Name | Confidence | Key Deliverables |
|--------|------|------------|------------------|
| 1 | Type Foundation + Tests | HIGH | PlacementBasis types, storage interfaces, error tests |
| 2 | Generation + Tests | HIGH | Value generators (Halton, rank, seed), determinism tests |
| 3 | Materialization + Tests | HIGH | IRBuilder method, FieldExprPlacement, Materializer case |
| 4 | Layout Kernels + Tests | HIGH | circleLayoutUV, lineLayoutUV, gridLayoutUV kernels |
| 5 | New Layout Blocks + Tests | HIGH | CircleLayoutUV, LineLayoutUV, GridLayoutUV blocks |
| 6 | Persistence & Hot-Swap + Tests | MEDIUM | State migration, continuity integration |
| 7 | Velocity Continuity Integration Tests | HIGH | End-to-end gauge invariance verification |
| (Deferred) | Compiler Validation | MEDIUM | Forbid index intrinsics in layout blocks |

---

## Sprint 1: Type Foundation + Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: None

### Work Items

#### 1.1 Define PlacementBasis Constants

**File**: `src/runtime/PlacementBasis.ts` (new file)

```typescript
/**
 * PlacementBasis - Stable per-element placement coordinates
 *
 * Provides gauge-invariant coordinates for layouts that persist
 * across element count changes and hot-swap.
 *
 * @module PlacementBasis
 */

/**
 * Maximum elements per instance for PlacementBasis pre-allocation.
 * Matches renderer limit. Update this constant if renderer limit changes.
 */
export const MAX_ELEMENTS = 10_000;
```

#### 1.2 Define PlacementBasis Types

**File**: `src/compiler/ir/types.ts`

```typescript
/**
 * PlacementBasis field names (stable per-element coordinates).
 * These replace normalizedIndex in gauge-invariant layout blocks.
 */
export type PlacementFieldName = 'uv' | 'rank' | 'seed';

/**
 * Basis generation algorithm.
 * User-configurable per layout block.
 */
export type BasisKind =
  | 'halton2D'    // Low-discrepancy sequence (good general coverage)
  | 'random'      // Pure random (specified seed)
  | 'spiral'      // Spiral pattern (good for circles)
  | 'grid';       // Grid-aligned (good for grid layouts)
```

#### 1.3 Define PlacementBasisBuffers Interface

**File**: `src/runtime/PlacementBasis.ts`

```typescript
import type { BasisKind } from '../compiler/ir/types';

/**
 * Per-instance placement basis buffers.
 * Pre-allocated to MAX_ELEMENTS. Persists across frames and hot-swap.
 */
export interface PlacementBasisBuffers {
  readonly uv: Float32Array;      // MAX_ELEMENTS * 2 floats
  readonly rank: Float32Array;    // MAX_ELEMENTS floats
  readonly seed: Float32Array;    // MAX_ELEMENTS floats
  readonly basisKind: BasisKind;  // Generation algorithm used
}
```

#### 1.4 Add PlacementBasis to ContinuityState

**File**: `src/runtime/ContinuityState.ts`

```typescript
import type { PlacementBasisBuffers } from './PlacementBasis';
import type { InstanceId } from '../compiler/ir/types';

// Add to ContinuityState interface:
/** Per-instance placement basis, keyed by InstanceId */
readonly placementBasis: Map<InstanceId, PlacementBasisBuffers>;
```

#### 1.5 Tests: Error on Missing Values

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
describe('PlacementBasis', () => {
  describe('error on missing values', () => {
    it('throws when basisKind is missing in internal API', () => {
      // Internal functions MUST receive basisKind - no defaults
      expect(() => {
        fillPlacementBasis(buffers, instanceId, 0, 100, undefined as any);
      }).toThrow(/basisKind.*required/i);
    });

    it('throws when instanceId is missing', () => {
      expect(() => {
        ensurePlacementBasis(store, undefined as any, 100, 'halton2D');
      }).toThrow(/instanceId.*required/i);
    });

    it('throws when count is missing', () => {
      expect(() => {
        ensurePlacementBasis(store, 'test', undefined as any, 'halton2D');
      }).toThrow(/count.*required/i);
    });
  });
});
```

### Acceptance Criteria
- [ ] `MAX_ELEMENTS` constant exported (10,000)
- [ ] `PlacementFieldName` type exported from `src/compiler/ir/types.ts`
- [ ] `BasisKind` type exported from `src/compiler/ir/types.ts`
- [ ] `PlacementBasisBuffers` interface exported from `src/runtime/PlacementBasis.ts`
- [ ] `placementBasis` map added to ContinuityState
- [ ] Tests verify hard errors on missing required values
- [ ] TypeScript compiles without errors

---

## Sprint 2: Generation + Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 1

### Work Items

#### 2.1 Implement Halton Sequence Generator

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Generate 1D Halton sequence value for index i.
 * Pure function - no side effects.
 */
export function halton(index: number, base: number): number {
  if (typeof index !== 'number' || typeof base !== 'number') {
    throw new Error('halton: index and base are required numbers');
  }
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

/**
 * Generate 2D Halton sequence value for index i.
 * Pure function - no side effects.
 */
export function halton2D(i: number, base1: number, base2: number): [number, number] {
  if (typeof base1 !== 'number' || typeof base2 !== 'number') {
    throw new Error('halton2D: base1 and base2 are required numbers');
  }
  return [halton(i, base1), halton(i, base2)];
}
```

#### 2.2 Implement Rank Generator

**File**: `src/runtime/PlacementBasis.ts`

```typescript
const PHI = 0.6180339887498949; // Golden ratio conjugate

/**
 * Generate rank value for index i.
 * Uses golden ratio for low-discrepancy 1D sequence.
 * Pure function - no side effects.
 */
export function generateRank(i: number): number {
  if (typeof i !== 'number') {
    throw new Error('generateRank: index is required number');
  }
  return (i * PHI) % 1.0;
}
```

#### 2.3 Implement Seed Generator

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Simple string hash (djb2 variant).
 * Pure function - no side effects.
 */
function hashString(str: string): number {
  if (typeof str !== 'string') {
    throw new Error('hashString: str is required string');
  }
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Ensure unsigned
}

/**
 * Generate deterministic seed for instance+element.
 * Pure function - no side effects.
 */
export function generateSeed(instanceId: string, elementIndex: number): number {
  if (typeof instanceId !== 'string') {
    throw new Error('generateSeed: instanceId is required string');
  }
  if (typeof elementIndex !== 'number') {
    throw new Error('generateSeed: elementIndex is required number');
  }
  const hash = hashString(instanceId) ^ (elementIndex * 2654435761);
  return (hash >>> 0) / 4294967295; // Normalize to [0,1]
}
```

#### 2.4 Implement UV Generators for Each BasisKind

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Generate UV coordinate based on BasisKind.
 * Pure function - no side effects.
 */
export function generateUV(
  basisKind: BasisKind,
  index: number,
  instanceId: string
): [number, number] {
  if (!basisKind) {
    throw new Error('generateUV: basisKind is required');
  }

  switch (basisKind) {
    case 'halton2D':
      return halton2D(index, 2, 3);

    case 'random': {
      // Use seed-derived pseudo-random
      const seed1 = generateSeed(instanceId, index * 2);
      const seed2 = generateSeed(instanceId, index * 2 + 1);
      return [seed1, seed2];
    }

    case 'spiral': {
      // Fermat spiral for good circle coverage
      const angle = index * PHI * 2 * Math.PI;
      const radius = Math.sqrt(index / MAX_ELEMENTS);
      return [
        0.5 + 0.5 * radius * Math.cos(angle),
        0.5 + 0.5 * radius * Math.sin(angle),
      ];
    }

    case 'grid': {
      // Grid-aligned using Halton but snapped
      const [u, v] = halton2D(index, 2, 3);
      return [u, v]; // Grid snapping done by kernel if needed
    }

    default: {
      const _exhaustive: never = basisKind;
      throw new Error(`Unknown basisKind: ${_exhaustive}`);
    }
  }
}
```

#### 2.5 Tests: Generation Functions

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
describe('generation functions', () => {
  describe('halton', () => {
    it('produces values in [0,1]', () => {
      for (let i = 0; i < 1000; i++) {
        const v = halton(i, 2);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic', () => {
      expect(halton(42, 2)).toBe(halton(42, 2));
      expect(halton(42, 3)).toBe(halton(42, 3));
    });

    it('throws on missing parameters', () => {
      expect(() => halton(undefined as any, 2)).toThrow();
      expect(() => halton(5, undefined as any)).toThrow();
    });
  });

  describe('generateRank', () => {
    it('produces values in [0,1]', () => {
      for (let i = 0; i < 1000; i++) {
        const v = generateRank(i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('is deterministic', () => {
      expect(generateRank(42)).toBe(generateRank(42));
    });

    it('has good distribution (no clustering)', () => {
      const buckets = new Array(10).fill(0);
      for (let i = 0; i < 1000; i++) {
        const bucket = Math.floor(generateRank(i) * 10);
        buckets[Math.min(bucket, 9)]++;
      }
      // Each bucket should have ~100 ± 50
      for (const count of buckets) {
        expect(count).toBeGreaterThan(50);
        expect(count).toBeLessThan(150);
      }
    });
  });

  describe('generateSeed', () => {
    it('is deterministic', () => {
      expect(generateSeed('instance1', 42)).toBe(generateSeed('instance1', 42));
    });

    it('produces different values for different instances', () => {
      expect(generateSeed('instance1', 42)).not.toBe(generateSeed('instance2', 42));
    });

    it('produces different values for different indices', () => {
      expect(generateSeed('instance1', 42)).not.toBe(generateSeed('instance1', 43));
    });
  });

  describe('generateUV', () => {
    it('handles all BasisKind values', () => {
      const kinds: BasisKind[] = ['halton2D', 'random', 'spiral', 'grid'];
      for (const kind of kinds) {
        const [u, v] = generateUV(kind, 42, 'test');
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('throws on missing basisKind', () => {
      expect(() => generateUV(undefined as any, 42, 'test')).toThrow(/basisKind.*required/i);
    });
  });
});
```

### Acceptance Criteria
- [ ] `halton`, `halton2D` produce values in [0,1]
- [ ] `generateRank` produces values in [0,1) with good distribution
- [ ] `generateSeed` is deterministic and varies by instance/index
- [ ] `generateUV` handles all BasisKind values with exhaustive switch
- [ ] All functions throw on missing required parameters
- [ ] All tests pass

---

## Sprint 3: Materialization + Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 2

### Work Items

#### 3.1 Add FieldExprPlacement to IR

**File**: `src/compiler/ir/types.ts`

```typescript
/**
 * Placement field expression - gauge-invariant per-element coordinates.
 * These replace normalizedIndex for layout blocks.
 */
export interface FieldExprPlacement {
  readonly kind: 'placement';
  readonly instanceId: InstanceId;
  readonly field: PlacementFieldName;
  readonly basisKind: BasisKind;
  readonly type: SignalType;
}

// Update FieldExpr union:
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

#### 3.2 Add IRBuilder.fieldPlacement() Method

**File**: `src/compiler/ir/IRBuilder.ts` (interface)

```typescript
/**
 * Create a field from placement basis.
 * Replaces normalizedIndex for gauge-invariant layouts.
 *
 * @param instanceId - The instance this field operates over
 * @param field - Which placement field (uv, rank, seed)
 * @param basisKind - Generation algorithm (user-configurable)
 * @param type - Signal type of the field
 * @throws Error if any parameter is missing
 */
fieldPlacement(
  instanceId: InstanceId,
  field: PlacementFieldName,
  basisKind: BasisKind,
  type: SignalType
): FieldExprId;
```

**File**: `src/compiler/ir/IRBuilderImpl.ts` (implementation)

```typescript
fieldPlacement(
  instanceId: InstanceId,
  field: PlacementFieldName,
  basisKind: BasisKind,
  type: SignalType
): FieldExprId {
  if (!instanceId) {
    throw new Error('fieldPlacement: instanceId is required');
  }
  if (!field) {
    throw new Error('fieldPlacement: field is required');
  }
  if (!basisKind) {
    throw new Error('fieldPlacement: basisKind is required');
  }
  if (!type) {
    throw new Error('fieldPlacement: type is required');
  }

  const expr: FieldExprPlacement = {
    kind: 'placement',
    instanceId,
    field,
    basisKind,
    type,
  };
  return this.addFieldExpr(expr);
}
```

#### 3.3 Implement Buffer Filler

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Fill placement basis buffers for a range of indices.
 * Uses buffer pool for temporary allocations.
 *
 * @param buffers - Target buffers (pre-allocated to MAX_ELEMENTS)
 * @param instanceId - Instance identifier for seed generation
 * @param startIdx - First index to fill
 * @param endIdx - Last index (exclusive) to fill
 * @param basisKind - Generation algorithm
 */
export function fillPlacementBasis(
  buffers: PlacementBasisBuffers,
  instanceId: string,
  startIdx: number,
  endIdx: number,
  basisKind: BasisKind
): void {
  if (!buffers) throw new Error('fillPlacementBasis: buffers is required');
  if (!instanceId) throw new Error('fillPlacementBasis: instanceId is required');
  if (typeof startIdx !== 'number') throw new Error('fillPlacementBasis: startIdx is required number');
  if (typeof endIdx !== 'number') throw new Error('fillPlacementBasis: endIdx is required number');
  if (!basisKind) throw new Error('fillPlacementBasis: basisKind is required');

  for (let i = startIdx; i < endIdx; i++) {
    const [u, v] = generateUV(basisKind, i, instanceId);
    buffers.uv[i * 2 + 0] = u;
    buffers.uv[i * 2 + 1] = v;
    buffers.rank[i] = generateRank(i);
    buffers.seed[i] = generateSeed(instanceId, i);
  }
}
```

#### 3.4 Implement ensurePlacementBasis

**File**: `src/runtime/PlacementBasis.ts`

```typescript
/**
 * Create or retrieve PlacementBasis buffers for an instance.
 * Buffers are pre-allocated to MAX_ELEMENTS and never resized.
 *
 * @param store - The placement basis store
 * @param instanceId - Instance identifier
 * @param count - Current element count (used for initial fill)
 * @param basisKind - Generation algorithm
 * @returns PlacementBasisBuffers (from store or newly created)
 */
export function ensurePlacementBasis(
  store: Map<string, PlacementBasisBuffers>,
  instanceId: string,
  count: number,
  basisKind: BasisKind
): PlacementBasisBuffers {
  if (!store) throw new Error('ensurePlacementBasis: store is required');
  if (!instanceId) throw new Error('ensurePlacementBasis: instanceId is required');
  if (typeof count !== 'number') throw new Error('ensurePlacementBasis: count is required number');
  if (!basisKind) throw new Error('ensurePlacementBasis: basisKind is required');

  const existing = store.get(instanceId);
  if (existing) {
    // Already have buffers for this instance - return as-is
    // (pre-allocated to MAX_ELEMENTS, no resize needed)
    return existing;
  }

  // Allocate new buffers (pre-allocated to MAX_ELEMENTS)
  const buffers: PlacementBasisBuffers = {
    uv: new Float32Array(MAX_ELEMENTS * 2),
    rank: new Float32Array(MAX_ELEMENTS),
    seed: new Float32Array(MAX_ELEMENTS),
    basisKind,
  };

  // Fill all slots up front (deterministic)
  fillPlacementBasis(buffers, instanceId, 0, MAX_ELEMENTS, basisKind);

  store.set(instanceId, buffers);
  return buffers;
}
```

#### 3.5 Add Materializer Support

**File**: `src/runtime/Materializer.ts`

Add case to the field expression switch:

```typescript
case 'placement': {
  const expr = field as FieldExprPlacement;

  // Get or create placement basis for this instance
  const basis = ensurePlacementBasis(
    state.continuity.placementBasis,
    expr.instanceId,
    N,
    expr.basisKind
  );

  const outArr = out as Float32Array;
  switch (expr.field) {
    case 'uv':
      // Copy N elements (stride 2)
      outArr.set(basis.uv.subarray(0, N * 2));
      break;
    case 'rank':
      outArr.set(basis.rank.subarray(0, N));
      break;
    case 'seed':
      outArr.set(basis.seed.subarray(0, N));
      break;
    default: {
      const _: never = expr.field;
      throw new Error(`Unknown placement field: ${_}`);
    }
  }
  break;
}
```

#### 3.6 Tests: Materialization

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
describe('materialization', () => {
  describe('ensurePlacementBasis', () => {
    it('creates buffers pre-allocated to MAX_ELEMENTS', () => {
      const store = new Map();
      const buffers = ensurePlacementBasis(store, 'test', 100, 'halton2D');

      expect(buffers.uv.length).toBe(MAX_ELEMENTS * 2);
      expect(buffers.rank.length).toBe(MAX_ELEMENTS);
      expect(buffers.seed.length).toBe(MAX_ELEMENTS);
    });

    it('returns same buffers on second call', () => {
      const store = new Map();
      const buffers1 = ensurePlacementBasis(store, 'test', 100, 'halton2D');
      const buffers2 = ensurePlacementBasis(store, 'test', 200, 'halton2D');

      expect(buffers1).toBe(buffers2); // Same reference
    });

    it('creates different buffers for different instances', () => {
      const store = new Map();
      const buffers1 = ensurePlacementBasis(store, 'test1', 100, 'halton2D');
      const buffers2 = ensurePlacementBasis(store, 'test2', 100, 'halton2D');

      expect(buffers1).not.toBe(buffers2);
    });

    it('throws on missing parameters', () => {
      const store = new Map();
      expect(() => ensurePlacementBasis(undefined as any, 'test', 100, 'halton2D')).toThrow();
      expect(() => ensurePlacementBasis(store, undefined as any, 100, 'halton2D')).toThrow();
      expect(() => ensurePlacementBasis(store, 'test', undefined as any, 'halton2D')).toThrow();
      expect(() => ensurePlacementBasis(store, 'test', 100, undefined as any)).toThrow();
    });
  });

  describe('fillPlacementBasis', () => {
    it('fills all three arrays', () => {
      const buffers: PlacementBasisBuffers = {
        uv: new Float32Array(200),
        rank: new Float32Array(100),
        seed: new Float32Array(100),
        basisKind: 'halton2D',
      };

      fillPlacementBasis(buffers, 'test', 0, 100, 'halton2D');

      // Check that values were written
      expect(buffers.uv[0]).not.toBe(0); // First u
      expect(buffers.rank[0]).not.toBe(0); // First rank (index 0 has rank ~0, but > 0)
      expect(buffers.seed[0]).toBeGreaterThanOrEqual(0);
    });

    it('is deterministic', () => {
      const buffers1: PlacementBasisBuffers = {
        uv: new Float32Array(200),
        rank: new Float32Array(100),
        seed: new Float32Array(100),
        basisKind: 'halton2D',
      };
      const buffers2: PlacementBasisBuffers = {
        uv: new Float32Array(200),
        rank: new Float32Array(100),
        seed: new Float32Array(100),
        basisKind: 'halton2D',
      };

      fillPlacementBasis(buffers1, 'test', 0, 100, 'halton2D');
      fillPlacementBasis(buffers2, 'test', 0, 100, 'halton2D');

      expect(Array.from(buffers1.uv)).toEqual(Array.from(buffers2.uv));
      expect(Array.from(buffers1.rank)).toEqual(Array.from(buffers2.rank));
      expect(Array.from(buffers1.seed)).toEqual(Array.from(buffers2.seed));
    });
  });
});
```

### Acceptance Criteria
- [ ] `FieldExprPlacement` interface defined with all required fields
- [ ] `FieldExpr` union updated to include `FieldExprPlacement`
- [ ] `IRBuilder.fieldPlacement()` method added with parameter validation
- [ ] `fillPlacementBasis` fills all three arrays deterministically
- [ ] `ensurePlacementBasis` pre-allocates to MAX_ELEMENTS
- [ ] Materializer handles 'placement' kind with exhaustive switch
- [ ] All functions throw on missing required parameters
- [ ] All tests pass

---

## Sprint 4: Layout Kernels + Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 3

### Work Items

#### 4.1 Create circleLayoutUV Kernel

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
 *   field: uv (vec2, stride 2)
 *   signals: [radius, phase]
 * Output: vec3 (world-space position, stride 3)
 */
```

In `applyFieldKernelZipSig`:
```typescript
} else if (fieldOp === 'circleLayoutUV') {
  const outArr = out as Float32Array;
  const uvArr = fieldInput as Float32Array;
  const radius = sigVals[0];
  const phase = sigVals[1];

  if (typeof radius !== 'number') throw new Error('circleLayoutUV: radius signal required');
  if (typeof phase !== 'number') throw new Error('circleLayoutUV: phase signal required');

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

#### 4.2 Create lineLayoutUV Kernel

**File**: `src/runtime/FieldKernels.ts`

```typescript
/**
 * lineLayoutUV: UV-based line layout (gauge-invariant)
 *
 * Uses uv.x as the interpolation parameter along the line.
 *
 * Inputs (zipSig):
 *   field: uv (vec2, stride 2)
 *   signals: [x0, y0, x1, y1]
 * Output: vec3 (world-space position, stride 3)
 */
```

In `applyFieldKernelZipSig`:
```typescript
} else if (fieldOp === 'lineLayoutUV') {
  const outArr = out as Float32Array;
  const uvArr = fieldInput as Float32Array;
  const x0 = sigVals[0];
  const y0 = sigVals[1];
  const x1 = sigVals[2];
  const y1 = sigVals[3];

  if (typeof x0 !== 'number') throw new Error('lineLayoutUV: x0 signal required');
  if (typeof y0 !== 'number') throw new Error('lineLayoutUV: y0 signal required');
  if (typeof x1 !== 'number') throw new Error('lineLayoutUV: x1 signal required');
  if (typeof y1 !== 'number') throw new Error('lineLayoutUV: y1 signal required');

  for (let i = 0; i < N; i++) {
    const t = uvArr[i * 2 + 0]; // Use u as interpolation parameter
    outArr[i * 3 + 0] = x0 + t * (x1 - x0);
    outArr[i * 3 + 1] = y0 + t * (y1 - y0);
    outArr[i * 3 + 2] = 0.0;
  }
}
```

#### 4.3 Create gridLayoutUV Kernel

**File**: `src/runtime/FieldKernels.ts`

```typescript
/**
 * gridLayoutUV: UV-based grid layout (gauge-invariant)
 *
 * Maps uv directly to grid positions.
 *
 * Inputs (zipSig):
 *   field: uv (vec2, stride 2)
 *   signals: [width, height] (grid extent in world space)
 * Output: vec3 (world-space position, stride 3)
 */
```

In `applyFieldKernelZipSig`:
```typescript
} else if (fieldOp === 'gridLayoutUV') {
  const outArr = out as Float32Array;
  const uvArr = fieldInput as Float32Array;
  const width = sigVals[0];
  const height = sigVals[1];

  if (typeof width !== 'number') throw new Error('gridLayoutUV: width signal required');
  if (typeof height !== 'number') throw new Error('gridLayoutUV: height signal required');

  for (let i = 0; i < N; i++) {
    const u = uvArr[i * 2 + 0];
    const v = uvArr[i * 2 + 1];
    outArr[i * 3 + 0] = u * width;
    outArr[i * 3 + 1] = v * height;
    outArr[i * 3 + 2] = 0.0;
  }
}
```

#### 4.4 Tests: Layout Kernels

**File**: `src/runtime/__tests__/FieldKernels.test.ts`

```typescript
describe('UV layout kernels', () => {
  describe('circleLayoutUV', () => {
    it('places elements on a circle', () => {
      const N = 4;
      const uv = new Float32Array([0, 0, 0.25, 0, 0.5, 0, 0.75, 0]); // u = 0, 0.25, 0.5, 0.75
      const out = new Float32Array(N * 3);
      const radius = 0.4;
      const phase = 0;

      applyFieldKernelZipSig('circleLayoutUV', uv, [radius, phase], out, N);

      // u=0 -> angle=0 -> (0.5 + 0.4, 0.5 + 0, 0)
      expect(out[0]).toBeCloseTo(0.9);
      expect(out[1]).toBeCloseTo(0.5);
      expect(out[2]).toBeCloseTo(0);

      // u=0.25 -> angle=PI/2 -> (0.5, 0.5 + 0.4, 0)
      expect(out[3]).toBeCloseTo(0.5);
      expect(out[4]).toBeCloseTo(0.9);
    });

    it('throws on missing signals', () => {
      const uv = new Float32Array(8);
      const out = new Float32Array(12);
      expect(() => applyFieldKernelZipSig('circleLayoutUV', uv, [], out, 4)).toThrow(/radius.*required/i);
    });
  });

  describe('lineLayoutUV', () => {
    it('interpolates along a line', () => {
      const N = 3;
      const uv = new Float32Array([0, 0, 0.5, 0, 1.0, 0]); // u = 0, 0.5, 1.0
      const out = new Float32Array(N * 3);

      applyFieldKernelZipSig('lineLayoutUV', uv, [0, 0, 1, 1], out, N);

      // u=0 -> (0, 0, 0)
      expect(out[0]).toBeCloseTo(0);
      expect(out[1]).toBeCloseTo(0);

      // u=0.5 -> (0.5, 0.5, 0)
      expect(out[3]).toBeCloseTo(0.5);
      expect(out[4]).toBeCloseTo(0.5);

      // u=1.0 -> (1, 1, 0)
      expect(out[6]).toBeCloseTo(1);
      expect(out[7]).toBeCloseTo(1);
    });
  });

  describe('gridLayoutUV', () => {
    it('maps uv to grid positions', () => {
      const N = 4;
      const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]); // corners
      const out = new Float32Array(N * 3);

      applyFieldKernelZipSig('gridLayoutUV', uv, [10, 10], out, N);

      // (0,0) -> (0, 0, 0)
      expect(out[0]).toBeCloseTo(0);
      expect(out[1]).toBeCloseTo(0);

      // (1,0) -> (10, 0, 0)
      expect(out[3]).toBeCloseTo(10);
      expect(out[4]).toBeCloseTo(0);

      // (0,1) -> (0, 10, 0)
      expect(out[6]).toBeCloseTo(0);
      expect(out[7]).toBeCloseTo(10);

      // (1,1) -> (10, 10, 0)
      expect(out[9]).toBeCloseTo(10);
      expect(out[10]).toBeCloseTo(10);
    });
  });
});
```

### Acceptance Criteria
- [ ] `circleLayoutUV` kernel implemented and tested
- [ ] `lineLayoutUV` kernel implemented and tested
- [ ] `gridLayoutUV` kernel implemented and tested
- [ ] All kernels throw on missing required signals
- [ ] All tests pass

---

## Sprint 5: New Layout Blocks + Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 4

### Work Items

#### 5.1 Create CircleLayoutUV Block

**File**: `src/blocks/instance-blocks.ts`

```typescript
/**
 * CircleLayoutUV - Gauge-invariant circle layout
 *
 * Uses PlacementBasis UV coordinates instead of normalizedIndex.
 * When element count changes, existing elements keep their positions.
 *
 * @deprecated CircleLayout uses normalizedIndex (velocity snaps on count change).
 *             Use CircleLayoutUV for gauge-invariant layouts.
 */
registerBlock({
  type: 'CircleLayoutUV',
  label: 'Circle Layout (UV)',
  category: 'layout',
  description: 'Gauge-invariant circle layout using placement basis',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: signalTypeField(SHAPE, 'default') },
    radius: {
      label: 'Radius',
      type: signalType(FLOAT),
      value: 0.4,
      defaultSource: defaultSourceConst(0.4),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    phase: {
      label: 'Phase',
      type: signalType(FLOAT, unitPhase01),
      value: 0,
      defaultSource: defaultSourceConst(0),
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
    basisKind: {
      label: 'Basis Kind',
      type: signalType(INT), // Enum as int: 0=halton2D, 1=random, 2=spiral, 3=grid
      value: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: false,
      uiHint: {
        kind: 'dropdown',
        options: [
          { value: 0, label: 'Halton (default)' },
          { value: 1, label: 'Random' },
          { value: 2, label: 'Spiral' },
          { value: 3, label: 'Grid' },
        ],
      },
    },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField(VEC3, 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('CircleLayoutUV requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('CircleLayoutUV requires instance context from upstream Array block');
    }

    // Get radius and phase as signals
    const radiusSig = inputsById.radius?.k === 'sig'
      ? inputsById.radius.id
      : ctx.b.sigConst((config?.radius as number) ?? 0.4, signalType(FLOAT));
    const phaseSig = inputsById.phase?.k === 'sig'
      ? inputsById.phase.id
      : ctx.b.sigConst((config?.phase as number) ?? 0, signalType(FLOAT, unitPhase01));

    // Map basisKind config to BasisKind type
    const basisKindValue = (config?.basisKind as number) ?? 0;
    const basisKind: BasisKind = ['halton2D', 'random', 'spiral', 'grid'][basisKindValue] as BasisKind;
    if (!basisKind) {
      throw new Error(`CircleLayoutUV: invalid basisKind value ${basisKindValue}`);
    }

    // Create UV field from PlacementBasis (gauge-invariant)
    const uvField = ctx.b.fieldPlacement(
      instanceId,
      'uv',
      basisKind,
      signalTypeField(VEC2, 'default')
    );

    // Apply circleLayoutUV kernel: uv + [radius, phase] → vec3 positions
    const positionField = ctx.b.fieldZipSig(
      uvField,
      [radiusSig, phaseSig],
      { kind: 'kernel', name: 'circleLayoutUV' },
      signalTypeField(VEC3, 'default')
    );

    const posType = ctx.outTypes[0];
    const posSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
      },
      inferredInstance: instanceId,
    };
  },
});
```

#### 5.2 Create LineLayoutUV Block

**File**: `src/blocks/instance-blocks.ts`

Similar pattern to CircleLayoutUV, using `lineLayoutUV` kernel.

#### 5.3 Create GridLayoutUV Block

**File**: `src/blocks/instance-blocks.ts`

Similar pattern to CircleLayoutUV, using `gridLayoutUV` kernel.

#### 5.4 Add Deprecation Comments to Old Layouts

**File**: `src/blocks/instance-blocks.ts`

```typescript
/**
 * CircleLayout - Arranges field elements in a circle
 *
 * @deprecated Uses normalizedIndex which causes velocity snaps when count changes.
 *             Use CircleLayoutUV for gauge-invariant layouts.
 *             TODO: Remove this block once all patches are migrated.
 */
registerBlock({
  type: 'CircleLayout',
  // ... existing implementation unchanged
});
```

#### 5.5 Tests: New Layout Blocks

**File**: `src/blocks/__tests__/layout-blocks-uv.test.ts`

```typescript
describe('UV Layout Blocks', () => {
  describe('CircleLayoutUV', () => {
    it('registers successfully', () => {
      expect(getBlockDefinition('CircleLayoutUV')).toBeDefined();
    });

    it('requires basisKind parameter', () => {
      // Test that block definition includes basisKind input
      const def = getBlockDefinition('CircleLayoutUV');
      expect(def.inputs.basisKind).toBeDefined();
    });

    it('uses fieldPlacement instead of fieldIntrinsic', () => {
      // Integration test: compile a graph with CircleLayoutUV
      // Verify the IR contains FieldExprPlacement, not FieldExprIntrinsic
    });
  });

  describe('LineLayoutUV', () => {
    it('registers successfully', () => {
      expect(getBlockDefinition('LineLayoutUV')).toBeDefined();
    });
  });

  describe('GridLayoutUV', () => {
    it('registers successfully', () => {
      expect(getBlockDefinition('GridLayoutUV')).toBeDefined();
    });
  });
});
```

### Acceptance Criteria
- [ ] `CircleLayoutUV` block registered with `basisKind` input parameter
- [ ] `LineLayoutUV` block registered
- [ ] `GridLayoutUV` block registered
- [ ] All new blocks use `fieldPlacement()` instead of `fieldIntrinsic()`
- [ ] Old layout blocks have deprecation comments
- [ ] All tests pass

---

## Sprint 6: Persistence & Hot-Swap + Tests

**Confidence**: MEDIUM
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprint 5

### Work Items

#### 6.1 Initialize PlacementBasis Map in ContinuityState

**File**: `src/runtime/ContinuityState.ts`

Ensure `placementBasis` map is initialized empty and persists across frames.

#### 6.2 Persist PlacementBasis Across Hot-Swap

**File**: `src/runtime/StateMigration.ts`

```typescript
/**
 * Migrate PlacementBasis during hot-swap.
 *
 * PlacementBasis buffers persist across recompilation:
 * - Existing instances keep their buffers unchanged
 * - New instances get fresh buffers
 * - Removed instances have buffers garbage collected
 */
function migratePlacementBasis(
  oldBasis: Map<InstanceId, PlacementBasisBuffers>,
  newInstances: Map<InstanceId, InstanceDecl>,
  instanceBasisKinds: Map<InstanceId, BasisKind>
): Map<InstanceId, PlacementBasisBuffers> {
  if (!oldBasis) throw new Error('migratePlacementBasis: oldBasis is required');
  if (!newInstances) throw new Error('migratePlacementBasis: newInstances is required');
  if (!instanceBasisKinds) throw new Error('migratePlacementBasis: instanceBasisKinds is required');

  const newBasis = new Map<InstanceId, PlacementBasisBuffers>();

  for (const [instanceId, decl] of newInstances) {
    const existing = oldBasis.get(instanceId);
    const basisKind = instanceBasisKinds.get(instanceId);

    if (!basisKind) {
      // Instance doesn't use placement basis - skip
      continue;
    }

    if (existing && existing.basisKind === basisKind) {
      // Preserve existing basis (buffers are pre-allocated to MAX_ELEMENTS)
      newBasis.set(instanceId, existing);
    } else {
      // New instance or basisKind changed - create fresh buffers
      newBasis.set(instanceId, createPlacementBasis(instanceId, basisKind));
    }
  }

  return newBasis;
}

/**
 * Create fresh PlacementBasis buffers for an instance.
 */
function createPlacementBasis(
  instanceId: string,
  basisKind: BasisKind
): PlacementBasisBuffers {
  if (!instanceId) throw new Error('createPlacementBasis: instanceId is required');
  if (!basisKind) throw new Error('createPlacementBasis: basisKind is required');

  const buffers: PlacementBasisBuffers = {
    uv: new Float32Array(MAX_ELEMENTS * 2),
    rank: new Float32Array(MAX_ELEMENTS),
    seed: new Float32Array(MAX_ELEMENTS),
    basisKind,
  };

  fillPlacementBasis(buffers, instanceId, 0, MAX_ELEMENTS, basisKind);
  return buffers;
}
```

#### 6.3 Tests: Persistence

**File**: `src/runtime/__tests__/PlacementBasis.test.ts`

```typescript
describe('persistence', () => {
  it('PlacementBasis survives frame boundaries', () => {
    // Create continuity state with placement basis
    // Run multiple frames
    // Verify basis values unchanged
  });

  it('PlacementBasis survives hot-swap', () => {
    // Create runtime with layout
    // Record PlacementBasis values
    // Trigger hot-swap (recompile with same graph)
    // Verify PlacementBasis values unchanged
  });

  it('migratePlacementBasis preserves existing buffers', () => {
    const oldBasis = new Map();
    const existing = createPlacementBasis('test', 'halton2D');
    oldBasis.set('test', existing);

    const newInstances = new Map([['test', { id: 'test', count: 100 } as any]]);
    const basisKinds = new Map([['test', 'halton2D' as BasisKind]]);

    const result = migratePlacementBasis(oldBasis, newInstances, basisKinds);

    expect(result.get('test')).toBe(existing); // Same reference
  });

  it('migratePlacementBasis creates new buffers for new instances', () => {
    const oldBasis = new Map();
    const newInstances = new Map([['new', { id: 'new', count: 100 } as any]]);
    const basisKinds = new Map([['new', 'halton2D' as BasisKind]]);

    const result = migratePlacementBasis(oldBasis, newInstances, basisKinds);

    expect(result.has('new')).toBe(true);
    expect(result.get('new')!.basisKind).toBe('halton2D');
  });

  it('migratePlacementBasis recreates buffers when basisKind changes', () => {
    const oldBasis = new Map();
    const existing = createPlacementBasis('test', 'halton2D');
    oldBasis.set('test', existing);

    const newInstances = new Map([['test', { id: 'test', count: 100 } as any]]);
    const basisKinds = new Map([['test', 'spiral' as BasisKind]]); // Changed!

    const result = migratePlacementBasis(oldBasis, newInstances, basisKinds);

    expect(result.get('test')).not.toBe(existing); // Different reference
    expect(result.get('test')!.basisKind).toBe('spiral');
  });
});
```

### Acceptance Criteria
- [ ] `placementBasis` map initialized in ContinuityState
- [ ] PlacementBasis survives frame boundaries
- [ ] PlacementBasis survives hot-swap via `migratePlacementBasis`
- [ ] BasisKind change triggers buffer recreation
- [ ] All tests pass

---

## Sprint 7: Velocity Continuity Integration Tests

**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION
**Dependencies**: Sprints 1-6

### Work Items

#### 7.1 Integration Test: Position Preservation

**File**: `src/runtime/__tests__/velocity-continuity.test.ts`

```typescript
describe('Velocity Continuity (Gauge Invariance)', () => {
  it('UV values unchanged when element count increases', () => {
    // Setup: Create runtime with CircleLayoutUV, N=50
    // Record UV values for elements 0-49

    // Action: Increase to N=100

    // Verify: UV values for elements 0-49 are IDENTICAL
    // (not just close - exactly the same buffer values)
  });

  it('positions unchanged when element count increases', () => {
    // Setup: Create runtime with CircleLayoutUV, N=50
    // Record positions for elements 0-49

    // Action: Increase to N=100

    // Verify: Positions for elements 0-49 are unchanged
  });

  it('velocity preserved (C1 continuity) when N changes', () => {
    // Setup: Create runtime with CircleLayoutUV, N=50
    // Advance frame, record positions P1
    // Advance frame, record positions P2
    // Compute velocity V1 = P2 - P1

    // Action: Increase to N=100
    // Advance frame, record positions P3

    // Verify: V2 = P3 - P2 equals V1 for elements 0-49
    // (no velocity discontinuity)
  });

  it('new elements appear without affecting existing', () => {
    // Setup: Create runtime with CircleLayoutUV, N=50
    // Record positions for elements 0-49

    // Action: Increase to N=100

    // Verify:
    // - Elements 0-49 positions unchanged
    // - Elements 50-99 have valid new positions
    // - Elements 50-99 positions differ from 0-49
  });

  it('deterministic across runs', () => {
    // Run 1: Create runtime, record all UV/rank/seed values
    // Run 2: Create fresh runtime with same config, record values

    // Verify: All values identical between runs
  });
});
```

#### 7.2 Comparison Test: Old vs New Layout

**File**: `src/runtime/__tests__/velocity-continuity.test.ts`

```typescript
describe('Old vs New Layout Comparison', () => {
  it('CircleLayout (old) has velocity snap on count change', () => {
    // Demonstrate the problem we're solving
    // N=50 -> N=100 causes position changes for existing elements
  });

  it('CircleLayoutUV (new) has NO velocity snap on count change', () => {
    // Demonstrate the solution
    // N=50 -> N=100 causes NO position changes for existing elements
  });
});
```

### Acceptance Criteria
- [ ] Test proves UV values unchanged when count increases
- [ ] Test proves positions unchanged when count increases
- [ ] Test proves velocity preserved (C1 continuity)
- [ ] Test proves new elements don't affect existing
- [ ] Test proves determinism across runs
- [ ] Comparison test demonstrates old vs new behavior
- [ ] All tests pass

---

## Deferred: Compiler Validation

**Status**: DEFERRED until new layouts have full gauge-invariant continuity

### Work Items (To Be Implemented Later)

#### D.1 Add Layout Block Category Detection

**File**: `src/blocks/registry.ts`

Ensure `category: 'layout'` is reliably set on all layout blocks.

#### D.2 Add Compiler Validation Pass

**File**: `src/compiler/passes-v2/` (new pass or extension)

```typescript
/**
 * Validate that layout blocks with category 'layout' do not read
 * forbidden intrinsics (index, normalizedIndex).
 *
 * Layout blocks MUST use PlacementBasis fields instead.
 *
 * NOTE: This validation is DEFERRED until new UV layouts are complete
 * and proven gauge-invariant.
 */
function validateLayoutInputs(block: Block, inputsById: Map<string, Input>): void {
  if (block.category !== 'layout') return;
  // Check for forbidden intrinsics...
}
```

---

## Dependency Graph

```
Sprint 1 (Types + Tests)
    |
    v
Sprint 2 (Generation + Tests)
    |
    v
Sprint 3 (Materialization + Tests)
    |
    v
Sprint 4 (Kernels + Tests)
    |
    v
Sprint 5 (New Blocks + Tests)
    |
    v
Sprint 6 (Persistence + Tests)
    |
    v
Sprint 7 (Integration Tests)
    |
    v
[DEFERRED] Compiler Validation
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/runtime/PlacementBasis.ts` | Constants, types, generators, allocator |
| `src/runtime/__tests__/PlacementBasis.test.ts` | Unit tests |
| `src/runtime/__tests__/velocity-continuity.test.ts` | Integration tests |
| `src/blocks/__tests__/layout-blocks-uv.test.ts` | Block registration tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/compiler/ir/types.ts` | Add PlacementFieldName, BasisKind, FieldExprPlacement |
| `src/compiler/ir/IRBuilder.ts` | Add fieldPlacement() interface |
| `src/compiler/ir/IRBuilderImpl.ts` | Implement fieldPlacement() |
| `src/runtime/Materializer.ts` | Add 'placement' case |
| `src/runtime/FieldKernels.ts` | Add circleLayoutUV, lineLayoutUV, gridLayoutUV |
| `src/runtime/ContinuityState.ts` | Add placementBasis map |
| `src/runtime/StateMigration.ts` | Add migratePlacementBasis |
| `src/blocks/instance-blocks.ts` | Add new UV blocks, deprecation comments |

---

## Success Criteria

1. **Velocity snaps eliminated**: When N changes, existing elements don't move
2. **New layouts use PlacementBasis**: CircleLayoutUV, LineLayoutUV, GridLayoutUV
3. **Deterministic**: Same seed produces same PlacementBasis values
4. **Hot-swap safe**: PlacementBasis survives recompilation
5. **No inline allocation**: Buffer pools used exclusively
6. **Hard errors on missing values**: All internal APIs validate parameters
7. **Tests**: Full coverage with tests written alongside each sprint

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-27 | Claude | Initial plan created from HANDOFF.md analysis |
| 2026-01-27 | Claude | User decisions incorporated: manual migration, configurable basisKind, rank=activation only, MAX_ELEMENTS=10k, new layouts (no migration), deferred validation, test-as-you-go, buffer pools, modular code, hard errors on missing values |
