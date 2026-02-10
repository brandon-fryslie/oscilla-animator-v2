# Session Recap: DefaultSource Cardinality Bug & Type Variable Solution
**Date**: 2026-02-03
**Context**: RenderInstances2D default sources not appearing

---

## Current Task: Implement Cardinality Type Variables

### Problem Identified
The `DefaultSource` block (src/blocks/signal/default-source.ts) cannot provide field outputs because the type system doesn't support cardinality type variables.

**Root Cause**:
- RenderInstances2D.pos/color require fields (cardinality: many)
- DefaultSource has no inputs, so can't "preserve" cardinality
- InferenceCanonicalType uses concrete `Extent` - cardinality is always `axisInst()`, never `axisVar()`
- Without cardinality type variables, blocks must check cardinality at lowering time
- **Checking cardinality in lower functions is FORBIDDEN** (violates cardinality neutrality principle)

**Concrete Example**:
- RenderInstances2D.pos expects: field (cardinality: many)
- DefaultSource currently declares output as: `canonicalType(FLOAT)` with `axisInst({ kind: 'one' })`
- Type inference cannot unify cardinality because it's concrete, not a variable
- Result: Cardinality mismatch, default source incompatible

### Key Architectural Principle
**Lower functions MUST be cardinality neutral** - they should NOT check or handle cardinality themselves. Cardinality should be resolved during type inference, and by lowering time, it should already be concrete.

---

## The ONLY Correct Solution: Cardinality Type Variables

### What Needs to Be Implemented

#### 1. Create InferenceExtent Type
**File**: src/core/inference-types.ts (new)

```typescript
export interface InferenceExtent {
  cardinality: Axis<CardinalityValue, CardinalityVarId>;  // CAN BE VAR!
  temporality: Axis<TemporalityValue, TemporalityVarId>;
  binding: Axis<BindingValue, BindingVarId>;
  perspective: Axis<PerspectiveValue, PerspectiveVarId>;
  branch: Axis<BranchValue, BranchVarId>;
}
```

#### 2. Update InferenceCanonicalType
**File**: src/core/inference-types.ts (lines 79-84)

```typescript
export interface InferenceCanonicalType {
  readonly payload: InferencePayloadType;  // Can be var
  readonly unit: InferenceUnitType;        // Can be var
  readonly extent: InferenceExtent;        // NEW: Can have axis vars
  readonly contract?: ValueContract;
}
```

#### 3. Add Cardinality Variable Constructor
**File**: src/core/inference-types.ts (new)

```typescript
let cardinalityVarCounter = 0;
export function inferCardinalityVar(id?: string): CardinalityVarId {
  return cardinalityVarId(id ?? `_cv${cardinalityVarCounter++}`);
}
```

#### 4. Update DefaultSource Block Definition
**File**: src/blocks/signal/default-source.ts (lines 44-52)

```typescript
outputs: {
  out: {
    label: 'Output',
    type: inferType(
      payloadVar(),
      unitVar(),
      { cardinality: axisVar(inferCardinalityVar()) },  // CARDINALITY VAR!
    ),
  },
}
```

