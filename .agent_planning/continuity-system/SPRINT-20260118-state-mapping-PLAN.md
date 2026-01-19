# Sprint: state-mapping - Continuity State & Mapping

> **Generated**: 2026-01-18
> **Confidence**: HIGH
> **Status**: READY FOR IMPLEMENTATION
> **Depends On**: identity-foundation

---

## Sprint Goal

Implement the state storage and element mapping infrastructure for the Continuity System. This enables tracking of gauge/slew buffers and computing element correspondence when domain counts change.

---

## Scope

### Deliverables
1. `ContinuityState` type with per-target buffers
2. `MappingState` discriminated union
3. `StableTargetId` branded type
4. Mapping algorithms (`buildMappingById`, `buildMappingByPosition`)
5. Integration with `RuntimeState`
6. Unit tests for mapping algorithms

---

## Work Items

### P0: Define ContinuityState Types

**File**: `src/runtime/ContinuityState.ts` (NEW)

**Implementation**:
```typescript
/**
 * Continuity State Types
 *
 * Stores all state needed for smooth transitions across
 * domain changes and parameter edits (spec §5).
 */

import type { DomainInstance } from '../compiler/ir/types';

/**
 * Branded type for stable target identification.
 * Survives across recompiles unlike raw slot indices (spec §6.1).
 */
export type StableTargetId = string & { readonly __brand: 'StableTargetId' };

/**
 * Compute stable target ID from semantic information.
 * Per spec §6.1: stable derivation from semantic role + block + port.
 */
export function computeStableTargetId(
  semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
  instanceId: string,
  portName: string
): StableTargetId {
  return `${semantic}:${instanceId}:${portName}` as StableTargetId;
}

/**
 * Mapping from new element indices to old element indices (spec §3.3).
 * Used to transfer state when domain count changes.
 */
export type MappingState =
  | { readonly kind: 'identity'; readonly count: number }
  | { readonly kind: 'byId'; readonly newToOld: Int32Array }  // -1 = unmapped
  | { readonly kind: 'byPosition'; readonly newToOld: Int32Array };

/**
 * Per-target continuity buffers.
 */
export interface TargetContinuityState {
  /** Gauge offset buffer (Δ) - x_eff = x_base + Δ */
  gaugeBuffer: Float32Array;

  /** Slew state buffer (y) - current smoothed value */
  slewBuffer: Float32Array;

  /** Current element count */
  count: number;
}

/**
 * Complete continuity state for runtime (spec §5.1).
 */
export interface ContinuityState {
  /** Per-target continuity buffers, keyed by StableTargetId */
  targets: Map<StableTargetId, TargetContinuityState>;

  /** Current mapping state per instance */
  mappings: Map<string, MappingState>;

  /** Previous domain instances (for change detection) */
  prevDomains: Map<string, DomainInstance>;

  /** Last t_model_ms for slew delta computation */
  lastTModelMs: number;

  /** Flag indicating domain change occurred this frame */
  domainChangeThisFrame: boolean;
}

/**
 * Create initial continuity state.
 */
export function createContinuityState(): ContinuityState {
  return {
    targets: new Map(),
    mappings: new Map(),
    prevDomains: new Map(),
    lastTModelMs: 0,
    domainChangeThisFrame: false,
  };
}

/**
 * Get or create target continuity state.
 * Handles buffer reallocation when count changes.
 */
export function getOrCreateTargetState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  count: number
): TargetContinuityState {
  let state = continuity.targets.get(targetId);

  if (!state || state.count !== count) {
    // Allocate new buffers
    state = {
      gaugeBuffer: new Float32Array(count),
      slewBuffer: new Float32Array(count),
      count,
    };
    continuity.targets.set(targetId, state);
  }

  return state;
}
```

**Acceptance Criteria**:
- [ ] `StableTargetId` branded type defined
- [ ] `computeStableTargetId()` produces deterministic keys
- [ ] `MappingState` discriminated union complete
- [ ] `TargetContinuityState` interface defined
- [ ] `ContinuityState` interface defined
- [ ] `createContinuityState()` factory works
- [ ] `getOrCreateTargetState()` manages buffer lifecycle
- [ ] `npm run typecheck` passes

---

### P0: Implement Mapping Algorithms

**File**: `src/runtime/ContinuityMapping.ts` (NEW)

