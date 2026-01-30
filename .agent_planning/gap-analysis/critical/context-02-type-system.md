---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t1_canonical-type.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_extent-axes.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t3_const-value.md
category: critical
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
priority: P2
---

# Context: Topic 02 — Type System (Critical)

## What the Spec Requires

### t1_canonical-type.md
1. `CanonicalType = { payload: PayloadType, unit: UnitType, extent: Extent }` — single type authority
2. PayloadType is a closed set of 7 kinds: float, int, bool, vec2, vec3, color, cameraProjection
3. Each payload kind implies a stride via `payloadStride()`: float=1, int=1, bool=1, vec2=2, vec3=3, color=4, cameraProjection=16
4. Stride is ALWAYS derived from payload, never stored separately
5. UnitType has 8 structured top-level kinds: none, scalar, norm01, count, angle{radians|degrees|phase01}, time{ms|seconds}, space{ndc|world|view, dims:2|3}, color{rgba01}
6. No `{ kind: 'var' }` inside UnitType — unit vars only exist in inference wrappers
7. `defaultUnitForPayload()` is NOT used by type checking, only UI display
8. Axis<T,V> = `{ kind: 'var'; var: V }` | `{ kind: 'inst'; value: T }`
9. AxisTag<T> (default/instantiated) is deprecated and MUST NOT be used
10. `var` branches must not escape frontend into backend/runtime/renderer
11. Every value has a type; no value-producing expr/slot without `type: CanonicalType`

### t2_extent-axes.md
12. 5 independent axes: cardinality, temporality, binding, perspective, branch
13. Defaults: cardinality=one, temporality=continuous, binding=unbound, perspective=default, branch=default
14. `canonicalSignal` defaults unit to `{ kind: 'scalar' }` — intentional asymmetry
15. `canonicalField` requires explicit unit — no default
16. Events require temporality=discrete, payload=bool, unit=none (post-validation)
17. Fields require cardinality=many(instance) (post-validation)

### t2_derived-classifications.md
18. `deriveKind()` is total and deterministic: discrete=>event, many=>field, else=>signal
19. cardinality=zero derives as 'signal' (compile-time scalar)
20. Boolean helpers: `isSignalType`, `isFieldType`, `isEventType` — never throw
21. Assertion helpers: `requireSignalType`, `requireFieldType` (returns InstanceRef), `requireEventType`
22. `getManyInstance` is deprecated; replaced by `tryGetManyInstance` (returns null) and `requireManyInstance` (throws)
23. `payloadStride(payload)` returns stride: float=1, int=1, bool=1, vec2=2, vec3=3, color=4, cameraProjection=16
24. Constructor `canonicalConst(payload, unit)` — cardinality=zero
25. Constructor `canonicalEventField(instance)` — many+discrete+bool+none

### t3_const-value.md
26. ConstValue is discriminated union keyed by payload kind
27. `constValueMatchesPayload(cv, payload)` validates kind match
28. ValueExprConst: `{ kind: 'const', type: CanonicalType, value: ConstValue }`
29. EventExprNever pattern: `{ kind: 'const', type: canonicalEventOne(), value: { kind: 'bool', value: false } }`
30. cameraProjection ConstValue: `{ kind: 'cameraProjection'; value: number[] }` (4x4 matrix)

## Current State (Topic-Level)

### How It Works Now

The implementation in `src/core/canonical-types.ts` is largely conformant. CanonicalType has the correct triple structure. The Axis<T,V> pattern matches spec. Canonical constructors exist for signal, field, event-one, event-field. `deriveKind()` works correctly with the priority rule. Instance helpers (`tryGetManyInstance`, `requireManyInstance`) match spec. `constValueMatchesPayload()` exists.

The major structural divergence is UnitType: the implementation uses a flat discriminated union with 15 kinds (e.g., `'phase01'`, `'radians'`, `'ndc2'`, `'world3'`) instead of the spec's 8 structured kinds with nesting (e.g., `{ kind: 'angle', unit: 'phase01' }`). This is a significant API shape difference.

PayloadType adds `'shape'` (stride=8) not in spec. ConcretePayloadType bakes stride into the type object. `payloadStride()` and `strideOf()` provide two stride paths that could theoretically diverge. cameraProjection is modeled as stride=1 with string values, not stride=16 with number[].

### Patterns to Follow

- All types defined in `src/core/canonical-types.ts` (single source)
- Re-exported through `src/types/index.ts`
- Constructors return frozen/readonly objects
- Singletons (FLOAT, INT, etc.) for payload constants

