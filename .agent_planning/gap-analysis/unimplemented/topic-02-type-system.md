---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t3_const-value.md
category: unimplemented
audited: 2026-01-29
item_count: 2
---

# Topic 02: Type System — Unimplemented Gaps

## Items

### U-1: canonicalConst() constructor not implemented
**Problem**: Spec defines `canonicalConst(payload, unit)` for compile-time constants with cardinality=zero. No such constructor exists.
**Evidence**: Grep for `canonicalConst` returns zero hits in `src/`. Spec `t2_derived-classifications.md:98-101`.
**Impact**: Without this constructor, compile-time constants must be manually constructed with explicit extent overrides. The `worldToAxes('static')` helper does produce `cardinality: { kind: 'zero' }` but there's no dedicated canonical constructor.

### U-2: ValueExprConst using `kind: 'const'` discriminant not verified
**Problem**: Spec says `ValueExprConst = { kind: 'const', type: CanonicalType, value: ConstValue }`. Need to verify this pattern is used consistently in IR value expressions. The spec also defines the EventExprNever pattern (const bool false with canonicalEventOne type).
**Evidence**: Spec `t3_const-value.md:43-48,55-60`. Not verified whether IR value expressions follow this exact shape.
**Impact**: Low — this is a T3 (optional) spec item. If value expressions use a different const pattern, it's likely fine as long as ConstValue matching is enforced.
