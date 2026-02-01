# Context: Compiler Passes & Adapter System Audit

**Audit Date**: 2026-02-01
**Related Files**: See main gap analysis document

## Key Code Locations

### Compiler Pipeline
- **Main orchestration**: `src/compiler/compile.ts` (lines 109-426)
- **Pass 1 (Type Constraints)**: `src/compiler/frontend/analyze-type-constraints.ts`
- **Pass 2 (Type Graph)**: `src/compiler/frontend/analyze-type-graph.ts`
- **Pass 6 (Block Lowering)**: `src/compiler/backend/lower-blocks.ts`

### Adapter System
- **Adapter registry**: `src/graph/adapters.ts` (lines 105-261)
- **Adapter insertion**: `src/compiler/frontend/normalize-adapters.ts` (lines 367-495)
- **Normalization orchestration**: `src/graph/passes/index.ts` (lines 68-97)

### Type System
- **CanonicalType definition**: `src/core/canonical-types.ts`
- **ValueExpr IR**: `src/compiler/ir/value-expr.ts` (lines 76-86)
- **Type patches**: `src/compiler/ir/patches.ts` (lines 76-79)

### UI/Service Boundary
- **Compilation inspector service**: `src/services/CompilationInspectorService.ts`
- **Compilation inspector UI**: `src/ui/components/CompilationInspector.tsx`

## Audit Methodology

1. **Read compiler orchestration** to understand pass flow
2. **Trace type flow** from frontend (TypeResolvedPatch) to backend (lowering)
3. **Examine adapter system** for explicit vs implicit conversion
4. **Check type compatibility logic** for purity violations
5. **Verify UI boundary** respects CompilationInspectorService abstraction

## Key Findings Summary

### CRITICAL: isTypeCompatible Block-Name Violation
```typescript
// ❌ VIOLATION in src/compiler/frontend/analyze-type-graph.ts:55
function isTypeCompatible(
  from: CanonicalType,
  to: CanonicalType,
  sourceBlockType?: string,  // Should not exist!
  targetBlockType?: string   // Should not exist!
): boolean
```

This violates the spec requirement:
> isTypeCompatible(from: CanonicalType, to: CanonicalType) is a pure function of CanonicalType only

### HIGH: Backend Type Rewriting
```typescript
// ⚠️ ISSUE in src/compiler/backend/lower-blocks.ts:415-428
// Backend rewrites types based on runtime instance context
if (inferredInstance) {
  outTypes = outTypes.map(t => {
    if (card.kind === 'inst' && card.value.kind === 'many') {
      return withInstance(t, ref); // Modifies type!
    }
    return t;
  });
}
```

This violates:
> Type solver output is authoritative CanonicalType

### MEDIUM: Adapter Insertion Documentation
The code contains conflicting signals about whether auto-insertion is temporary or permanent:
```typescript
// From normalize-adapters.ts:344
/**
 * NOTE: Sprint 2 is transitional. Eventually, users will add lenses explicitly
 * and Phase 2 will be split into:
 *   - Phase 2a: Validate type compatibility (report errors only)
 *   - Phase 2b: (Removed in future sprint)
 */
```

But the implementation is actually spec-compliant (adapters as explicit blocks in frontend normalization).

## Evidence Files

### Compiler Pass Flow
```
compile.ts:109-426
├─ Pass 0: normalize(patch) → NormalizedPatch
├─ Pass 1: pass1TypeConstraints(normalized) → TypeResolvedPatch
├─ Pass 2: pass2TypeGraph(typeResolved) → TypedPatch
├─ Pass 3: pass3Time(typedPatch) → TimeResolvedPatch
├─ Pass 4: pass4DepGraph(timeResolvedPatch) → DepGraphWithTimeModel
├─ Pass 5: pass5CycleValidation(depGraphPatch) → AcyclicOrLegalGraph
├─ Pass 6: pass6BlockLowering(acyclicPatch) → UnlinkedIRFragments
└─ Pass 7: pass7Schedule(unlinkedIR, acyclicPatch) → ScheduleIR
```

