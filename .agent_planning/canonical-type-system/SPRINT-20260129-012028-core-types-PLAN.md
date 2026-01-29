# Sprint: core-types - Core Type System Reconstruction

**Generated**: 2026-01-29T01:20:28Z
**Confidence**: HIGH: 8, MEDIUM: 0, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ core/ids.ts in core (no compiler dependency) is correct layering
- ✓ Axis = var | inst pattern is right for inference vs resolved stages
- ✓ InstanceRef = { instanceId, domainTypeId } in core is correct
- ✓ Brand<K,T> as core primitive with "boring casts" factories
- **LOCKED**: BindingValue removes `referent` — referents go to continuity policies/StateOp args

---

## Sprint Goal

Replace the fundamentally broken `AxisTag<T>` system with the spec-compliant `Axis<T, V>` system that supports type variables for polymorphism and unification.

---

## Scope

**Deliverables:**
1. Rewrite Axis type to support type variables
2. Add all 5 per-axis type aliases
3. Fix InstanceRef to use branded IDs
4. Fix PerspectiveValue and BranchValue to be discriminated unions
5. Remove extra `referent` from BindingValue (or align with spec)

---

## Work Items

### P0: Replace AxisTag with Axis<T, V>

**Confidence**: HIGH

**Current state** (`canonical-types.ts` lines 401-403):
```typescript
export type AxisTag<T> =
  | { readonly kind: 'default' }
  | { readonly kind: 'instantiated'; readonly value: T };
```

**Target state** (from spec lines 65-67):
```typescript
export type Axis<T, V> =
    | { readonly kind: 'var'; readonly var: V }
    | { readonly kind: 'inst'; readonly value: T };
```

**Acceptance Criteria:**
- [ ] `Axis<T, V>` type defined with `var` and `inst` discriminants
- [ ] `axisVar<T, V>(v: V): Axis<T, V>` factory function
- [ ] `axisInst<T, V>(value: T): Axis<T, V>` factory function  
- [ ] `isAxisVar(a: Axis<T, V>)` type guard
- [ ] `isAxisInst(a: Axis<T, V>)` type guard
- [ ] Delete old `AxisTag`, `axisDefault`, `axisInstantiated`, `isInstantiated`, `getAxisValue`

**Technical Notes:**
- This is a breaking change that will cause cascading type errors
- Must update all call sites from `axisDefault()` to `axisInst(defaultValue)` or `axisVar(varId)`
- The `default` concept disappears — defaults are instantiated values or variables

---

### P1: Add Per-Axis Type Aliases

**Confidence**: HIGH

**Target state** (from spec lines 69-73):
```typescript
export type CardinalityAxis   = Axis<CardinalityValue, CardinalityVarId>;
export type TemporalityAxis   = Axis<TemporalityValue, TemporalityVarId>;
export type BindingAxis       = Axis<BindingValue, BindingVarId>;
export type PerspectiveAxis   = Axis<PerspectiveValue, PerspectiveVarId>;
export type BranchAxis        = Axis<BranchValue, BranchVarId>;
```

**Acceptance Criteria:**
- [ ] All 5 type aliases exist in `canonical-types.ts`
- [ ] `Extent` interface uses these aliases instead of raw `AxisTag<T>`
- [ ] VarId types imported from `core/ids.ts`

**Technical Notes:**
- `core/ids.ts` already has the VarId types (verified)
- Just need to add the aliases and update Extent

---

### P2: Fix InstanceRef to Use Branded IDs

**Confidence**: HIGH

**Current state** (`canonical-types.ts` lines 441-445):
```typescript
export interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: string;   // plain string!
  readonly instanceId: string;   // plain string!
}
```

**Target state** (from spec lines 79-82):
```typescript
export interface InstanceRef {
  readonly instanceId: InstanceId;      // branded
  readonly domainTypeId: DomainTypeId;  // branded
}
```

