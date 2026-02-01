# Compiler Passes & Adapter System Audit - Executive Summary

**Audit Date**: 2026-02-01
**Auditor**: Claude (Sonnet 4.5)
**Spec References**:
- `.claude/rules/TYPE-SYSTEM-INVARIANTS.md`
- `design-docs/CANONICAL-TYPES.md`
- `design-docs/_new/0-Units-and-Adapters.md`

---

## TL;DR

**Overall Status**: ✅ **MOSTLY SPEC-COMPLIANT** (75% aligned)

The compiler architecture follows the frontend/backend split correctly and uses CanonicalType as the single authority. Adapters are explicit blocks inserted during frontend normalization. However, there is **1 CRITICAL violation** that must be fixed before claiming full spec compliance.

**Critical Issue**: `isTypeCompatible()` consults block names to make type compatibility decisions, violating the "pure function of CanonicalType only" requirement.

**Recommended Priority**: Fix block-name exceptions in P0 sprint, defer cardinality polymorphism to P1.

---

## Gap Analysis Files

1. **Critical Gaps**: `.agent_planning/gap-analysis/critical/topic-compiler-adapters.md`
   - Block-name exceptions in isTypeCompatible (CRITICAL)
   - Backend type rewriting (HIGH)
   - Adapter insertion documentation (MEDIUM)

2. **Context**: `.agent_planning/gap-analysis/critical/topic-compiler-adapters-CONTEXT.md`
   - Code locations, evidence, spec violations detail
   - Fix strategies and open questions

3. **To Review**: `.agent_planning/gap-analysis/to-review/topic-compiler-adapters.md`
   - Cardinality polymorphism strategy
   - Instance propagation location
   - Adapter insertion permanence
   - Architectural decisions needed

4. **Trivial Fixes**: `.agent_planning/gap-analysis/trivial/topic-compiler-adapters.md`
   - Documentation updates (~50 min)
   - Test additions (~35 min)
   - Total effort: ~1.5 hours

---

## Compliance Scorecard

| Requirement | Status | Evidence |
|------------|--------|----------|
| Frontend produces TypedPatch | ✅ PASS | `frontend/analyze-type-graph.ts:128` |
| Backend consumes typed graph | ⚠️ PARTIAL | Reads portTypes but rewrites types |
| Type solver output authoritative | ⚠️ PARTIAL | Backend modifies types (instance rewriting) |
| Block lowering emits ValueExpr | ✅ PASS | Unified ValueExpr IR, no legacy families |
| No back-edges in passes | ✅ PASS | Linear pipeline, no upstream mutations |
| Adapters are explicit blocks | ✅ PASS | Derived blocks with adapter role |
| Adapter insertion is frontend | ✅ PASS | Pass 2 of graph normalization |
| Every conversion = explicit block | ✅ PASS | Blocks added to patch.blocks |
| No implicit conversion logic | ❌ FAIL | Block-name exceptions in isTypeCompatible |
| isTypeCompatible pure function | ❌ FAIL | Takes sourceBlockType/targetBlockType |
| No fallback semantics | ✅ PASS | Errors reported as TypeConstraintError |
| UI reads CompilationInspector | ✅ PASS | No direct compiler imports |

**Score**: 9/12 PASS, 2/12 PARTIAL, 1/12 FAIL = **75% compliance**

---

## Critical Violations

### #1: Block-Name Exceptions in Type Compatibility

**File**: `src/compiler/frontend/analyze-type-graph.ts:55-112`

**Violation**:
```typescript
function isTypeCompatible(
  from: CanonicalType,
  to: CanonicalType,
  sourceBlockType?: string,  // ❌ Should not exist
  targetBlockType?: string   // ❌ Should not exist
): boolean {
  // Special case for cardinality-generic blocks
  if (targetBlockType && isCardinalityGeneric(targetBlockType)) {
    return true; // ❌ Type compatibility depends on block name!
  }
  // Special case for cardinality-preserving blocks
  if (sourceBlockType && sourceMeta?.cardinalityMode === 'preserve') {
    return true; // ❌ Type compatibility depends on block name!
  }
}
```

**Spec Requirement**:
> isTypeCompatible(from: CanonicalType, to: CanonicalType) is a pure function of CanonicalType only

**Impact**:
- Type safety not decidable from types alone
- Hidden coupling to block registry
- Violates referential transparency
- Makes testing difficult

**Fix** (8-16 hours):
1. Remove `sourceBlockType` and `targetBlockType` parameters
2. Move cardinality-generic logic to type inference (polymorphic types)
3. Insert explicit Broadcast/Zip adapters where cardinality mismatches
4. Make isTypeCompatible pure: only checks CanonicalType fields