### Type Authority Chain
```
Pass 1: analyze-type-constraints.ts
  ↓ Produces: TypeResolvedPatch { portTypes: Map<PortKey, CanonicalType> }
  ↓
Pass 2: analyze-type-graph.ts
  ↓ Extends: TypedPatch extends TypeResolvedPatch
  ↓ Adds: blockOutputTypes (legacy compatibility)
  ↓
Passes 3-7: Thread portTypes through
  ↓ Each pass type includes: portTypes: TypeResolvedPatch['portTypes']
  ↓
Pass 6: lower-blocks.ts
  ✅ Reads: portTypes.get(portKey(...))
  ❌ Writes: outTypes = outTypes.map(t => withInstance(t, ref))
```

### Adapter Flow
```
Graph Normalization (src/graph/passes/index.ts:68-97)
├─ Pass 0: Composite expansion
├─ Pass 1: Default source materialization
├─ Pass 2: Adapter insertion ← HERE
│  ├─ findAdapter(fromType, toType) → AdapterSpec?
│  ├─ If found: Create adapter block
│  └─ Insert into patch.blocks as derived block
├─ Pass 3: Varargs validation
└─ Pass 4: Block indexing

Adapter Registry (src/graph/adapters.ts:105-261)
├─ Unit conversions (phase01↔radians↔degrees, etc.)
├─ Time conversions (ms↔seconds)
├─ Normalization (scalar↔norm01)
└─ Broadcast (one→many)
```

## Spec Violations Detail

### Violation #1: Block-Name Type Compatibility
**File**: `src/compiler/frontend/analyze-type-graph.ts`
**Lines**: 55-112
**Severity**: CRITICAL

**Code Fragment**:
```typescript
// Line 79-86: Cardinality-generic exception
if (targetBlockType) {
  const meta = getBlockCardinalityMetadata(targetBlockType);
  if (meta && isCardinalityGeneric(targetBlockType)) {
    if (meta.broadcastPolicy === 'allowZipSig' || meta.broadcastPolicy === 'requireBroadcastExpr') {
      return true; // ❌ Type compatibility depends on block name!
    }
  }
}

// Line 88-97: Cardinality-preserving exception
if (fromCard.kind === 'one' && toCard.kind === 'many' && sourceBlockType) {
  const sourceMeta = getBlockCardinalityMetadata(sourceBlockType);
  if (sourceMeta?.cardinalityMode === 'preserve') {
    return true; // ❌ Type compatibility depends on block name!
  }
}
```

**Spec Requirement**:
> Guardrail #6: Adapter/Lens Policy Is Separate From Type Soundness
> - isTypeCompatible(from: CanonicalType, to: CanonicalType) is a pure function of CanonicalType only
> - No block-name-based exceptions in compatibility logic

**Why This Matters**:
- Type safety should be decidable from types alone
- Block metadata (cardinality mode, broadcast policy) is runtime/implementation concern
- Creates hidden coupling: can't reason about type safety without block registry
- Violates referential transparency

### Violation #2: Backend Type Mutation
**File**: `src/compiler/backend/lower-blocks.ts`
**Lines**: 415-428
**Severity**: HIGH

**Code Fragment**:
```typescript
// Line 407: Read types from portTypes (✅ correct)
let outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
  .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
  .filter((t): t is CanonicalType => t !== undefined);

// Line 415: Rewrite types based on instance (❌ violation)
if (inferredInstance) {
  const instanceDecl = builder.getInstances().get(inferredInstance);
  if (instanceDecl) {
    const ref = makeInstanceRef(instanceDecl.domainType as string, inferredInstance as string);
    outTypes = outTypes.map(t => {
      const card = t.extent.cardinality;
      if (card.kind === 'inst' && card.value.kind === 'many') {
        return withInstance(t, ref); // ❌ Creates new type!
      }
      return t;
    });
  }
}
```

**Spec Requirement**:
> Type solver output is authoritative CanonicalType - after type resolution, types must be consistent with resolved axes

