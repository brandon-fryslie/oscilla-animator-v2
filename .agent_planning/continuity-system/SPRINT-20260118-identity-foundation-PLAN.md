# Sprint: identity-foundation - Domain Identity Infrastructure

> **Generated**: 2026-01-18
> **Confidence**: HIGH
> **Status**: READY FOR IMPLEMENTATION

---

## Sprint Goal

Establish the foundational type system and identity generation infrastructure for the Continuity System, enabling stable element IDs that persist across domain count changes.

---

## Scope

### Deliverables
1. `DomainInstance` type with `elementId`, `identityMode`, and `posHintXY`
2. Extended `InstanceDecl` with `identityMode` field
3. `DomainIdentity` module with ID generation functions
4. Array block integration to set `identityMode: 'stable'`
5. IRBuilder update to support identity mode

---

## Work Items

### P0: Define Core Types

**File**: `src/compiler/ir/types.ts`

**Changes**:
```typescript
// Add to Instance System section

/**
 * Gauge specification for continuity (spec §2.4).
 */
export type GaugeSpec =
  | { readonly kind: 'add' }           // x_eff = x_base + Δ
  | { readonly kind: 'mul' }           // x_eff = x_base * Δ
  | { readonly kind: 'affine' }        // x_eff = a*x_base + b
  | { readonly kind: 'phaseOffset01' }; // Wrap-aware for phase

/**
 * Continuity policy for a field target (spec §2.2).
 */
export type ContinuityPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'preserve'; readonly gauge: GaugeSpec }
  | { readonly kind: 'slew'; readonly gauge: GaugeSpec; readonly tauMs: number }
  | { readonly kind: 'crossfade'; readonly windowMs: number; readonly curve: 'linear' | 'smoothstep' | 'ease-in-out' }
  | { readonly kind: 'project'; readonly projector: 'byId' | 'byPosition'; readonly post: 'slew'; readonly tauMs: number };

/**
 * Runtime domain instance with identity information (spec §3.1).
 */
export interface DomainInstance {
  readonly count: number;
  readonly elementId: Uint32Array;
  readonly identityMode: 'stable' | 'none';
  readonly posHintXY?: Float32Array;
}

// Update existing InstanceDecl
export interface InstanceDecl {
  readonly id: string; // InstanceId
  readonly domainType: string; // DomainTypeId
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
  // NEW: Identity specification
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number;
}
```

**Acceptance Criteria**:
- [ ] `DomainInstance` interface defined with all fields from spec §3.1
- [ ] `GaugeSpec` discriminated union defined per spec §2.4
- [ ] `ContinuityPolicy` discriminated union defined per spec §2.2
- [ ] `InstanceDecl` extended with `identityMode` and optional `elementIdSeed`
- [ ] `npm run typecheck` passes

---

### P0: Create DomainIdentity Module

**File**: `src/runtime/DomainIdentity.ts` (NEW)

**Implementation**:
```typescript
/**
 * Domain Identity Module
 *
 * Generates and manages stable element IDs for domain instances.
 * Per spec §3.1-3.2: elementIds are stable across edits that preserve
 * the conceptual element set.
 */

import type { DomainInstance } from '../compiler/ir/types';

/**
 * Generate deterministic element IDs for a domain (spec §3.2).
 * IDs are monotonic integers starting from seed.
 *
 * @param count - Number of elements
 * @param seed - Starting ID (default 0)
 * @returns Uint32Array of stable element IDs
 */
export function generateElementIds(
  count: number,
  seed: number = 0
): Uint32Array {
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = seed + i;
  }
  return ids;
}

/**
 * Create a DomainInstance with stable identity (spec §3.1).
 */
export function createStableDomainInstance(
  count: number,
  seed: number = 0,
  posHintXY?: Float32Array
): DomainInstance {
  return {
    count,
    elementId: generateElementIds(count, seed),
    identityMode: 'stable',
    posHintXY,
  };
}

/**
 * Create a DomainInstance without identity tracking.
 * Continuity will fall back to crossfade (spec §3.7).
 */
export function createUnstableDomainInstance(
  count: number
): DomainInstance {
  return {
    count,
    elementId: new Uint32Array(0),
    identityMode: 'none',
  };
}
```

