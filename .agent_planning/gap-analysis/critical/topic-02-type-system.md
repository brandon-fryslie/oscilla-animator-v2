---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t1_canonical-type.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_extent-axes.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t3_const-value.md
category: critical
audited: 2026-01-29
item_count: 5
priority_reasoning: >
  UnitType structure diverges significantly from spec (flat vs structured nesting).
  PayloadType includes 'shape' which is not in spec. Stride is stored on payload
  objects rather than being derived-only. payloadStride() returns wrong type and
  wrong value for shape/cameraProjection. ConstValue for cameraProjection uses
  string instead of number[].
---

# Topic 02: Type System — Critical Gaps

## Items

### C-1: UnitType structure diverges from spec — flat kinds vs structured nesting
**Problem**: Spec requires 8 structured kinds with nesting:
```
{ kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
{ kind: 'time'; unit: 'ms' | 'seconds' }
{ kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
```
Implementation uses 15 flat kinds: `'phase01'`, `'radians'`, `'degrees'`, `'deg'`, `'ms'`, `'seconds'`, `'ndc2'`, `'ndc3'`, `'world2'`, `'world3'`, etc.
**Evidence**: `src/core/canonical-types.ts:44-59` — 15 flat unit kinds. Spec `t1_canonical-type.md:51-59` — 8 structured kinds.
**Obvious fix?**: No. Requires restructuring UnitType from flat to nested, updating all `unit.kind` checks to `unit.kind + unit.unit` or `unit.kind + unit.space + unit.dims`. Also: implementation has `'deg'` as a separate kind (alias for degrees) which the spec does not include; implementation has `'phase01'` as a top-level kind, but spec puts it under `{ kind: 'angle'; unit: 'phase01' }`.

### C-2: PayloadType includes 'shape' (stride=8) which is not in spec
**Problem**: Spec defines 7 payload kinds: `float, int, bool, vec2, vec3, color, cameraProjection`. Implementation adds an 8th: `{ kind: 'shape'; stride: 8 }`.
**Evidence**: `src/core/canonical-types.ts:170` — `{ readonly kind: 'shape'; readonly stride: 8 }`. Spec `t1_canonical-type.md:31-38` — no 'shape' kind.
**Obvious fix?**: No. Depends on whether 'shape' is a legitimate extension or should be modeled differently (e.g., as a domain resource rather than a payload).

### C-3: Stride stored on ConcretePayloadType objects, not derived-only
**Problem**: Spec says "Stride is ALWAYS derived from payload, never stored separately" and defines `payloadStride(payload)` as the single source. Implementation bakes stride into `ConcretePayloadType` as `{ kind: 'float'; stride: 1 }` and also has a `payloadStride()` function that does NOT use the stored stride — it re-derives from `kind` via a switch statement.
**Evidence**: `src/core/canonical-types.ts:163-171` — stride field on every payload variant. `src/core/canonical-types.ts:815-826` — `payloadStride()` ignores `.stride`, uses switch. `src/core/canonical-types.ts:382-389` — `strideOf()` reads `.stride` from the object.
**Obvious fix?**: Partially. The dual paths (`strideOf` reads field, `payloadStride` uses switch) means there are TWO stride sources which can diverge. Spec says derive-only. The `.stride` field on `ConcretePayloadType` violates the "never stored separately" rule. However, the stored stride is correct by construction (singletons), so divergence is currently impossible.

### C-4: payloadStride() has wrong return type and wrong value for shape/cameraProjection
**Problem**: `payloadStride()` returns `1 | 2 | 3 | 4` but `shape` has stride 8 and spec says `cameraProjection` should have stride 16 (4x4 matrix). The function's `default` case returns 1 for both `shape` and `cameraProjection`, contradicting the stored `.stride: 8` on shape and the spec's stride 16 for cameraProjection.
**Evidence**: `src/core/canonical-types.ts:815` — `payloadStride(p: PayloadType): 1 | 2 | 3 | 4`. Line 824: `default: return 1` covers shape (should be 8), int (correct at 1), bool (correct at 1), cameraProjection (spec says 16, stored as 1).
**Obvious fix?**: Yes for the return type (widen to `number`). For cameraProjection stride, the implementation says 1 (it stores an enum string, not a 4x4 matrix) — this is a deeper design divergence from the spec.

### C-5: ConstValue for cameraProjection uses string instead of number[]
**Problem**: Spec says `{ kind: 'cameraProjection'; value: number[] }` (4x4 matrix). Implementation says `{ kind: 'cameraProjection'; value: string }`.
**Evidence**: `src/core/canonical-types.ts:298` — `{ readonly kind: 'cameraProjection'; readonly value: string }`. Spec `t3_const-value.md:27` — `{ kind: 'cameraProjection'; value: number[] }`.
**Obvious fix?**: Yes, but depends on how cameraProjection is actually used (if it's an enum name like "perspective"/"orthographic" then string makes sense for the current implementation; the spec envisions a full matrix).