**Acceptance Criteria:**
- [ ] `InstanceRef.instanceId` is type `InstanceId` (branded)
- [ ] `InstanceRef.domainTypeId` is type `DomainTypeId` (branded)
- [ ] No `kind` field (remove discriminator)
- [ ] `instanceRef()` factory updated to accept branded IDs
- [ ] All call sites updated

**Technical Notes:**
- Import `InstanceId`, `DomainTypeId` from `core/ids.ts`
- This will cause type errors at call sites passing plain strings

---

### P3: Fix PerspectiveValue and BranchValue

**Confidence**: HIGH

**Current state**:
```typescript
export type PerspectiveId = string;
export type BranchId = string;
```

**Target state** (from spec lines 103-107):
```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' };

export type BranchValue =
  | { readonly kind: 'default' };
```

**Acceptance Criteria:**
- [ ] `PerspectiveValue` is discriminated union with `{ kind: 'default' }`
- [ ] `BranchValue` is discriminated union with `{ kind: 'default' }`
- [ ] Extent uses `PerspectiveAxis` and `BranchAxis` (which use these values)
- [ ] Delete old `PerspectiveId` and `BranchId` type aliases

**Technical Notes:**
- These are placeholder values for v0
- Future versions will add more kinds (e.g., specific perspectives, branches)

---

### P4: Align BindingValue with Spec

**Confidence**: HIGH

**DECISION LOCKED**: Remove `referent` from BindingValue.

**Rationale** (from user review):
> Binding axis must not carry "referent"-like data. Keep BindingValue as a closed semantic set (unbound/weak/strong/identity), and keep "what is it bound to?" out of CanonicalType. Referents belong in:
> - continuity policies / state mapping config, or
> - specific ops (e.g., StateOp args), not in the type lattice.

**Current state** (`canonical-types.ts` lines 554-558):
```typescript
export type Binding =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak'; readonly referent: ReferentRef }
  | { readonly kind: 'strong'; readonly referent: ReferentRef }
  | { readonly kind: 'identity'; readonly referent: ReferentRef };
```

**Target state** (spec lines 97-101):
```typescript
export type BindingValue =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak' }
  | { readonly kind: 'strong' }
  | { readonly kind: 'identity' };
```

**Acceptance Criteria:**
- [x] Decision confirmed: REMOVE referent
- [ ] Remove `referent` field from weak/strong/identity variants
- [ ] Rename `Binding` to `BindingValue` for consistency
- [ ] Move referent handling to continuity policies / StateOp args

---

### P5: Update Extent Interface

**Confidence**: HIGH

**Target state** (from spec lines 113-119):
```typescript
export interface Extent {
    readonly cardinality: CardinalityAxis;
    readonly temporality: TemporalityAxis;
    readonly binding: BindingAxis;
    readonly perspective: PerspectiveAxis;
    readonly branch: BranchAxis;
}
```

**Acceptance Criteria:**
- [ ] Extent uses typed axis aliases
- [ ] All 5 axes present with correct types

---

### P6: Add Default Constants

**Confidence**: HIGH

**Target state** (from spec lines 169-171):
```typescript
const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };
const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };
const DEFAULT_BRANCH: BranchValue = { kind: 'default' };
```

**Acceptance Criteria:**
- [ ] `DEFAULT_BINDING` constant exists
- [ ] `DEFAULT_PERSPECTIVE` constant exists
- [ ] `DEFAULT_BRANCH` constant exists
- [ ] Delete or deprecate `DEFAULTS_V0` object

---

### P7: Add axisInst Helper

**Confidence**: HIGH

The spec uses `axisInst()` throughout constructors.

**Acceptance Criteria:**
- [ ] `axisInst<T, V>(value: T): Axis<T, V>` exists
- [ ] All canonical constructors use it

---

## Dependencies

- None (this is foundational)

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking changes cascade widely | Run `pnpm typecheck` after each P-item, fix errors before proceeding |
| BindingValue `referent` question | Ask user before implementing P4 |
| Existing tests may fail | Update tests as part of each P-item |

---

## Files to Modify

- `src/core/canonical-types.ts` — Primary target
- All files that import from `canonical-types.ts` — Call site updates
