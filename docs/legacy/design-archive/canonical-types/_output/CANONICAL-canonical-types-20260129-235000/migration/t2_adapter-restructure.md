---
parent: ../INDEX.md
topic: migration
tier: 2
---

# Migration: Adapter Restructure (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [CanonicalType](../type-system/t1_canonical-type.md)
**Related Topics**: [Type System](../type-system/), [Validation](../validation/)

---

## Overview

The adapter system is being restructured to match on `CanonicalType` patterns (5-axis extent-aware) rather than the flattened `TypeSignature` (2-axis: cardinality + temporality only).

## Resolution A2: Full Restructure

### Old System

```typescript
// DEPRECATED
type TypeSignature = {
  payload: PayloadType;
  unit: string;        // flat unit name
  cardinality: string; // 'one' | 'many'
  temporality: string; // 'continuous' | 'discrete'
};
```

Only matched on 2 of 5 axes. Could not express perspective or binding-aware adapters.

### New System

#### TypePattern

```typescript
type TypePattern = {
  readonly payload?: PayloadType | PayloadPattern;
  readonly unit?: UnitType | UnitPattern;
  readonly extent?: ExtentPattern;
};
```

Patterns can match specific values or use wildcards. An omitted field matches anything.

#### ExtentPattern

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

#### ExtentTransform

```typescript
type ExtentTransform = {
  // Which axes this adapter changes
  readonly cardinality?: CardinalityTransform;
  readonly temporality?: TemporalityTransform;
  readonly binding?: BindingTransform;
  readonly perspective?: PerspectiveTransform;
  readonly branch?: BranchTransform;
};
```

Declares exactly what axes an adapter modifies. Unchanged axes are preserved.

### AdapterSpec

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

### Key Principles

1. **Adapter matching is purely on CanonicalType patterns**: No special-casing by node type or "where it came from"
2. **Adapters don't "permit" invalid types**: An adapter describes insertion of an already-valid block. It doesn't override the validation gate.
3. **Adapter spec types live in `src/blocks/`**: Not in `src/graph/adapters.ts`. Adapters are block metadata, not graph normalization concerns.
4. **Auto-insert is optional UX policy**: The adapter catalog defines what adapters exist. Whether they're auto-inserted is a frontend transform decision, separate from type soundness.

---

## See Also

- [Unit Restructure](./t2_unit-restructure.md) - Adapters operate on structured units
- [ValueExpr](./t2_value-expr.md) - Adapter blocks produce ValueExpr
- [Enforcement Gate](../validation/t1_enforcement-gate.md) - Guardrail 13 (adapter policy vs soundness)
