# payloadVar System Implementation

**Status:** PLANNING
**Created:** 2026-01-25
**Sprint:** payload-var-system

## Objective

Create a `payloadVar` system parallel to `unitVar` that allows blocks to be truly payload-polymorphic with constraint solving for type inference.

## Problem Statement

Currently, blocks like Broadcast hardcode payload types as `'float'` in port definitions:
```typescript
signal: { type: canonicalType('float', unitVar('broadcast_in')) }
```

This prevents true polymorphism—the definition type payload is `'float'` but the actual connected signal might be `'vec3'`. Pass 0 infers the correct payload and stores it in `block.params.payloadType`, but Pass 2 sees a type mismatch because the port definition still has `'float'`.

**Error Example:**
```
NoConversionPath: cannot connect one+continuous<vec3, unit:world3>
  to one+continuous<float, unit:world3>
  (FieldPolarToCartesian.pos -> Broadcast.signal)
```

## Solution

Introduce `payloadVar()` which creates unresolved payload type variables that get resolved via constraint solving, mirroring the `unitVar` pattern.

**After:**
```typescript
signal: { type: canonicalType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) }
```

## Success Criteria

- [ ] Broadcast block accepts any payload from input (not just float)
- [ ] Broadcast block preserves both payload AND unit from input
- [ ] FieldPolarToCartesian → Broadcast → RenderInstances2D compiles without type errors
- [ ] All existing tests pass (no regressions)
- [ ] Clear error messages for unresolved/conflicting payloads

## Key Files

| File | Change Type |
|------|-------------|
| `src/core/canonical-types.ts` | Add payloadVar type & helpers |
| `src/compiler/passes-v2/pass1-type-constraints.ts` | Add PayloadUnionFind, collect payload constraints |
| `src/compiler/passes-v2/pass2-types.ts` | Apply resolved payloads from map |
| `src/blocks/field-blocks.ts` | Update Broadcast to use payloadVar |
| `src/blocks/registry.ts` | Update ALL_CONCRETE_PAYLOADS, add isPayloadVar check |

## Related Work

- unitVar system already implemented and working
- Broadcast block already has unitVar for unit polymorphism (in field-blocks.ts)
- Pass 0 payload resolution exists but uses params storage, not constraint solving