**Acceptance Criteria**:
- [ ] `generateElementIds()` produces deterministic IDs
- [ ] IDs 0-9 remain stable when generating IDs for count 10 then count 11
- [ ] `createStableDomainInstance()` creates proper DomainInstance
- [ ] `createUnstableDomainInstance()` creates proper fallback
- [ ] Module exports are clean and typed

---

### P1: Update IRBuilder

**File**: `src/compiler/ir/IRBuilder.ts`

**Changes**:
- Add `identityMode` parameter to `createInstance()` method
- Default to `'stable'` for backwards compatibility

**Acceptance Criteria**:
- [ ] `createInstance()` accepts optional `identityMode` parameter
- [ ] Default value is `'stable'` (spec default)
- [ ] Existing callers continue to work without changes

---

### P1: Update Array Block

**File**: `src/blocks/array.ts` (or equivalent)

**Changes**:
- When creating instance via IRBuilder, explicitly set `identityMode: 'stable'`

**Acceptance Criteria**:
- [ ] Array block produces instances with `identityMode: 'stable'`
- [ ] Integration test: compile patch with Array → verify InstanceDecl has identityMode

---

### P2: Unit Tests

**File**: `src/runtime/__tests__/DomainIdentity.test.ts` (NEW)

**Test Cases**:
```typescript
describe('DomainIdentity', () => {
  describe('generateElementIds', () => {
    it('generates deterministic IDs starting from 0', () => {
      const ids = generateElementIds(10);
      expect(ids).toEqual(new Uint32Array([0,1,2,3,4,5,6,7,8,9]));
    });

    it('respects seed parameter', () => {
      const ids = generateElementIds(5, 100);
      expect(ids).toEqual(new Uint32Array([100,101,102,103,104]));
    });

    it('handles empty count', () => {
      const ids = generateElementIds(0);
      expect(ids.length).toBe(0);
    });
  });

  describe('createStableDomainInstance', () => {
    it('creates instance with stable identity', () => {
      const inst = createStableDomainInstance(10);
      expect(inst.identityMode).toBe('stable');
      expect(inst.count).toBe(10);
      expect(inst.elementId.length).toBe(10);
    });

    it('includes position hints when provided', () => {
      const posHints = new Float32Array([0, 0, 1, 1]);
      const inst = createStableDomainInstance(2, 0, posHints);
      expect(inst.posHintXY).toBe(posHints);
    });
  });

  describe('createUnstableDomainInstance', () => {
    it('creates instance without identity', () => {
      const inst = createUnstableDomainInstance(10);
      expect(inst.identityMode).toBe('none');
      expect(inst.elementId.length).toBe(0);
    });
  });
});
```

**Acceptance Criteria**:
- [ ] All unit tests pass
- [ ] Test coverage for edge cases (empty arrays, large counts)
- [ ] `npm test` passes

---

## Dependencies

- None (this is the foundation sprint)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Type changes break existing code | InstanceDecl extension uses optional field with default |
| Large element counts | Uint32Array handles up to ~4 billion elements |
| Performance of ID generation | O(n) simple loop, no optimization needed for MVP |

---

## Technical Notes

### Spec References
- §3.1: DomainInstance type and contract
- §3.2: ElementId semantics (stable across edits)
- §2.4: GaugeSpec types

### Design Decision: Array Block as Primary Identity Source

The Array block is the cardinality transform (Signal → Field). It creates instances and is the natural place to establish element identity. Primitive blocks create single elements with cardinality `one`, so they don't need element IDs (only one element).

### Invariant Enforcement

This sprint enforces:
- **I11**: Stable element identity - instances provide stable element IDs
- **I30**: Continuity is deterministic - ID generation is seeded and deterministic