**Implementation**:
```typescript
/**
 * Continuity Mapping Module
 *
 * Implements the mapping algorithms from spec §3.3-3.5.
 * Computes how old elements map to new elements when domain changes.
 */

import type { DomainInstance } from '../compiler/ir/types';
import type { MappingState } from './ContinuityState';

/**
 * Build element mapping using stable IDs (spec §3.4).
 *
 * Algorithm:
 * 1. Build hash map: oldId → oldIndex
 * 2. For each new element, look up its ID in old map
 * 3. Result: newToOld[i] = oldIndex, or -1 if new element
 */
export function buildMappingById(
  oldDomain: DomainInstance,
  newDomain: DomainInstance
): MappingState {
  // Validate inputs
  if (oldDomain.identityMode !== 'stable' || newDomain.identityMode !== 'stable') {
    throw new Error('byId mapping requires stable identity mode');
  }

  // Fast path: identical domains
  if (oldDomain.count === newDomain.count &&
      arraysEqual(oldDomain.elementId, newDomain.elementId)) {
    return { kind: 'identity', count: newDomain.count };
  }

  // Build hash map: oldId → oldIndex
  const oldIdMap = new Map<number, number>();
  for (let i = 0; i < oldDomain.count; i++) {
    oldIdMap.set(oldDomain.elementId[i], i);
  }

  // Compute newToOld mapping
  const newToOld = new Int32Array(newDomain.count);
  for (let i = 0; i < newDomain.count; i++) {
    const oldIdx = oldIdMap.get(newDomain.elementId[i]);
    newToOld[i] = oldIdx !== undefined ? oldIdx : -1;
  }

  return { kind: 'byId', newToOld };
}

/**
 * Build element mapping using spatial position hints (spec §3.5).
 * Fallback when stable IDs are not available.
 *
 * Uses nearest-neighbor search with bounded radius.
 */
export function buildMappingByPosition(
  oldDomain: DomainInstance,
  newDomain: DomainInstance,
  maxSearchRadius: number = 0.1
): MappingState {
  if (!oldDomain.posHintXY || !newDomain.posHintXY) {
    throw new Error('byPosition mapping requires posHintXY');
  }

  const newToOld = new Int32Array(newDomain.count);
  const usedOld = new Set<number>();
  const maxRadiusSq = maxSearchRadius * maxSearchRadius;

  // For each new element, find nearest old element
  for (let i = 0; i < newDomain.count; i++) {
    const newX = newDomain.posHintXY[i * 2];
    const newY = newDomain.posHintXY[i * 2 + 1];

    let bestOldIdx = -1;
    let bestDistSq = maxRadiusSq;

    for (let j = 0; j < oldDomain.count; j++) {
      if (usedOld.has(j)) continue;

      const oldX = oldDomain.posHintXY[j * 2];
      const oldY = oldDomain.posHintXY[j * 2 + 1];
      const dx = newX - oldX;
      const dy = newY - oldY;
      const distSq = dx * dx + dy * dy;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestOldIdx = j;
      }
    }

    newToOld[i] = bestOldIdx;
    if (bestOldIdx >= 0) {
      usedOld.add(bestOldIdx);
    }
  }

  return { kind: 'byPosition', newToOld };
}

/**
 * Detect domain changes and compute mapping.
 * Called at hot-swap boundary, not every frame (spec §5.1).
 */
export function detectDomainChange(
  instanceId: string,
  newDomain: DomainInstance,
  prevDomains: Map<string, DomainInstance>
): { changed: boolean; mapping: MappingState | null } {
  const oldDomain = prevDomains.get(instanceId);

  // First time seeing this domain
  if (!oldDomain) {
    return { changed: true, mapping: null };
  }

  // Check for identity (fast path)
  if (oldDomain.count === newDomain.count &&
      oldDomain.identityMode === 'stable' &&
      newDomain.identityMode === 'stable' &&
      arraysEqual(oldDomain.elementId, newDomain.elementId)) {
    return {
      changed: false,
      mapping: { kind: 'identity', count: newDomain.count }
    };
  }

  // Compute appropriate mapping
  if (newDomain.identityMode === 'stable' && oldDomain.identityMode === 'stable') {
    const mapping = buildMappingById(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  if (newDomain.posHintXY && oldDomain.posHintXY) {
    const mapping = buildMappingByPosition(oldDomain, newDomain);
    return { changed: true, mapping };
  }

  // No mapping possible - crossfade fallback
  return { changed: true, mapping: null };
}

/**
 * Check if two Uint32Arrays are equal.
 */
function arraysEqual(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

**Acceptance Criteria**:
- [ ] `buildMappingById()` correctly maps old→new indices
- [ ] Identity mapping fast path works (same IDs)
- [ ] Unmapped elements (new) get -1
- [ ] `buildMappingByPosition()` works as fallback
- [ ] `detectDomainChange()` detects changes correctly
- [ ] Test: 10→11 maps 0-9 correctly, 10 is -1
- [ ] Test: 11→10 maps 0-9 correctly
- [ ] Test: Identity mapping when unchanged

---

### P1: Integrate with RuntimeState

**File**: `src/runtime/RuntimeState.ts`

**Changes**:
```typescript
import type { ContinuityState } from './ContinuityState';
import { createContinuityState } from './ContinuityState';

