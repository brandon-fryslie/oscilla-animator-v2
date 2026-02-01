# Trivial Fixes: Compiler Passes & Adapter System

**Audit Date**: 2026-02-01

## Documentation & Comment Fixes

### 1. Remove "Temporary" Comments from Adapter Insertion

**Location**: `src/compiler/frontend/normalize-adapters.ts:344-366`

**Current**:
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

**Recommended**:
```typescript
/**
 * PHASE 2: Adapter Insertion (Frontend Normalization)
 *
 * For each edge with type mismatch:
 * 1. Check findAdapter(from, to) for matching adapter spec
 * 2. If adapter exists, insert adapter block (derived block, visible in graph)
 * 3. If no adapter exists, report NoAdapterFound error
 *
 * Adapters are explicit blocks with BlockRole = { kind: 'derived', meta: { kind: 'adapter', ... } }
 * All type conversions result in explicit adapter blocks visible in normalized graph.
 *
 * This is permanent behavior. Adapter insertion is a frontend normalization pass,
 * ensuring all edges are type-compatible before compilation.
 */
```

**Effort**: 5 minutes

---

### 2. Add Function Signature Comment to isTypeCompatible

**Location**: `src/compiler/frontend/analyze-type-graph.ts:55`

**Current**:
```typescript
/**
 * Type compatibility check for wired connections.
 * Uses resolved types - no variables should be present.
 */
function isTypeCompatible(from: CanonicalType, to: CanonicalType, sourceBlockType?: string, targetBlockType?: string): boolean
```

**Recommended** (after fixing parameters):
```typescript
/**
 * Type compatibility check for wired connections.
 *
 * Pure function: result depends only on CanonicalType fields.
 * No side effects, no block metadata lookups, no exceptions.
 *
 * Checks:
 * - Payload must match exactly (float, vec2, color, etc.)
 * - Unit must match exactly (scalar, phase01, radians, etc.)
 * - Temporality must match (continuous vs discrete)
 * - Cardinality must match (one vs many, and instance if many)
 *
 * Does NOT check:
 * - Block-specific behavior (cardinality-generic, preserving, etc.)
 * - Adapter availability (use findAdapter for that)
 * - Runtime compatibility (that's backend's job)
 *
 * @param from - Source port type (fully resolved, no vars)
 * @param to - Target port type (fully resolved, no vars)
 * @returns true if types are compatible without adapter
 */
function isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean
```

**Effort**: 10 minutes

---

### 3. Document portTypes Authority in TypeResolvedPatch

**Location**: `src/compiler/ir/patches.ts:59-64`

**Current**:
```typescript
// Re-export from pass1 for convenience
export type { TypeResolvedPatch, PortKey } from '../frontend/analyze-type-constraints';
import type { TypeResolvedPatch } from '../frontend/analyze-type-constraints';
```

**Recommended**: Add comment in `analyze-type-constraints.ts:29`
```typescript
/**
 * TypeResolvedPatch - Output of Pass 1 (Type Constraint Solving)
 *
 * SINGLE SOURCE OF TRUTH for all port types in the patch.
 * All downstream passes (2-7) MUST use portTypes for type information.
 * Backend passes MUST NOT modify or rewrite types - portTypes is read-only.
 *
 * Contract:
 * - Every port has exactly one CanonicalType entry in portTypes
 * - All type variables (unit, payload, cardinality, instance) are RESOLVED
 * - No 'var' axis kind should appear in any type
 * - Types are consistent with block definitions (modulo polymorphism resolution)
 */
export interface TypeResolvedPatch extends NormalizedPatch {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
}
```

**Effort**: 5 minutes

---

### 4. Add Invariant Comment to Backend Lowering

**Location**: `src/compiler/backend/lower-blocks.ts:407`

**Current**:
```typescript
// Resolve output types from pass1 portTypes
let outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
  .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
  .filter((t): t is CanonicalType => t !== undefined);
```

**Recommended**:
```typescript
// Resolve output types from pass1 portTypes (THE authoritative source)
// INVARIANT: Backend MUST NOT modify these types. portTypes is read-only.
// If types need adjustment (instance propagation, etc.), it should happen in frontend.
let outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
  .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
  .filter((t): t is CanonicalType => t !== undefined);

// TODO: Remove instance rewriting (lines 415-428) - violates read-only invariant
// Instance resolution should happen in Pass 1 (type constraints), not here.
```

