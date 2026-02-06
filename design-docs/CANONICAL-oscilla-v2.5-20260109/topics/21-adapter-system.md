---
parent: ../INDEX.md
topic: adapter-system
order: 21
---

# Adapter System (Type Pattern Matching & Transforms)

> Extent-aware type matching and conversion via explicit adapter blocks.

**Related Topics**: [01-type-system](./01-type-system.md), [20-type-validation](./20-type-validation.md), [02-block-system](./02-block-system.md)
**Key Terms**: [TypePattern](../GLOSSARY.md#typepattern), [ExtentPattern](../GLOSSARY.md#extentpattern), [AdapterSpec](../GLOSSARY.md#adapterspec)

---

## Overview

The adapter system enables type conversion between mismatched ports by inserting explicit adapter blocks. It matches on `CanonicalType` patterns (5-axis extent-aware) rather than flattened 2-axis signatures.

---

## TypePattern

```typescript
type TypePattern = {
  readonly payload?: PayloadType | PayloadPattern;
  readonly unit?: UnitType | UnitPattern;
  readonly extent?: ExtentPattern;
};
```

Patterns can match specific values or use wildcards. An omitted field matches anything.

---

## ExtentPattern

```typescript
type ExtentPattern = {
  readonly cardinality?: CardinalityPattern;
  readonly temporality?: TemporalityPattern;
  readonly binding?: BindingPattern;
  readonly perspective?: PerspectivePattern;
  readonly branch?: BranchPattern;
};
```

Each axis pattern can match specific values, wildcards, or constrained ranges.

---

## ExtentTransform

```typescript
type ExtentTransform = {
  readonly cardinality?: CardinalityTransform;
  readonly temporality?: TemporalityTransform;
  readonly binding?: BindingTransform;
  readonly perspective?: PerspectiveTransform;
  readonly branch?: BranchTransform;
};
```

Declares exactly what axes an adapter modifies. Unchanged axes are preserved.

---

## AdapterSpec

```typescript
type AdapterSpec = {
  readonly id: AdapterSpecId;
  readonly name: string;
  readonly from: TypePattern;
  readonly to: TypePattern;
  readonly transform: ExtentTransform;
  readonly purity: 'pure';      // MANDATORY
  readonly stability: 'stable';  // MANDATORY
  readonly blockId: BlockId;     // Which block implements this adapter
};
```

**Mandatory fields**:
- `purity: 'pure'` — adapters must be pure (no side effects, no state)
- `stability: 'stable'` — adapters must produce deterministic output for same input

These are mandatory even if all current adapters satisfy them, to prevent future non-conforming adapters from being added without deliberate waiver.

---

## Key Principles

1. **Adapter matching is purely on CanonicalType patterns**: No special-casing by node type or "where it came from"
2. **Adapters don't "permit" invalid types**: An adapter describes insertion of an already-valid block. It doesn't override the validation gate.
3. **Adapter spec types live in `src/blocks/`**: Not in `src/graph/adapters.ts`. Adapters are block metadata, not graph normalization concerns.
4. **Auto-insert is optional UX policy**: The adapter catalog defines what adapters exist. Whether they're auto-inserted is a frontend transform decision, separate from type soundness (Guardrail 13).

---

## See Also

- [01-type-system](./01-type-system.md) - CanonicalType and axis definitions
- [20-type-validation](./20-type-validation.md) - Guardrail 13 (adapter policy vs soundness)
- [02-block-system](./02-block-system.md) - Adapter blocks as block definitions
- [14-modulation-table-ui](./14-modulation-table-ui.md) - UI for adapter/transform chains
