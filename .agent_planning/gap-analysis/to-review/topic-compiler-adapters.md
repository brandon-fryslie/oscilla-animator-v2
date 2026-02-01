# To Review: Compiler Passes & Adapter System

**Audit Date**: 2026-02-01

## Items Needing Architectural Review

### 1. Cardinality Polymorphism Strategy

**Current Implementation**:
- Blocks like `Add`, `Mul`, `Expression` are cardinality-generic
- They accept both signal (cardinality=one) and field (cardinality=many) inputs
- Type compatibility has special cases for cardinality-generic blocks
- Runtime dispatch based on input cardinality

**Question**: Should cardinality be a compile-time polymorphic type variable?

**Option A: Type Variables (Recommended)**
```typescript
// Block definition declares polymorphic type
inputs: {
  a: { type: { payload: float, unit: scalar, extent: { cardinality: CardinalityVar('C') } } },
  b: { type: { payload: float, unit: scalar, extent: { cardinality: CardinalityVar('C') } } },
}
outputs: {
  result: { type: { payload: float, unit: scalar, extent: { cardinality: CardinalityVar('C') } } }
}

// Type solver resolves 'C' based on inputs
// If a=signal (one) and b=signal (one), then result=signal (one)
// If a=field (many(X)) and b=field (many(X)), then result=field (many(X))
// If a=signal and b=field, insert Broadcast adapter
```

**Option B: Runtime Dispatch (Current)**
```typescript
// Block declares static type (signal)
inputs: {
  a: { type: { payload: float, unit: scalar, extent: { cardinality: one } } },
  b: { type: { payload: float, unit: scalar, extent: { cardinality: one } } },
}

// Type compatibility makes exception for cardinality-generic blocks
if (targetBlockType && isCardinalityGeneric(targetBlockType)) {
  return true; // Allow mismatch
}

// Runtime checks input cardinality and dispatches to kernel
if (isMany(input.type)) {
  return kernelMap(...);
} else {
  return kernelScalar(...);
}
```

**Pros/Cons**:
- **Option A**: Compile-time safety, pure type checking, explicit adapters
- **Option B**: Runtime flexibility, simpler block definitions, hidden complexity

**Recommendation**: Move to Option A (type variables)
- Aligns with spec requirement for pure type compatibility
- Makes cardinality mismatches explicit (insert Broadcast adapter)
- Removes block-name exceptions from isTypeCompatible
- Better error messages (user sees where Broadcast is needed)

---

### 2. Instance Propagation vs Type Inference

**Current Implementation**:
- Frontend type solver produces `portTypes` with placeholder instance IDs
- Backend lowering infers instance context from upstream blocks
- Backend rewrites types with actual instance IDs
- Creates two authorities: frontend types (placeholder) vs backend types (actual)

**Question**: Should instance resolution happen in frontend type inference?

**Option A: Frontend Instance Resolution (Recommended)**
```typescript
// Pass 1: Type Constraints + Instance Inference
// Solve instance vars along with unit/payload vars
const instanceVars = new UnionFind<InstanceId>();

// Example constraint: Field output must have same instance as instance block
unify(fieldOutput.extent.cardinality.instance, instanceBlock.instanceId);

// Output: portTypes with fully resolved instance IDs
TypeResolvedPatch { portTypes: Map<PortKey, CanonicalType> }
// Where CanonicalType includes concrete instance IDs

// Pass 6: Backend Lowering
// Just reads portTypes, never modifies
const outTypes = portTypes.get(portKey(blockIndex, portName, 'out'));
```

**Option B: Backend Instance Propagation (Current)**
```typescript
// Pass 1: Type Constraints
// Produces portTypes with placeholder instance IDs
// Instance resolution deferred to backend

// Pass 6: Backend Lowering
// Infers instance from upstream blocks
const inferredInstance = inferInstanceContext(blockIndex, edges, instanceContextByBlock);
// Rewrites types with actual instance
outTypes = outTypes.map(t => withInstance(t, inferredInstance));
```

**Pros/Cons**:
- **Option A**: Single type authority (frontend), backend read-only, cleaner boundary
- **Option B**: Deferred instance resolution, more runtime flexibility, complex data flow

**Recommendation**: Move to Option A (frontend instance resolution)
- Aligns with spec requirement for authoritative type solver
- Backend becomes pure consumer of types
- Simplifies lowering (no type rewriting)
- Better error messages (instance errors reported in frontend)

---

### 3. Cardinality-Preserving Blocks

**Current Implementation**:
- Blocks like `Lag`, `Slew` are cardinality-preserving
- They output the same cardinality as their input
- Type compatibility has special case: allows signal→field if source is cardinality-preserving
- Runtime adapts output based on input

**Question**: Should cardinality-preserving be encoded in types?