export interface RuntimeState {
  // ... existing fields ...

  /** Continuity state for smooth transitions */
  continuity: ContinuityState;
}

// In createRuntimeState():
export function createRuntimeState(...): RuntimeState {
  return {
    // ... existing ...
    continuity: createContinuityState(),
  };
}
```

**Acceptance Criteria**:
- [ ] `RuntimeState` includes `continuity` field
- [ ] `createRuntimeState()` initializes continuity state
- [ ] Existing runtime code continues to work

---

### P2: Unit Tests

**File**: `src/runtime/__tests__/ContinuityMapping.test.ts` (NEW)

**Test Cases**:
```typescript
describe('ContinuityMapping', () => {
  describe('buildMappingById', () => {
    it('maps 10→11 correctly (add one element)', () => {
      const old = createStableDomainInstance(10);
      const new_ = createStableDomainInstance(11);
      const mapping = buildMappingById(old, new_);

      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // 0-9 map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
        // 10 is new (unmapped)
        expect(mapping.newToOld[10]).toBe(-1);
      }
    });

    it('maps 11→10 correctly (remove one element)', () => {
      const old = createStableDomainInstance(11);
      const new_ = createStableDomainInstance(10);
      const mapping = buildMappingById(old, new_);

      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // 0-9 map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
      }
    });

    it('returns identity for unchanged domain', () => {
      const domain = createStableDomainInstance(10);
      const mapping = buildMappingById(domain, domain);
      expect(mapping.kind).toBe('identity');
      if (mapping.kind === 'identity') {
        expect(mapping.count).toBe(10);
      }
    });

    it('throws if either domain has identityMode="none"', () => {
      const stable = createStableDomainInstance(10);
      const unstable = createUnstableDomainInstance(10);
      expect(() => buildMappingById(stable, unstable)).toThrow();
      expect(() => buildMappingById(unstable, stable)).toThrow();
    });
  });

  describe('buildMappingByPosition', () => {
    it('maps by nearest neighbor', () => {
      const oldPos = new Float32Array([0, 0, 1, 1]); // 2 elements at (0,0) and (1,1)
      const newPos = new Float32Array([0.1, 0.1, 0.9, 0.9]); // Slightly offset

      const old: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPos,
      };
      const new_: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPos,
      };

      const mapping = buildMappingByPosition(old, new_, 0.5);
      expect(mapping.kind).toBe('byPosition');
      if (mapping.kind === 'byPosition') {
        expect(mapping.newToOld[0]).toBe(0); // (0.1,0.1) → (0,0)
        expect(mapping.newToOld[1]).toBe(1); // (0.9,0.9) → (1,1)
      }
    });

    it('returns -1 for elements outside search radius', () => {
      const oldPos = new Float32Array([0, 0]);
      const newPos = new Float32Array([10, 10]); // Far away

      const old: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPos,
      };
      const new_: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPos,
      };

      const mapping = buildMappingByPosition(old, new_, 0.5);
      if (mapping.kind === 'byPosition') {
        expect(mapping.newToOld[0]).toBe(-1);
      }
    });
  });

  describe('detectDomainChange', () => {
    it('returns changed=true for new domain', () => {
      const domain = createStableDomainInstance(10);
      const prevDomains = new Map();
      const result = detectDomainChange('inst1', domain, prevDomains);
      expect(result.changed).toBe(true);
      expect(result.mapping).toBeNull();
    });

    it('returns changed=false for identical domain', () => {
      const domain = createStableDomainInstance(10);
      const prevDomains = new Map([['inst1', domain]]);
      const result = detectDomainChange('inst1', domain, prevDomains);
      expect(result.changed).toBe(false);
      expect(result.mapping?.kind).toBe('identity');
    });
  });
});
```

**Acceptance Criteria**:
- [ ] All unit tests pass
- [ ] Edge cases covered (empty domains, large counts)
- [ ] `npm test` passes

---

## Dependencies

- **identity-foundation** - Requires `DomainInstance` type and `createStableDomainInstance()`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Mapping performance for large N | O(N) for byId (hash map), O(N²) for byPosition (acceptable for MVP) |
| Memory for large buffer counts | BufferPool (existing) handles allocation |
| Stale mappings | Clear mappings on hot-swap boundary |

---

## Technical Notes

### Spec References
- §3.3: MappingState types
- §3.4: byId mapping algorithm
- §3.5: byPosition fallback
- §5.1: Where continuity runs (StepContinuityMapBuild)
- §6.1: Stable target keys

### Design Decision: Int32Array for newToOld

Using `Int32Array` allows -1 sentinel for unmapped elements while supporting up to ~2 billion indices. This matches the Uint32 range for elementId.