### #2: Backend Type Rewriting

**File**: `src/compiler/backend/lower-blocks.ts:415-428`

**Violation**:
```typescript
// Read types from portTypes (✅ correct)
let outTypes = portTypes.get(portKey(blockIndex, portName, 'out'));

// Rewrite types based on instance (❌ violation)
if (inferredInstance) {
  outTypes = outTypes.map(t => withInstance(t, ref)); // Creates new types!
}
```

**Spec Requirement**:
> Type solver output is authoritative CanonicalType

**Impact**:
- Two authorities: portTypes (frontend) vs rewritten types (backend)
- Frontend types not actually authoritative
- Backend not read-only consumer

**Fix** (4-8 hours):
1. Move instance resolution to frontend type inference
2. Type solver resolves instance IDs during constraint solving
3. Backend only reads portTypes, never modifies
4. portTypes includes fully resolved instance IDs

---

## High-Priority Issues

### #3: Adapter Insertion Documentation

**File**: `src/compiler/frontend/normalize-adapters.ts:344-366`

**Issue**: Comments say "temporary backward compatibility" but implementation is spec-compliant

**Current Comment**:
```typescript
/**
 * NOTE: Sprint 2 is transitional. Eventually, users will add lenses explicitly
 * and Phase 2 will be split into:
 *   - Phase 2a: Validate type compatibility (report errors only)
 *   - Phase 2b: (Removed in future sprint)
 */
```

**Recommendation**: Remove "temporary" comments, document as permanent design

**Rationale**:
- Current model is correct (adapters as explicit blocks in frontend normalization)
- Improves UX (auto-insert unit converters)
- Adapters are discoverable and editable
- Spec allows this: "Adapter insertion is frontend transform"

**Fix** (1-2 hours): Documentation only

---

## Positive Findings

### ✅ Clean Frontend/Backend Boundary

**Evidence**: `src/compiler/compile.ts:109-426`
- Pass 0-2: Frontend (normalization, type inference, validation)
- Pass 3-7: Backend (time model, deps, lowering, scheduling)
- No circular dependencies
- Clear data flow: Patch → NormalizedPatch → TypeResolvedPatch → TypedPatch → IR

### ✅ CanonicalType Single Authority

**Evidence**: `src/compiler/ir/value-expr.ts:76-86`
- All ValueExpr variants carry `type: CanonicalType`
- No parallel SignalType/FieldType/EventType structures
- Signal/field/event derived from extent (temporality + cardinality)
- No kind='sig'/'field'/'event' discriminants stored

### ✅ Adapters Are Explicit Blocks

**Evidence**: `src/compiler/frontend/normalize-adapters.ts:200-282`
- Adapter blocks created with `BlockRole = { kind: 'derived', meta: { kind: 'adapter', ... } }`
- Inserted into `patch.blocks` map
- Visible in UI (can be inspected/edited)
- `findAdapter(from, to)` returns `AdapterSpec` with block type and ports

### ✅ Unified ValueExpr IR

**Evidence**: `src/compiler/ir/value-expr.ts:76`
- Single discriminated union (10 kinds)
- Legacy SigExpr/FieldExpr/EventExpr deleted
- All operations use CanonicalType for dispatch
- Runtime kernels derive signal/field/event from extent

### ✅ CompilationInspector Service Boundary

**Evidence**: `src/ui/components/CompilationInspector.tsx:38`
- UI reads only from `CompilationInspectorService`
- Service captures pass snapshots in `compile.ts`
- No direct UI imports of compiler internals
- Clean separation: Compiler → Service → UI

---

## Architectural Decisions Needed

### 1. Cardinality Polymorphism Strategy

**Current**: Runtime dispatch + block-name exceptions
**Proposed**: Compile-time type variables

**Question**: Should cardinality-generic blocks (Add, Mul, Expression) declare polymorphic types that get resolved by type solver?

**Options**:
- **A (Recommended)**: Type variables (e.g., `CardinalityVar('C')`)
  - Pros: Compile-time safety, pure type checking, explicit adapters
  - Cons: More complex type solver, requires block definition changes
- **B (Current)**: Runtime dispatch + exceptions
  - Pros: Simple block definitions, runtime flexibility
  - Cons: Violates spec, impure type checking, hidden complexity

**Impact**: Affects isTypeCompatible fix, block registry, type solver

---

### 2. Instance Resolution Location

**Current**: Backend infers and rewrites
**Proposed**: Frontend resolves during type inference

