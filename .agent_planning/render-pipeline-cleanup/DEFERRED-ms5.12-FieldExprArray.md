# Deferred: ms5.12 - FieldExprArray Placeholder

**Bead:** oscilla-animator-v2-ms5.12
**Title:** Replace FieldExprArray placeholder with real element-value materialization
**Priority:** P3
**Confidence:** LOW
**Status:** DEFERRED (Future Feature)

## Why Deferred

This is a **future capability**, not technical debt. The placeholder exists for when custom domain types (e.g., SVG elements, complex shapes) need per-element value materialization beyond the current position/color/shape paradigm.

Current system handles:
- Scalar fields (float, int)
- Vector fields (vec2, vec3)
- Color fields

Not yet needed:
- Element-typed fields (custom domain objects)

## Location

File: `src/runtime/Materializer.ts:379`
```typescript
// TODO: Support actual element values when blocks provide them
```

## When to Implement

Implement when:
1. Custom domain types are added (e.g., SVG path elements)
2. Blocks need to emit element-typed field values
3. User-defined element types require materialization

## Scope Estimate

Medium complexity:
- Define element value serialization format
- Extend Materializer to handle element types
- Update FieldExpr type system for element values
- Add tests for element materialization

## Recommendation

Keep bead open but deprioritized. Close ms5 epic without this item - it represents future work, not debt from the render pipeline cleanup.
