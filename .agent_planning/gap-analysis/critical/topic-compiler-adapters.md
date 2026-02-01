# Critical Gaps: Compiler Passes & Adapter System

**Audit Date**: 2026-02-01
**Auditor**: Claude (Sonnet 4.5)
**Spec Reference**: TYPE-SYSTEM-INVARIANTS.md, design-docs/CANONICAL-TYPES.md

## Executive Summary

**Status**: ✅ **MOSTLY ALIGNED** with spec requirements, but has **1 CRITICAL GAP** and **2 HIGH-PRIORITY ISSUES**.

The compiler architecture follows the frontend/backend split correctly, uses CanonicalType as single authority, and has adapters as explicit blocks. However, there's a critical violation in Pass 2 (type compatibility) that uses block-name-based exceptions, and adapter insertion still happens in the frontend (which is acceptable) but needs documentation clarity.

---

## CRITICAL GAP #1: Block-Name Exceptions in isTypeCompatible

**Location**: `src/compiler/frontend/analyze-type-graph.ts:55-112`

**Violation**: **Guardrail #6: Adapter/Lens Policy Is Separate From Type Soundness**
- isTypeCompatible(from, to, **sourceBlockType**, **targetBlockType**) consults block names
- Lines 79-86: Special case for `targetBlockType` cardinality-generic blocks
- Lines 88-97: Special case for `sourceBlockType` cardinality-preserving blocks
- This creates **block-name-based compatibility semantics** instead of pure type-based compatibility

**Spec Requirement**:
```
isTypeCompatible(from: CanonicalType, to: CanonicalType) is a pure function of CanonicalType only
No block-name-based exceptions in compatibility logic
```

**Current Implementation**:
```typescript
function isTypeCompatible(
  from: CanonicalType,
  to: CanonicalType,
  sourceBlockType?: string,  // ❌ VIOLATION
  targetBlockType?: string   // ❌ VIOLATION
): boolean {
  // ... type checks ...

  // ❌ Block-name exception for cardinality-generic blocks
  if (targetBlockType) {
    const meta = getBlockCardinalityMetadata(targetBlockType);
    if (meta && isCardinalityGeneric(targetBlockType)) {
      if (meta.broadcastPolicy === 'allowZipSig' || meta.broadcastPolicy === 'requireBroadcastExpr') {
        return true; // Allows mismatch based on block name!
      }
    }
  }

  // ❌ Block-name exception for cardinality-preserving blocks
  if (fromCard.kind === 'one' && toCard.kind === 'many' && sourceBlockType) {
    const sourceMeta = getBlockCardinalityMetadata(sourceBlockType);
    if (sourceMeta?.cardinalityMode === 'preserve') {
      return true; // Allows mismatch based on block name!
    }
  }
}
```

**Impact**:
- Type compatibility is no longer a pure function of types
- Creates hidden coupling between type system and block registry
- Violates "No block-name-based exceptions" invariant
- Makes it impossible to reason about type safety without knowing block implementation details

**Fix Required**:
1. Remove `sourceBlockType` and `targetBlockType` parameters from `isTypeCompatible`
2. Make `isTypeCompatible` pure: `(from: CanonicalType, to: CanonicalType) => boolean`
3. Move cardinality-generic/preserving logic into:
   - Option A: **Type inference pass** (resolve to concrete types before validation)
   - Option B: **Explicit adapter insertion** (insert Broadcast/Zip adapters where needed)
   - Option C: **Frontend normalization pass** (expand cardinality-preserving blocks)

**Recommended Fix**: Option B (explicit adapters)
- Cardinality-preserving blocks should emit CanonicalType with cardinality vars during inference
- Type solver resolves vars to concrete cardinality
- If mismatch remains, insert explicit Broadcast adapter in normalization
- Pass 2 validates pure type compatibility only

---

## HIGH-PRIORITY ISSUE #1: Adapter Insertion in Frontend (Needs Clarity)

**Location**: `src/compiler/frontend/normalize-adapters.ts:367-495`

**Status**: ⚠️ **ACCEPTABLE BUT NEEDS DOCUMENTATION**

**Current Behavior**:
- Adapter insertion happens in **frontend normalization** (Pass 2 of graph normalization)
- Uses `findAdapter(from, to)` to find matching adapter blocks
- Inserts adapter blocks as derived blocks with role `{ kind: 'derived', meta: { kind: 'adapter', ... } }`
- This creates explicit blocks visible in the normalized graph

**Spec Alignment**:
✅ Adapters are explicit blocks (not implicit conversion logic)
✅ Adapter insertion is a frontend transform (not backend/lowering)
✅ Every conversion results in explicit adapter block visible to UI
⚠️ **BUT**: Comments indicate this is "temporary backward compatibility" (lines 344-366)