**Question**: Should instance IDs be resolved during frontend type constraints solving?

**Options**:
- **A (Recommended)**: Frontend instance resolution
  - Pros: Single type authority, backend read-only, cleaner boundary
  - Cons: More complex type solver
- **B (Current)**: Backend instance propagation
  - Pros: Deferred resolution, runtime flexibility
  - Cons: Violates spec (backend modifies types)

**Impact**: Affects Pass 1 (type constraints) and Pass 6 (lowering)

---

### 3. Adapter Insertion Permanence

**Current**: Auto-insertion with "temporary" comments
**Proposed**: Clarify as permanent feature

**Question**: Should adapter auto-insertion stay or be replaced with user-driven insertion?

**Options**:
- **A (Recommended)**: Keep auto-insertion
  - Pros: Current model is spec-compliant, better UX
  - Cons: Less user control (but adapters are still editable)
- **B**: User-driven insertion
  - Pros: Maximum user control
  - Cons: More tedious UX, no clear spec benefit

**Impact**: Documentation only (no code changes needed)

---

## Action Plan

### Phase 1: Quick Wins (P0, ~1.5 hours)
**Goal**: Fix documentation, add basic tests

1. ✅ Remove "temporary" comments from adapter insertion
2. ✅ Add invariant comments to backend lowering
3. ✅ Add spec references to key files
4. ✅ Add isTypeCompatible purity test
5. ✅ Add backend immutability test

**Deliverable**: Trivial fixes completed, tests prove violations

---

### Phase 2: Critical Fix (P0, ~8-16 hours)
**Goal**: Remove block-name exceptions from isTypeCompatible

**Decision Required**: Cardinality polymorphism strategy (Option A or B)

**If Option A (Type Variables)**:
1. Update block definitions to declare polymorphic cardinality
2. Extend type solver to resolve cardinality variables
3. Insert explicit Broadcast/Zip adapters for mismatches
4. Remove sourceBlockType/targetBlockType from isTypeCompatible
5. Update tests to verify purity

**If Option B (Keep Runtime Dispatch)**:
1. Move cardinality-generic dispatch to lowering only
2. Type checker treats all blocks as having static types
3. Insert adapters where cardinality mismatches
4. Remove block-name exceptions (force explicit adapters)

**Deliverable**: isTypeCompatible is pure function

---

### Phase 3: High-Priority Fix (P1, ~4-8 hours)
**Goal**: Move instance resolution to frontend

1. Add instance variable support to type solver
2. Collect instance constraints during type inference
3. Resolve instance IDs in Pass 1 (type constraints)
4. Remove instance rewriting from Pass 6 (lowering)
5. Update tests to verify backend doesn't modify types

**Deliverable**: Backend is read-only consumer of portTypes

---

### Phase 4: Documentation & Cleanup (P2, ~2-4 hours)
**Goal**: Align documentation with implementation

1. Update spec to document adapter auto-insertion as permanent
2. Deprecate blockOutputTypes (redundant with portTypes)
3. Add architectural boundary tests
4. Document cardinality polymorphism model (once decided)

**Deliverable**: Spec matches implementation

---

## Open Questions for User

1. **Cardinality polymorphism**: Type variables or runtime dispatch? (Affects Phase 2 scope)

2. **Instance propagation**: Frontend or backend? (Affects Phase 3 priority)

3. **Adapter insertion**: Confirm keep auto-insertion? (Affects documentation)

4. **Priority**: Which phase should be P0 (block release)?
   - Phase 1 (trivial fixes): Always do first
   - Phase 2 (isTypeCompatible): Critical for spec compliance
   - Phase 3 (instance resolution): High priority but less urgent
   - Phase 4 (documentation): Can be deferred

5. **Timeline**: How many hours available for this work?
   - If <10 hours: Do Phase 1 + 2 (fix critical violation)
   - If 10-20 hours: Do Phase 1-3 (full compliance)
   - If >20 hours: Do all phases (compliance + cleanup)

---

## Summary

The compiler architecture is **fundamentally sound** with clean separation of concerns, unified IR, and explicit adapters. The main issue is **block-name exceptions in type compatibility**, which violates the spec's purity requirement. This can be fixed by moving cardinality polymorphism to the type solver and inserting explicit adapters.

**Recommendation**: Fix isTypeCompatible in P0, defer instance resolution to P1, handle documentation in P2.

**Estimated Total Effort**:
- P0 (critical): 10-18 hours
- P1 (high): 4-8 hours
- P2 (documentation): 2-4 hours
- **Total**: 16-30 hours depending on approach