#### 5. Extend Type Inference to Unify Cardinality
**Files**: src/compiler/frontend/type-inference/* (multiple passes)

Type inference needs to:
- Collect cardinality constraints from edges
- Unify cardinality variables like payload/unit
- Resolve to concrete cardinality (one/many/zero)
- Handle instance reference propagation for 'many' cardinality

#### 6. Update Substitution and Finalization
**File**: src/core/inference-types.ts (lines 141-182)

```typescript
export interface Substitution {
  readonly payloads: ReadonlyMap<string, PayloadType>;
  readonly units: ReadonlyMap<string, UnitType>;
  readonly cardinalities: ReadonlyMap<string, CardinalityValue>;  // NEW
  // ... other axes
}

export function finalizeInferenceType(
  t: InferenceCanonicalType,
  subst: Substitution
): CanonicalType {
  // ... existing payload/unit resolution

  // NEW: Resolve all axes in extent
  const extent: Extent = {
    cardinality: resolveAxis(t.extent.cardinality, subst.cardinalities),
    temporality: resolveAxis(t.extent.temporality, subst.temporalities),
    // ... other axes
  };

  return { payload, unit, extent, contract: t.contract };
}
```

---

## Implementation Checklist

### Phase 1: Type System Foundation
- [ ] Create `InferenceExtent` interface with axis vars
- [ ] Update `InferenceCanonicalType.extent` to use `InferenceExtent`
- [ ] Add cardinality var constructor: `inferCardinalityVar()`
- [ ] Add helper: `inferTypeWithCardinalityVar(payload, unit, cardinalityVar)`
- [ ] Update `Substitution` interface to include axis substitutions
- [ ] Implement `resolveAxis()` helper for finalization
- [ ] Update `finalizeInferenceType()` to resolve all axes

### Phase 2: Type Inference Extension
- [ ] Extend constraint collection to handle cardinality vars
- [ ] Implement cardinality unification algorithm
- [ ] Handle instance reference propagation (many cardinality needs InstanceRef)
- [ ] Add cardinality constraint validation
- [ ] Update type solver to resolve cardinality vars

### Phase 3: Block Migration
- [ ] Update DefaultSource to use cardinality var
- [ ] Update other cardinality-generic blocks (Add, math ops, etc.)
- [ ] Remove any cardinality checks from lower functions (FORBIDDEN)
- [ ] Test that blocks are truly cardinality neutral

### Phase 4: Testing & Validation
- [ ] Add type inference tests for cardinality unification
- [ ] Test DefaultSource with field outputs (RenderInstances2D case)
- [ ] Verify no lower functions check cardinality
- [ ] Run full test suite

---

## Key Files to Modify

### Core Type System
- **src/core/inference-types.ts** - Add InferenceExtent, cardinality vars
- **src/core/ids.ts** - CardinalityVarId factory (may already exist)
- **src/core/canonical-types/axis.ts** - Infrastructure exists (axisVar)
- **src/core/canonical-types/cardinality.ts** - CardinalityVarId type exists

### Type Inference
- **src/compiler/frontend/pass1-type-constraints.ts** - Collect cardinality constraints
- **src/compiler/frontend/pass2-types.ts** - Unify cardinality vars
- Related constraint/solver files in frontend/

### Block Definitions
- **src/blocks/signal/default-source.ts** - Use cardinality var
- **src/blocks/math/*.ts** - Cardinality-generic blocks
- **src/blocks/registry.ts** - May need BlockDef type updates

### Infrastructure Already Exists
- **src/core/canonical-types/axis.ts:25-26** - `axisVar()` constructor
- **src/core/canonical-types/cardinality.ts:23** - `Cardinality = Axis<..., CardinalityVarId>`

---

## Architectural Invariants (CRITICAL)

From .claude/rules/TYPE-SYSTEM-INVARANTS.md:

### PRIMARY CONSTRAINT: Single Authority
Every concept has exactly one authoritative representation. Cardinality is determined by:
1. **Type inference** (ONLY authority for resolving cardinality vars)
2. **Not** by lower functions checking at runtime
3. **Not** by blocks dispatching on cardinality

### Derived Kind Must Be Total and Deterministic
- DO NOT special-case signal/field/event based on node classes or codepaths
- Instead: all dispatch uses `deriveKind(type)` which checks extent axes
- Lower functions MUST NOT check cardinality - it violates neutrality

### Axis Shape Contracts Are Non-Negotiable
- Signal = cardinality one + continuous temporality
- Field = cardinality many + continuous temporality
- Event = cardinality one + discrete temporality
- These are enforced via type system, not runtime checks

---

## Why Checking Cardinality is FORBIDDEN

**Violation of Architectural Law**: Cardinality neutrality principle states that lower functions should work the same way regardless of cardinality.

**Correct Pattern**:
1. Block declares output type with cardinality var
2. Type inference unifies cardinality based on connections
3. By lowering time, cardinality is concrete
4. Lower function produces ValueExprId without checking cardinality
5. **Orchestrator** handles signal↔field conversion if needed (broadcast, reduce, etc.)

**Forbidden Pattern** (what we almost did):
1. Block declares concrete cardinality
2. Lower function checks `outType.extent.cardinality`
3. Lower function dispatches different logic for signal vs field
4. ❌ Violates cardinality neutrality
5. ❌ Forces every cardinality-generic block to implement this logic

---

## Deferred Work (No Change)

### From Beads Ready Work
- **[oscilla-animator-v2-3kh6]** - Add Shape payload kind to type system (P1)
- **[oscilla-animator-v2-crio]** - Fix validateConnection incorrectness (P1)
- **[oscilla-animator-v2-73lv]** - Zero-cardinality enforcement (P1)

### Pure Lowering Migration
- **132 `ctx.b.allocSlot()` calls** across 80 block files still need migration
- Most blocks still allocate slots directly (not using effects-as-data)

### DefaultSource Semantic Dispatch
Once cardinality vars work, still need:
- Port-aware defaults (pos→vec3(0,0,0), color→rainbow, radius→float(1.0))
- Pass port context via params in normalize-default-sources.ts

---

## Test Status

### Expected State After Implementation
- All existing tests should pass (if cardinality was previously concrete)
- New tests needed for cardinality type variable unification
- RenderInstances2D tests with unconnected pos/color should work

### Tests to Add
- Cardinality var unification in type inference
- DefaultSource producing field outputs
- Cardinality-generic blocks working with both signals and fields
- Instance reference propagation for 'many' cardinality

---

## Critical Success Criteria

**Implementation is ONLY complete when:**
1. ✅ Cardinality type variables exist and can be declared in block definitions
2. ✅ Type inference successfully unifies cardinality vars
3. ✅ DefaultSource uses cardinality var and works with both signal/field targets
4. ✅ **ZERO lower functions check cardinality** (grep confirms this)
5. ✅ All tests pass
6. ✅ RenderInstances2D with unconnected pos/color works (field defaults)

**Failure modes to avoid:**
- ❌ Adding cardinality checks to lower functions ("quick fix")
- ❌ Special-casing DefaultSource in orchestrator
- ❌ Making cardinality vars "optional" or allowing concrete fallback
- ❌ Partial implementation (some axes as vars, others concrete)

---

## Next Agent Instructions

**DO NOT** fix the DefaultSource bug by adding cardinality checks to the lower function. That is architecturally forbidden and will be rejected.

**DO** implement cardinality type variables as the ONLY correct solution. This is a type system enhancement that will benefit all cardinality-generic blocks, not just DefaultSource.

Start with Phase 1 (Type System Foundation) and work through the checklist systematically.
