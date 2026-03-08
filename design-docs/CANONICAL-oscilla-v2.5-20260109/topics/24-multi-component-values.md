---
parent: ../INDEX.md
topic: multi-component-values
order: 24
---

# Multi-Component Values

> How stride > 1 payloads (vec2, vec3, color) are evaluated and stored.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md)

---

## Evaluation Model: Hybrid A+ (T2)

The runtime uses a hybrid evaluation model for scalar and multi-component data:

### Scalar Evaluation (stride=1)
Standard scalar evaluation. All float/int/bool values use this path.

### Multi-Component Evaluation (stride > 1)
Multi-component values (vec2, vec3, color) are represented as `construct` expressions in the Naga IR. Each component is an independent scalar expression. The construct evaluator writes all components contiguously to the target Arena offset.

### Key Design Decisions

1. **Construct is STRUCTURAL, not COMPUTATIONAL** — no kernel evaluation needed for multi-component packing.
2. **CanonicalType determines strategy** — `payloadStride(payload)` at compile time, not runtime dispatch.
3. **Contiguous Slot Layout** — components occupy consecutive offsets in the Arena.

## Arena Allocation (T2)

- `payloadStride(payload)` is the single authority for stride.
- Slots are contiguous: a `vec3` occupies 3 consecutive f32 positions in the Arena.
- `GpuLayout` is the single source of truth for byte offsets.

### Stride Table

| Payload | Stride | Sampleable |
|---------|--------|------------|
| float | 1 | Yes |
| int | 1 | Yes |
| bool | 1 | Yes |
| vec2 | 2 | Yes |
| vec3 | 3 | Yes |
| color | 4 | Yes |
| cameraProjection | 1 | Yes |
| shape2d | 1 | Handle (u32) |
| shape3d | 1 | Handle (u32) |

---

## Cross-References

- Stride derivation: [01-type-system](./01-type-system.md) (PayloadType)
- Slot allocation: [04-compilation](./04-compilation.md)
- Runtime execution: [05-runtime](./05-runtime.md)