**Comment from Code**:
```typescript
/**
 * PHASE 2: Auto-insertion (Backwards Compatibility)
 *
 * NOTE: Sprint 2 is transitional. Eventually, users will add lenses explicitly
 * and Phase 2 will be split into:
 *   - Phase 2a: Validate type compatibility (report errors only)
 *   - Phase 2b: (Removed in future sprint)
 *
 * For now, this phase still auto-inserts adapters for backward compatibility.
 * But the design is set up to remove auto-insertion in Sprint 3+.
 */
```

**Required Clarification**:
1. **Is auto-insertion staying or going?**
   - If staying: Update spec to reflect this (adapter insertion = frontend normalization pass)
   - If going: Document migration plan and timeline
2. **What is the final adapter insertion model?**
   - User-driven (UI inserts adapters explicitly)?
   - Compiler-driven (frontend pass auto-inserts based on type mismatch)?
   - Hybrid (suggest adapters, user approves)?

**Recommendation**:
- **Keep auto-insertion in frontend normalization** (current model is spec-compliant)
- Remove "temporary" comments (this IS the correct design)
- Update spec to clarify: "Adapter insertion happens during frontend normalization (Pass 2), creating explicit derived blocks visible to all downstream passes"

---

## HIGH-PRIORITY ISSUE #2: TypedPatch Does Not Fully Replace Block Type Lookups

**Location**: Multiple files

**Status**: ⚠️ **PARTIAL COMPLIANCE**

**Spec Requirement**:
```
Frontend produces TypedPatch with CanonicalType for every port + edge
Backend consumes typed+normalized graph - does NO type inference, NO adapter insertion
Type solver output is authoritative CanonicalType - after type resolution, types must be consistent with resolved axes
```

**Current Implementation**:
✅ `TypeResolvedPatch` (Pass 1 output) contains `portTypes: ReadonlyMap<PortKey, CanonicalType>`
✅ `TypedPatch` (Pass 2 output) extends `TypeResolvedPatch` and adds `blockOutputTypes`
✅ Backend passes thread `portTypes` through (Pass 3-7 all have `portTypes` in their patch types)
⚠️ **BUT**: Backend still looks up block definitions for metadata (cardinality mode, etc.)

**Evidence from `lower-blocks.ts` (lines 407-428)**:
```typescript
// Resolve output types from pass1 portTypes ✅
let outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
  .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
  .filter((t): t is CanonicalType => t !== undefined);

// ❌ But then rewrites types based on inferredInstance (runtime concern, not type concern)
if (inferredInstance) {
  const instanceDecl = builder.getInstances().get(inferredInstance);
  if (instanceDecl) {
    const ref = makeInstanceRef(instanceDecl.domainType as string, inferredInstance as string);
    outTypes = outTypes.map(t => {
      const card = t.extent.cardinality;
      if (card.kind === 'inst' && card.value.kind === 'many') {
        return withInstance(t, ref); // Rewrites type!
      }
      return t;
    });
  }
}
```

**Issue**: Backend is **rewriting types** based on runtime instance context, not using frontend types as single authority.

**Impact**:
- Frontend `portTypes` is not actually authoritative
- Backend can change types based on instance propagation
- Violates "Type solver output is authoritative CanonicalType" invariant

**Fix Required**:
1. Move instance rewriting to **frontend type inference** (Pass 1)
2. Type solver should resolve instance IDs during constraint solving
3. Backend should **only read** types from `portTypes`, never modify them
4. If instance propagation is needed, it should be a **separate analysis** that annotates blocks, not rewrites types

---

## POSITIVE FINDINGS

### ✅ Frontend/Backend Boundary Is Clean