**Why This Matters**:
- Frontend type solver (Pass 1) should be single source of truth
- Backend should be read-only consumer of types
- If instance propagation changes types, it should happen in frontend
- Creates two authorities: portTypes (frontend) and rewritten types (backend)

## Test Coverage Gaps

### Missing Tests
1. **isTypeCompatible purity test**
   - Test that result depends only on type parameters
   - Test that block names don't affect result
   - Test referential transparency

2. **Backend type immutability test**
   - Test that backend never modifies portTypes
   - Test that types read from portTypes match types used in lowering
   - Test that instance propagation doesn't change port types

3. **Frontend/backend boundary test**
   - Test that backend never imports frontend modules
   - Test that all type information flows through TypedPatch
   - Test that backend doesn't call type inference functions

### Existing Tests (Relevant)
- `src/compiler/__tests__/no-legacy-types.test.ts` - Verifies no SignalType/FieldType/EventExpr
- `src/compiler/ir/__tests__/no-legacy-kind-dispatch.test.ts` - Verifies no kind='sig'/'field'/'event'
- `src/compiler/frontend/__tests__/frontend-independence.test.ts` - Verifies frontend/backend split

## Recommended Fix Strategy

### Fix #1: Pure isTypeCompatible (P0)
**Duration**: 8-16 hours
**Complexity**: HIGH (requires rethinking cardinality polymorphism)

**Steps**:
1. Remove `sourceBlockType` and `targetBlockType` parameters
2. Make cardinality-generic blocks declare polymorphic types during inference
3. Type solver resolves cardinality vars to concrete values
4. If concrete types mismatch, insert Broadcast/Zip adapter in normalization
5. isTypeCompatible becomes pure: only checks resolved CanonicalType fields

**Example Fix**:
```typescript
// Before
function isTypeCompatible(from: CanonicalType, to: CanonicalType, sourceBlockType?: string, targetBlockType?: string): boolean

// After
function isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean {
  // No block metadata lookups
  // Pure type comparison only
}
```

### Fix #2: Move Instance Resolution to Frontend (P1)
**Duration**: 4-8 hours
**Complexity**: MEDIUM

**Steps**:
1. Add instance resolution pass to frontend (after type inference)
2. Resolve instance IDs during type solving (constraints include instance vars)
3. portTypes includes fully resolved instance IDs
4. Backend reads portTypes, never modifies
5. If dynamic instance propagation needed, use separate annotation system

**Example Fix**:
```typescript
// In Pass 1 (Type Constraints)
// Solve instance vars along with unit/payload vars
const instanceVars = new UnionFind<InstanceId>();
// ... constraint solving ...
// Output: portTypes with resolved instance IDs

// In Pass 6 (Lowering)
// Backend just reads, never writes
const outTypes = Object.keys(blockDef.outputs)
  .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
  .filter((t): t is CanonicalType => t !== undefined);
// NO REWRITING - outTypes is authoritative
```

### Fix #3: Clarify Adapter Insertion Model (P2)
**Duration**: 1-2 hours
**Complexity**: LOW (documentation only)

**Steps**:
1. Remove "temporary backward compatibility" comments
2. Update spec to document auto-insertion as permanent feature
3. Clarify: "Adapter insertion is a frontend normalization pass that creates explicit derived blocks"
4. Document invariant: "All type conversions result in explicit adapter blocks visible in normalized graph"

## Open Questions for User

1. **Cardinality polymorphism**: Should cardinality-generic blocks (Add, Mul, etc.) declare polymorphic types that get resolved by type solver? Or should they continue to use runtime dispatch?

2. **Instance propagation**: Should instance IDs be resolved during frontend type inference? Or is dynamic propagation a necessary backend concern?

3. **Adapter insertion**: Is auto-insertion the final design? Or should it eventually become user-driven?

4. **Migration timeline**: What's the priority for fixing these violations? P0 (block release), P1 (next sprint), P2 (backlog)?
