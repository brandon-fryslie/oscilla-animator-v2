---
parent: ../INDEX.md
topic: multi-component-signals
order: 24
---

# Multi-Component Signal Values

> How stride>1 payloads (vec2, vec3, color) are evaluated and stored.

**Related Topics**: [01-type-system](./01-type-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md)

---

## Evaluation Model: Hybrid A+ (T2)

The runtime uses a hybrid evaluation model:

### Scalar Signals (stride=1)
```typescript
evaluateValueExprSignal(exprId, valueExprs, state) → number
```
Standard scalar evaluation. All float/int/bool signals use this path.

### Multi-Component Signals (stride>1)
```typescript
evaluateConstructSignal(expr, valueExprs, state, targetBuffer, targetOffset) → stride
```
Multi-component values (vec2, vec3, color) are represented as `construct` expressions in the IR. Each component is an independent scalar expression. The construct evaluator writes all components contiguously to the target buffer.

### Key Design Decisions

1. **Construct is STRUCTURAL, not COMPUTATIONAL** — no kernel evaluation needed for multi-component packing
2. **Scalar evaluator preserved** — `evaluateValueExprSignal() → number` is unchanged for stride=1
3. **CanonicalType determines strategy** — `payloadStride(payload)` at compile time, not runtime dispatch
4. **Contiguous slot layout** — components occupy consecutive f64 positions in ValueStore

## Slot Allocation (T2)

- `payloadStride(payload)` is the single authority for stride
- Slots are contiguous: a vec3 occupies 3 consecutive f64 positions
- `SlotMetaEntry { slot, offset, stride, payload }` is compiler-emitted metadata
- Compiler invariant: `stride === payloadStride(payload)`

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
| shape2d | 0 | No (opaque handle, separate bank) |
| shape3d | 0 | No (opaque handle, separate bank) |

### Non-Sampleable Payloads

Stride 0 payloads (shape2d, shape3d) are forbidden in numeric slot allocation. They use separate typed banks (Uint32Array) and cannot be evaluated by numeric evaluators.

## Schedule Execution (T2)

The schedule program handles multi-component signals via two mechanisms:

1. **evalValue step**: For construct expressions with stride>1, ScheduleExecutor calls `evaluateConstructSignal()` which writes all components contiguously
2. **slotWriteStrided step** (reserved): Defined in IR types but not currently generated; available for future alternative lowering strategies

Debug tapping records each component separately for stride>1 slots.

## HistoryService Guard (T3)

Stride>1 signals are not tracked by HistoryService (no allocation, no-op). This avoids per-frame array allocation for multi-component history.

---

## Cross-References

- Stride derivation: [01-type-system](./01-type-system.md) (PayloadType)
- Slot allocation: [04-compilation](./04-compilation.md)
- Runtime execution: [05-runtime](./05-runtime.md)
