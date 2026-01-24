---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 3
priority_reasoning: CombineMode structural issue. Missing PayloadTypes. No stride table.
---

# Topic 01: Type System — Critical Gaps

## Items

### C-1: CombineMode is flat string union, not discriminated union
**Problem**: CombineMode is `'last' | 'first' | 'sum' | 'average' | 'max' | 'min'` — a flat string union. Spec requires discriminated union with semantic grouping (numeric: sum/avg/min/max/mul, any: last/first/layer, boolean: or/and). Also missing `mul`, `layer`, `or`, `and` modes.
**Evidence**: src/types/index.ts:140-146 — flat string literal union
**Obvious fix?**: Yes — restructure to discriminated union, add missing modes (note: `layer` on shape2d is explicitly disallowed per 3D spec, so only allow on numeric/boolean payloads).

### C-2: PayloadType missing vec3, phase, unit, shape2d
**Problem**: PayloadType is `'float' | 'int' | 'vec2' | 'color' | 'bool' | 'shape'`. Spec requires `'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'phase' | 'bool' | 'unit' | 'shape2d'`. Missing: vec3/phase/unit/shape2d (shape2d may just be rename of shape).
**Evidence**: src/core/canonical-types.ts:120-126
**Obvious fix?**: Partially — adding vec3/unit is straightforward. Phase is complex because the current design uses `float + unit:phase01` instead of a distinct PayloadType. shape→shape2d is a rename.

### C-23: No stride table in type system
**Problem**: Spec defines explicit stride per PayloadType (float=1, int=1, phase=1, bool=1, unit=1, vec2=2, vec3=3, color=4, shape2d=8). No canonical stride table exists in the type system module. Stride only appears in scattered IR state mappings.
**Evidence**: src/core/canonical-types.ts — no STRIDE constant or strideOf() function
**Obvious fix?**: Yes — add `STRIDE: Record<PayloadType, number>` constant to canonical-types.ts