**Effort**: 5 minutes

---

### 5. Add Reference to TYPE-SYSTEM-INVARIANTS.md in Key Files

**Locations**:
- `src/compiler/frontend/analyze-type-graph.ts` (top of file)
- `src/compiler/backend/lower-blocks.ts` (top of file)
- `src/graph/adapters.ts` (top of file)

**Recommended**: Add to file header
```typescript
/**
 * [Existing file header]
 *
 * Spec Reference: .claude/rules/TYPE-SYSTEM-INVARIANTS.md
 * - Guardrail #1: Single Authority (CanonicalType only)
 * - Guardrail #6: Adapter/Lens Policy Is Separate From Type Soundness
 * - Guardrail #14: Frontend/Backend Boundary Is Strict
 */
```

**Effort**: 5 minutes per file (15 minutes total)

---

### 6. Document Adapter Registry Pattern

**Location**: `src/graph/adapters.ts:105`

**Current**:
```typescript
/**
 * Registered adapter rules.
 * Order matters — more specific rules before general rules; first match wins.
 *
 * Updated for #18 structured units: uses { kind: 'angle', unit: 'phase01' } etc.
 */
const ADAPTER_RULES: AdapterRule[] = [
```

**Recommended**:
```typescript
/**
 * Registered adapter rules.
 *
 * Order matters: more specific rules before general rules (first match wins).
 * Updated for #18 structured units: uses { kind: 'angle', unit: 'phase01' } etc.
 *
 * Rule Structure:
 * - from: TypePattern (what source type to match)
 * - to: TypePattern (what target type to match)
 * - adapter: AdapterSpec (what block to insert)
 *
 * Pattern Matching:
 * - 'any': matches any value for this component
 * - 'same': output preserves input value (for extent-preserving adapters)
 * - Specific value: matches exact type (e.g., FLOAT, { kind: 'angle', unit: 'phase01' })
 *
 * Extent Matching:
 * - Unit adapters: extent = 'any' (preserves cardinality, temporality)
 * - Broadcast: cardinality one → many (requires instance resolution)
 * - Time adapters: payload changes (int → float), unit changes (ms → seconds)
 *
 * Spec Reference:
 * - design-docs/_new/0-Units-and-Adapters.md (§B4.1: Required adapters)
 * - design-docs/_new/0-Units-and-Adapters.md (§B4.2: Disallowed adapters)
 */
const ADAPTER_RULES: AdapterRule[] = [
```

**Effort**: 10 minutes

---

### 7. Fix Misleading Variable Name in normalize-adapters.ts

**Location**: `src/compiler/frontend/normalize-adapters.ts:95-100`

**Current**:
```typescript
function generateLensBlockId(portId: string, lensId: string): BlockId {
  return `_lens_${portId}_${lensId}` as BlockId;
}
```

**Issue**: Function is called "Lens" but it's used for adapters too

**Recommended**: Rename to `generateAdapterBlockId` or clarify in comment
```typescript
/**
 * Generate deterministic ID for adapter/lens blocks.
 * Format: _lens_{portId}_{adapterOrLensId}
 *
 * Note: "lens" prefix is historical - applies to all adapter blocks.
 * Adapter blocks are lenses in the categorical sense (structure-preserving transformations).
 */
function generateLensBlockId(portId: string, lensId: string): BlockId {
  return `_lens_${portId}_${lensId}` as BlockId;
}
```

**Effort**: 5 minutes

---

### 8. Add Comment to Pass Pipeline in compile.ts

**Location**: `src/compiler/compile.ts:132-268`

**Current**:
```typescript
try {
  // Pass 1: Normalization
  const normResult = normalize(patch);
  // ... etc
```