**Option A: Polymorphic Output Type (Recommended)**
```typescript
// Block declares output cardinality = input cardinality
inputs: {
  input: { type: { payload: float, unit: scalar, extent: { cardinality: CardinalityVar('C') } } }
}
outputs: {
  output: { type: { payload: float, unit: scalar, extent: { cardinality: CardinalityVar('C') } } }
}

// Type solver propagates cardinality from input to output
// No special case in isTypeCompatible
```

**Option B: Runtime Adaptation (Current)**
```typescript
// Block declares static output type (signal)
outputs: {
  output: { type: { payload: float, unit: scalar, extent: { cardinality: one } } }
}

// Type compatibility makes exception
if (sourceBlockType && getBlockCardinalityMetadata(sourceBlockType)?.cardinalityMode === 'preserve') {
  return true; // Allow one→many
}

// Runtime checks input and adapts output
if (isMany(input.type)) {
  return { type: withCardinality(output.type, many(instanceId)) };
}
```

**Recommendation**: Move to Option A (polymorphic types)
- Same rationale as cardinality-generic blocks
- Removes block-name exceptions
- Makes output type deterministic from inputs
- Simpler runtime (no dynamic type changes)

---

### 4. Adapter Insertion Permanence

**Current Code Comments**:
```typescript
/**
 * PHASE 2: Auto-insertion (Backwards Compatibility)
 *
 * NOTE: Sprint 2 is transitional. Eventually, users will add lenses explicitly
 * and Phase 2 will be split into:
 *   - Phase 2a: Validate type compatibility (report errors only)
 *   - Phase 2b: (Removed in future sprint)
 */
```

**Question**: Is auto-insertion staying or going?

**Option A: Keep Auto-Insertion (Recommended)**
```typescript
/**
 * PHASE 2: Adapter Insertion (Frontend Normalization)
 *
 * For each edge with type mismatch:
 * 1. Check findAdapter(from, to)
 * 2. If adapter exists, insert adapter block
 * 3. If no adapter, report error
 *
 * Adapters are explicit derived blocks visible in normalized graph.
 * This is permanent behavior, not temporary compatibility.
 */
```

**Option B: User-Driven Insertion**
```typescript
/**
 * PHASE 2: Type Validation Only
 *
 * For each edge with type mismatch:
 * 1. Report diagnostic with suggested adapter
 * 2. User adds adapter explicitly via UI
 * 3. No auto-insertion
 */
```

**Recommendation**: Keep auto-insertion (Option A)
- Current implementation is spec-compliant
- Adapters are explicit blocks (not hidden conversion)
- Improves UX (user doesn't manually insert unit converters)
- Remove "temporary" comments to clarify this is permanent

**Justification**:
- Adapters are discoverable (visible in block graph)
- Adapters are editable (user can remove/change)
- Adapters are documented (AdapterSpec describes conversion)
- Auto-insertion is a frontend transform (not backend magic)
- Spec allows this: "Adapter insertion is frontend transform"

---

### 5. TypedPatch vs TypeResolvedPatch Naming

**Current Types**:
```typescript
// Pass 1 output
interface TypeResolvedPatch extends NormalizedPatch {
  portTypes: ReadonlyMap<PortKey, CanonicalType>;
}

// Pass 2 output
interface TypedPatch extends TypeResolvedPatch {
  blockOutputTypes: ReadonlyMap<string, ReadonlyMap<string, CanonicalType>>;
}
```

**Question**: Why does TypedPatch add blockOutputTypes if portTypes already has all port types?

**Investigation**:
- `blockOutputTypes` is described as "for legacy compatibility" (line 71 comment)
- It maps `BlockId → PortId → CanonicalType`
- `portTypes` maps `PortKey (blockIndex:portId:direction) → CanonicalType`

**Recommendation**: Deprecate blockOutputTypes
- It's redundant with portTypes
- It uses block ID (string) instead of block index (number)
- Backend should only use portTypes
- Remove blockOutputTypes in future cleanup sprint

---

## Action Items for User

1. **Decide on cardinality polymorphism strategy**
   - Type variables (requires solver changes) or runtime dispatch (current)?
   - Timeline: Should this block other work?

2. **Decide on instance resolution location**
   - Frontend (type solver) or backend (lowering)?
   - Impact: Changes Pass 1 and Pass 6

3. **Clarify adapter insertion permanence**
   - Remove "temporary" comments?
   - Update spec to document auto-insertion as permanent?

4. **Review blockOutputTypes usage**
   - Can we deprecate it?
   - Or is it needed for some use case?

5. **Set priority for fixes**
   - P0 (block release): isTypeCompatible purity?
   - P1 (next sprint): instance resolution?
   - P2 (backlog): cardinality polymorphism?
