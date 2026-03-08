---
parent: ../INDEX.md
topic: lens-system
order: 26
---

# Lens System

> Port-attached value transformations that compile to blocks.

**Related Topics**: [02-block-system](./02-block-system.md), [14-modulation-table-ui](./14-modulation-table-ui.md), [01-type-system](./01-type-system.md)

---

## What is a Lens? (T2)

A Lens is a value transformation attached to a **port** (input or output) that compiles to actual blocks in the patch. Lenses are NOT a separate type system — they are regular blocks used in a decorator pattern.

**Key properties**:
- Attached to ports, not edges.
- Can be attached to both input ports and output ports.
- Compile to standalone blocks via a separate lens expansion pass.
- There is no "lens catalog" — there is a block catalog, and blocks can be used as lenses.

## Lens vs Adapter (T2)

- **Adapter**: Changes type compatibility (e.g., scalar→array broadcast, HSL→RGB color conversion).
- **Lens**: Changes values without changing type compatibility (e.g., Scale+Bias, Clamp, Slew).

Both compile to blocks. The distinction is semantic, not structural.

## Lens Categories (T3)

| Category | Examples | Description |
|----------|----------|-------------|
| Value shaping | Scale, Bias, Scale+Bias, Clamp, Wrap01, Fold, Deadzone | Remap value range |
| Dynamics | Slew/Lag, Delay, Accumulator | Time-domain smoothing |
| Quantization | StepQuantize, SnapToSet | Discretize values |
| Curves | Smoothstep, Power/Gamma, Ease family | Nonlinear remapping |
| Noise | AddDither, Jitter | Controlled randomization |
| Cardinality | Broadcast, Reduce | Cardinality transforms (overlap with adapters) |
| Structural | Extract, Construct, Swizzle | Component-level operations |
| Units | UnitConvert, Saturate01 | Unit conversion (overlap with adapters) |

## Normalized Unit Policy (cross-reference)

See [01-type-system](./01-type-system.md) for the normalized unit policy governing when to use 0..1 vs natural units. Lenses like Wrap01, Clamp, NormalizeRange, DenormalizeRange are tools for enforcing these conventions.

---

## Cross-References

- Block catalog: [02-block-system](./02-block-system.md)
- Modulation table UI (lens display): [14-modulation-table-ui](./14-modulation-table-ui.md)
- Unit conventions: [01-type-system](./01-type-system.md)