**Recommended**: Add pass boundary comments
```typescript
try {
  // =================================================================
  // FRONTEND PASSES (Graph → TypedPatch)
  // Responsibility: Type inference, adapter insertion, validation
  // Output: Fully typed, normalized graph ready for backend
  // =================================================================

  // Pass 0: Normalization (graph/normalize.ts)
  // - Composite expansion, default sources, adapters, varargs, indexing
  const normResult = normalize(patch);
  // ... error handling ...

  // Pass 1: Type Constraints (frontend/analyze-type-constraints.ts)
  // - Resolve unit/payload/cardinality/instance vars via constraint solving
  // - Output: TypeResolvedPatch with portTypes (SINGLE SOURCE OF TRUTH)
  const pass1Result = pass1TypeConstraints(normalized);
  // ... error handling ...

  // Pass 2: Type Graph (frontend/analyze-type-graph.ts)
  // - Validate type compatibility for all edges
  // - Output: TypedPatch (extends TypeResolvedPatch with legacy blockOutputTypes)
  const typedPatch = pass2TypeGraph(typeResolved);

  // =================================================================
  // BACKEND PASSES (TypedPatch → CompiledProgramIR)
  // Responsibility: Time model, dependency graph, lowering, scheduling
  // Contract: Backend is READ-ONLY consumer of types from portTypes
  // =================================================================

  // Pass 3: Time Topology (backend/derive-time-model.ts)
  const timeResolvedPatch = pass3Time(typedPatch);

  // Pass 4: Dependency Graph (backend/derive-dep-graph.ts)
  const depGraphPatch = pass4DepGraph(timeResolvedPatch);

  // Pass 5: Cycle Validation (backend/schedule-scc.ts)
  const acyclicPatch = pass5CycleValidation(depGraphPatch);

  // Pass 6: Block Lowering (backend/lower-blocks.ts)
  // - Lower blocks to unified ValueExpr IR
  // - Uses portTypes for type information (no type inference here)
  const unlinkedIR = pass6BlockLowering(acyclicPatch, { ... });

  // Pass 7: Schedule Construction (backend/schedule-program.ts)
  const scheduleIR = pass7Schedule(unlinkedIR, acyclicPatch);
```

**Effort**: 10 minutes

---

## Test Improvements (Low-Hanging Fruit)

### 9. Add isTypeCompatible Purity Test

**Location**: `src/compiler/frontend/__tests__/analyze-type-graph.test.ts` (new file)

**Recommended**:
```typescript
import { describe, it, expect } from 'vitest';
import { canonicalType, FLOAT, INT, VEC2 } from '../../../core/canonical-types';

// Import isTypeCompatible (may need to export it first)
// import { isTypeCompatible } from '../analyze-type-graph';

describe('isTypeCompatible purity', () => {
  it('returns same result for identical types regardless of call count', () => {
    const typeA = canonicalType(FLOAT);
    const typeB = canonicalType(FLOAT);

    const result1 = isTypeCompatible(typeA, typeB);
    const result2 = isTypeCompatible(typeA, typeB);
    const result3 = isTypeCompatible(typeA, typeB);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('does not depend on block names (after fix)', () => {
    // TODO: After removing sourceBlockType/targetBlockType params,
    // verify that result depends only on types
  });

  it('has no side effects', () => {
    const typeA = canonicalType(FLOAT);
    const typeB = canonicalType(INT);

    const before = JSON.stringify({ typeA, typeB });
    isTypeCompatible(typeA, typeB);
    const after = JSON.stringify({ typeA, typeB });

    expect(before).toBe(after); // Types not mutated
  });
});
```

**Effort**: 15 minutes

---

### 10. Add Backend Type Immutability Test

**Location**: `src/compiler/backend/__tests__/lower-blocks.test.ts`

**Recommended**:
```typescript
describe('Backend type immutability', () => {
  it('does not modify portTypes from TypeResolvedPatch', () => {
    // Create TypeResolvedPatch with known portTypes
    const patch = createTestPatch();
    const portTypes = new Map<PortKey, CanonicalType>([
      ['0:out:out' as PortKey, canonicalType(FLOAT)],
    ]);
    const typeResolvedPatch: TypeResolvedPatch = { ...patch, portTypes };

    // Snapshot portTypes before lowering
    const beforeSnapshot = JSON.stringify([...portTypes.entries()]);

    // Run pass6
    pass6BlockLowering({ ...typeResolvedPatch, /* full patch */ });

    // Verify portTypes unchanged
    const afterSnapshot = JSON.stringify([...portTypes.entries()]);
    expect(beforeSnapshot).toBe(afterSnapshot);
  });
});
```

**Effort**: 20 minutes

---

## Total Effort Estimate

- Documentation fixes: ~50 minutes
- Test additions: ~35 minutes
- **Total**: ~1.5 hours

All trivial fixes can be completed in a single sitting without requiring architectural decisions.
