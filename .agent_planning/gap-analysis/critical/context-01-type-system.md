---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [C-3, C-5, U-4, U-5, U-6, U-7, U-19, U-26]
priority: P1
---

# Context: Topic 01 — Type System (Critical)

## What the Spec Requires

1. PayloadType: `'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'phase' | 'bool' | 'unit' | 'shape2d'`
2. Stride per PayloadType: float/int/phase/bool/unit=1, vec2=2, vec3=3, color=4, shape2d=8
3. CombineMode as discriminated union: numeric (sum/avg/min/max/mul), any (last/first/layer), boolean (or/and)
4. Extent (5-axis coordinate): cardinality, temporality, binding, perspective, branch
5. SignalType = { payload, extent }
6. AxisTag<T> discriminated union (default | instantiated)
7. Cardinality: zero | one | many(instance)
8. Temporality: continuous | discrete
9. Phase arithmetic: phase+float=phase, phase*float=phase, phase+phase=TYPE ERROR
10. DomainSpec, InstanceDecl, InstanceRef types

## Current State (Topic-Level)

### How It Works Now
The type system is in `src/core/canonical-types.ts` with re-exports via `src/types/index.ts`. It implements the 5-axis Extent model correctly (AxisTag, Cardinality, Temporality, Binding). PayloadType is a 6-member string union (float, int, vec2, color, bool, shape). CombineMode is a flat 6-member string union in types/index.ts. A separate Unit type provides semantic annotations (phase01, radians, norm01, etc.).

### Patterns to Follow
- Discriminated unions with `readonly kind` field
- Constructor functions for each variant (e.g., `cardinalityOne()`)
- Re-exports from core/ through types/index.ts
- Tests in core/__tests__/canonical-types.test.ts

## Work Items

### WI-1: CombineMode discriminated union

**Category**: CRITICAL
**Priority**: P1 — foundational type used by block system and compilation
**Spec requirement**: CombineMode as `{ kind: 'sum' } | { kind: 'avg' } | ...` with per-payload-type restrictions

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/types/index.ts | CombineMode definition | L140-146 |
| src/graph/passes/pass1-default-sources.ts | Uses CombineMode | various |
| src/compiler/ir/bridges.ts | Uses CombineMode | various |

**Current state**: `type CombineMode = 'last' | 'first' | 'sum' | 'average' | 'max' | 'min'`
**Required state**: Discriminated union with all spec modes, plus per-payload restrictions (shape2d only allows first/last)
**Suggested approach**: Replace flat union with tagged union. Add `isValidCombineForPayload(mode, payload)` predicate. Update all usages (grep for CombineMode).

**Depends on**: none
**Blocks**: U-7 (PortBinding needs CombineMode)

---

### WI-2: PayloadType vec3 + shape2d rename

**Category**: CRITICAL
**Priority**: P1 — blocks 3D coordinate system and stride calculations
**Spec requirement**: PayloadType includes vec3 (stride=3), shape→shape2d rename, and unit (stride=1)

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/core/canonical-types.ts | PayloadType definition | L120-126 |
| src/core/canonical-types.ts | ALLOWED_UNITS table | L73-80 |
| src/core/canonical-types.ts | defaultUnitForPayload | L95-103 |

**Current state**: 6 PayloadTypes: float, int, vec2, color, bool, shape
**Required state**: 9 PayloadTypes: float, int, vec2, vec3, color, phase, bool, unit, shape2d (or keep as 'shape' if R-1 decides phase stays as unit)
**Suggested approach**: Add vec3 to PayloadType union. Rename shape→shape2d. Add corresponding ALLOWED_UNITS entries. Add stride lookup function. Defer phase/unit PayloadTypes pending R-1 decision.

**Depends on**: R-1 decision (phase representation)
**Blocks**: U-19 (stride-aware allocation), U-26 (3D coordinates)