**Evidence**:
- `src/compiler/compile.ts` shows clear pass orchestration:
  - Pass 0: Normalization (graph/normalize.ts → NormalizedPatch)
  - Pass 1: Type Constraints (frontend/analyze-type-constraints.ts → TypeResolvedPatch)
  - Pass 2: Type Graph (frontend/analyze-type-graph.ts → TypedPatch)
  - Pass 3-7: Backend passes (backend/*)
- No backend pass calls frontend functions
- No frontend pass calls backend functions
- Clear data flow: Patch → NormalizedPatch → TypeResolvedPatch → TypedPatch → ... → CompiledProgramIR

### ✅ CanonicalType Is Single Authority

**Evidence**:
- All port types stored as `CanonicalType` in `TypeResolvedPatch.portTypes`
- No parallel "SignalType", "FieldType", "EventType" structures found
- ValueExpr uses unified `type: CanonicalType` field (no kind discriminant)
- Runtime derives signal/field/event from `extent.temporality` and `extent.cardinality`

### ✅ Adapters Are Explicit Blocks

**Evidence from `normalize-adapters.ts`**:
```typescript
// Adapter blocks are real blocks with BlockRole
const lensRole: BlockRole = {
  kind: 'derived',
  meta: {
    kind: 'adapter',
    edgeId: '',
    adapterType: lens.lensType,
  },
};

// Inserted into blocks map
newBlocks.set(ins.block.id, ins.block);
```

**Evidence from `adapters.ts`**:
- `findAdapter(from, to)` returns `AdapterSpec` with `blockType`, `inputPortId`, `outputPortId`
- Adapter registry maps type patterns to block types (e.g., `Adapter_PhaseToRadians`)
- No implicit conversion logic in type compatibility checks (except for block-name exceptions - see GAP #1)

### ✅ ValueExpr Is Unified IR (No Separate Families)

**Evidence from `value-expr.ts`**:
```typescript
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime
  | ValueExprShapeRef
  | ValueExprEventRead
  | ValueExprEvent
  | ValueExprSlotRead;
```

- Single discriminated union (10 kinds)
- No `SigExpr`, `FieldExpr`, `EventExpr` families
- All variants carry `type: CanonicalType`
- Signal/field/event derived from extent, not stored

### ✅ CompilationInspectorService Provides UI Access

**Evidence**:
- `src/services/CompilationInspectorService.ts` captures pass snapshots
- UI component `src/ui/components/CompilationInspector.tsx` reads snapshots
- No direct UI access to compiler internals
- Clean separation: Compiler → Service → UI

---

## SUMMARY TABLE

| Spec Requirement | Status | Location | Notes |
|-----------------|--------|----------|-------|
| Frontend produces TypedPatch | ✅ PASS | `frontend/analyze-type-graph.ts:128` | TypedPatch extends TypeResolvedPatch with blockOutputTypes |
| Backend consumes typed+normalized graph | ⚠️ PARTIAL | `backend/lower-blocks.ts:407` | Reads portTypes but rewrites types based on instance |
| Type solver output authoritative | ⚠️ PARTIAL | `backend/lower-blocks.ts:415` | Backend modifies types (instance rewriting) |
| Block lowering emits unified ValueExpr | ✅ PASS | `ir/value-expr.ts:76` | Single ValueExpr union, no legacy families |
| No back-edges | ✅ PASS | `compile.ts:109-405` | Linear pass pipeline, no upstream mutations |
| Adapters are explicit blocks | ✅ PASS | `frontend/normalize-adapters.ts:200` | Derived blocks with adapter role |
| Adapter insertion is frontend transform | ✅ PASS | `graph/passes/index.ts:79` | Pass 2 of normalization |
| Every conversion = explicit adapter block | ✅ PASS | `frontend/normalize-adapters.ts:282` | Blocks added to patch.blocks |
| No implicit conversion in isTypeCompatible | ❌ FAIL | `frontend/analyze-type-graph.ts:79` | Block-name exceptions present |
| isTypeCompatible purely type-based | ❌ FAIL | `frontend/analyze-type-graph.ts:55` | Takes sourceBlockType/targetBlockType params |
| No fallback semantics | ✅ PASS | `frontend/analyze-type-constraints.ts:50` | Type errors reported as TypeConstraintError |
| UI reads CompilationInspectorService only | ✅ PASS | `ui/components/CompilationInspector.tsx:38` | No direct compiler imports |

**Score**: 9/12 PASS, 2/12 PARTIAL, 1/12 FAIL

---

## ACTION ITEMS

### P0 (Critical - Blocks Spec Compliance)
1. **Remove block-name exceptions from isTypeCompatible**
   - File: `src/compiler/frontend/analyze-type-graph.ts`
   - Change signature: `isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean`
   - Move cardinality-generic/preserving logic to type inference or adapter insertion
   - Estimated effort: 8-16 hours (requires rethinking cardinality polymorphism)

### P1 (High - Architectural Clarity)
2. **Fix instance rewriting in backend lowering**
   - File: `src/compiler/backend/lower-blocks.ts:415-428`
   - Move instance ID resolution to frontend type inference
   - Backend should only read portTypes, never modify
   - Estimated effort: 4-8 hours

3. **Clarify adapter insertion model**
   - File: `src/compiler/frontend/normalize-adapters.ts:344-366`
   - Remove "temporary backward compatibility" comments if keeping auto-insertion
   - Update spec to document final adapter insertion model
   - Estimated effort: 1-2 hours (documentation only)

### P2 (Medium - Documentation)
4. **Add architectural boundary tests**
   - Verify backend never imports frontend modules
   - Verify backend never modifies portTypes
   - Verify isTypeCompatible has no side effects
   - Estimated effort: 2-4 hours

---

## REFERENCES

- Spec: `.claude/rules/TYPE-SYSTEM-INVARIANTS.md`
- Adapter spec: `design-docs/_new/0-Units-and-Adapters.md`
- Frontend code: `src/compiler/frontend/`
- Backend code: `src/compiler/backend/`
- Adapter registry: `src/graph/adapters.ts`
