# Sprint: adapter-spec - Adapter Spec Restructure

**Generated**: 2026-01-29T01:24:00Z
**Confidence**: HIGH: 1, MEDIUM: 2, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ Keeping adapter metadata on BlockDef (not separate registry) is consistent
- ✓ Spec/impl separation heading the right way
- **LOCKED**: Adapter matching operates purely on CanonicalType patterns
- **LOCKED**: Adapters are pure + stable (no time/state dependence)
- **LOCKED**: Extent transforms limited and explicit

---

## Sprint Goal

Restructure adapter specification types to match spec: add `ExtentPattern`, `ExtentTransform`, `TypePattern`, and proper `AdapterSpec` with purity/stability fields.

---

## Scope

**Deliverables:**
1. Create `src/blocks/adapter-spec.ts` (or update existing location)
2. Add ExtentPattern, ExtentTransform, TypePattern types
3. Update AdapterSpec with from/to/purity/stability
4. Migrate existing adapter rules

---

## Work Items

### P0: Assess Current Adapter System

**Confidence**: MEDIUM

#### Unknowns to Resolve:
- Should adapters stay in `src/graph/adapters.ts` or move to `src/blocks/adapter-spec.ts`?
- How does the existing `AdapterRule` + `AdapterSpec` pattern map to the spec?

**Current** (`src/graph/adapters.ts`):
```typescript
export interface AdapterSpec {
  readonly blockType: string;
  readonly inputPortId: string;
  readonly outputPortId: string;
  readonly description: string;
}

export interface TypeSignature {
  readonly payload: PayloadType | 'any';
  readonly unit: Unit | 'any';
  readonly cardinality: 'zero' | 'one' | 'many' | 'any';
  readonly temporality: 'continuous' | 'discrete' | 'any';
}

export interface AdapterRule {
  readonly from: TypeSignature;
  readonly to: TypeSignature;
  readonly adapter: AdapterSpec;
}
```

**Spec** (`src/blocks/adapter-spec.ts`):
```typescript
export type ExtentPattern =
  | 'any'
  | Partial<{ [K in keyof Extent]: Extent[K] }>;

export type ExtentTransform =
  | 'preserve'
  | Partial<{ [K in keyof Extent]: Extent[K] }>;

export interface TypePattern {
  readonly payload: PayloadType | 'same';
  readonly unit: UnitType | 'same';
  readonly extent: ExtentPattern;
}

export interface AdapterSpec {
  readonly from: TypePattern;
  readonly to: {
    readonly payload: PayloadType | 'same';
    readonly unit: UnitType | 'same';
    readonly extent: ExtentTransform;
  };
  readonly purity: 'pure';
  readonly stability: 'stable';
}
```

#### Exit Criteria:
- Decision on file location
- Mapping between current and spec structures

**Acceptance Criteria:**
- [ ] Location decision made
- [ ] Migration plan documented

---

### P1: Add New Types

**Confidence**: HIGH

**Acceptance Criteria:**
- [ ] `ExtentPattern` type exists
- [ ] `ExtentTransform` type exists
- [ ] `TypePattern` interface exists with `extent` (not flattened cardinality/temporality)

---

### P2: Update AdapterSpec

**Confidence**: HIGH (decision locked)

**DECISION LOCKED**: Adapter matching operates purely on CanonicalType patterns with explicit constraints.

**Rationale** (from user review):
> Make adapter matching operate purely on CanonicalType patterns (payload/unit/extent), and ensure:
> - adapters are pure + stable (no time/state dependence)
> - extent transforms are limited and explicit (e.g. Broadcast: one→many(instance), everything else preserve)
> - float→phase01 wrapping adapters are treated as adapters but still type-safe via unit change + documented semantics

**Target**:
```typescript
export interface AdapterSpec {
  // Pattern matching (pure CanonicalType patterns)
  readonly from: TypePattern;
  readonly to: {
    readonly payload: PayloadType | 'same';
    readonly unit: UnitType | 'same';
    readonly extent: ExtentTransform;
  };
  
  // Adapter guarantees (mandatory)
  readonly purity: 'pure';      // no side effects
  readonly stability: 'stable'; // deterministic, no time/state dependence
  
  // Implementation (for block insertion)
  readonly blockType: string;
  readonly inputPortId: string;
  readonly outputPortId: string;
}

/**
 * Extent transforms are LIMITED and EXPLICIT.
 * Most adapters preserve extent. Only specific adapters change it.
 */
export type ExtentTransform =
  | 'preserve'                                          // Most adapters
  | { readonly cardinality: 'broadcast' }               // one → many(instance)
  | { readonly cardinality: 'reduce', op: ReduceOp };   // many → one

export type ReduceOp = 'sum' | 'avg' | 'min' | 'max';
```

**Acceptance Criteria:**
- [ ] AdapterSpec has `from`, `to`, `purity`, `stability`
- [ ] `purity: 'pure'` and `stability: 'stable'` are mandatory
- [ ] ExtentTransform is limited to: preserve, broadcast, reduce
- [ ] float→phase01 wrapping is type-safe via unit change

---

## Dependencies

- **core-types** — Need Extent type
- **unit-restructure** — Need UnitType

## Risks

| Risk | Mitigation |
|------|------------|
| Adapter system may break | Careful migration |
| TypeSignature vs TypePattern | May need to keep both temporarily |

---

## Files to Modify

- `src/blocks/adapter-spec.ts` — CREATE or `src/graph/adapters.ts` — MODIFY