## Work Items

### WI-1: Restructure UnitType from flat to structured nesting
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: UnitType has 8 structured top-level kinds with nested sub-kinds
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | UnitType definition + constructors | 44-76, 91-148 |
| `src/graph/adapters.ts` | Unit comparison in adapter logic | all |
| `src/ui/reactFlowEditor/typeValidation.ts` | UI unit display | all |
| `src/compiler/frontend/analyze-type-constraints.ts` | Type inference | all |

**Current state**: 15 flat unit kinds
**Required state**: 8 structured kinds: `none | scalar | norm01 | count | angle{radians|degrees|phase01} | time{ms|seconds} | space{ndc|world|view,dims:2|3} | color{rgba01}`
**Suggested approach**: Redefine UnitType as the structured union. Update `unitsEqual()` to compare nested fields. Update all unit constructors. Update every `unit.kind` check to handle nested structure. Remove `'deg'` alias (not in spec). This is a large refactor touching ~9 files.
**Depends on**: none
**Blocks**: Full spec conformance for unit system

### WI-2: Resolve 'shape' payload kind (not in spec)
**Category**: CRITICAL
**Priority**: P3
**Spec requirement**: PayloadType is a closed set of 7 kinds (no 'shape')
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | SHAPE constant, ConcretePayloadType | 170, 195 |
| `src/blocks/render-blocks.ts` | Uses SHAPE for render block ports | various |

**Current state**: `'shape'` with stride 8 exists as a payload kind
**Required state**: Either (a) remove 'shape' and model shape data differently, or (b) formally add 'shape' to the spec as an extension
**Suggested approach**: Evaluate whether shape data needs to be a payload type or can be modeled as a domain resource/parameter. If keeping, document the spec extension.
**Depends on**: none
**Blocks**: nothing directly

### WI-3: Remove stored stride from ConcretePayloadType, unify stride derivation
**Category**: CRITICAL
**Priority**: P3
**Spec requirement**: Stride is ALWAYS derived from payload via `payloadStride()`, never stored separately
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | ConcretePayloadType definition, payloadStride(), strideOf() | 163-171, 382-389, 815-826 |

**Current state**: `.stride` baked into ConcretePayloadType objects; `payloadStride()` ignores it and uses switch; `strideOf()` reads it from object
**Required state**: Single `payloadStride()` function that derives stride from kind. No `.stride` field on ConcretePayloadType. Remove `strideOf()` or make it delegate to `payloadStride()`.
**Suggested approach**: Remove `stride` field from ConcretePayloadType. Update `payloadStride()` to handle all kinds correctly (including shape=8 if kept). Remove or redirect `strideOf()`. Fix return type from `1|2|3|4` to `number`.
**Depends on**: WI-2 (need to know if shape stays)
**Blocks**: nothing directly

### WI-4: Fix payloadStride() return type and cameraProjection stride
**Category**: CRITICAL
**Priority**: P2
**Spec requirement**: payloadStride returns correct stride per kind; cameraProjection=16
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | payloadStride() | 815-826 |

**Current state**: Returns `1|2|3|4`, defaults to 1 for shape (should be 8) and cameraProjection (spec says 16, impl uses string enum so 1 may be intentional)
**Required state**: Return type widened to `number`. Correct strides for all kinds.
**Suggested approach**: Widen return type. Add explicit cases for shape and cameraProjection. The cameraProjection stride depends on whether it stays as an enum-string (stride 1) or becomes a matrix (stride 16).
**Depends on**: WI-2, WI-3
**Blocks**: Correct buffer allocation for all payload types

### WI-5: Fix ConstValue cameraProjection type (string vs number[])
**Category**: CRITICAL
**Priority**: P4
**Spec requirement**: `{ kind: 'cameraProjection'; value: number[] }` (4x4 matrix)
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | ConstValue union | 298 |
| `src/core/canonical-types.ts` | cameraProjectionConst() | 369-371 |

**Current state**: `{ kind: 'cameraProjection'; value: string }`
**Required state**: `{ kind: 'cameraProjection'; value: number[] }` (if adopting spec's matrix model)
**Suggested approach**: Depends on whether cameraProjection represents an enum or a full projection matrix. If matrix, change `value` to `number[]` (length 16). If enum, document the spec divergence.
**Depends on**: Camera system design decision
**Blocks**: nothing directly
