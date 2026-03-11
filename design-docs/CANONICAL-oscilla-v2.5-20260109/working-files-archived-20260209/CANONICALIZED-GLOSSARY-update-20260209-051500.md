---
command: /canonicalize-docs
files: design-docs/_new/lenses/01-base-lenses.md design-docs/_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md design-docs/_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md design-docs/_new/pure-lowering-blocks/01-macro-lowering.md design-docs/_new/colors/01-colors.md design-docs/_new/colors/02-color-units.md design-docs/_new/P0-Multi-Component-Signals.md design-docs/_new/normalized-units.md design-docs/_new/MultiValueSignals.md design-docs/_new/01-cardinality-type-var.md design-docs/_new/01-obligations.md
indexed: true
---

# Glossary Update — 2026-02-09

## New Terms

### LowerSandbox

**Definition**: Constrained IR builder that enforces purity during block lowering. Provides a capability-based API (emitConst, emitOp, emitKernel, emitExtract, emitConstruct, readRail) while preventing graph mutation, global state access, or scheduling side effects.

**Type**: concept (compilation component)

**Source**: `01-macro-lowering.md`

**Note**: Used for both regular block lowering and macro lowering (invoking other blocks' lower() as IR libraries).

---

### LowerEffects

**Definition**: Declarative data describing side effects requested by a lowerer — state cell requests, kernel registrations, intrinsic dependencies. A separate compiler stage consumes effects; lowerers never schedule directly.

**Type**: type

**Source**: `01-macro-lowering.md`

**Note**: Part of the effects-as-data model. Lowerers return `exprOutputs + effects?`.

---

### Obligation

**Definition**: A declarative request to produce graph structure later, once specific facts are known (types, cardinality, instance identity). Must be deterministic, anchored (stable ID), and total (materializes or produces diagnostic).

**Type**: concept

**Source**: `01-obligations.md`

**Note**: Part of Obligation-Driven Normalization (ODN). Adoption status depends on Q4 resolution.

---

### ObligationKind

**Definition**: Discriminated union of obligation categories: `missingInput`, `coerce`, `lens`, `busJunction`.

**Type**: type

**Source**: `01-obligations.md`

---

### DefaultPolicyTable

**Definition**: Type-indexed resolution table for choosing default producers for unconnected inputs. Pure function: `resolve(policyKey, targetType, targetPort) → DefaultProducerPlan | Diagnostic`.

**Type**: concept

**Source**: `01-macro-lowering.md`, `01-obligations.md`

**Note**: Enables per-port semantic defaults (render.pos → vec2(0.5,0.5), render.color → palette).

---

### DefaultProducerPlan

**Definition**: Discriminated union describing how to produce a default value: `const`, `fieldConst`, `rail`, `block` (macro expansion), or `error`.

**Type**: type

**Source**: `01-macro-lowering.md`

---

### SlotMetaEntry

**Definition**: Compiler-emitted metadata for each allocated slot: slot ID, base offset, stride, and payload type.

**Type**: type

**Source**: `MultiValueSignals.md`

**Structure**:
```typescript
interface SlotMetaEntry {
  readonly slot: ValueSlot;
  readonly offset: number;
  readonly stride: 0|1|2|3|4;
  readonly payload: PayloadType;
}
```

**Note**: `stride === payloadStride(payload)` is a compiler invariant.

---

### Sampleable

**Definition**: A payload is "sampleable" iff `payloadStride(payload) > 0`. Payloads with stride=0 (shape2d, shape3d) are forbidden where numeric slots are required.

**Type**: concept

**Source**: `MultiValueSignals.md`

---

### ColorPicker

**Definition**: Constant authoring source block producing a user-space OKLCH+A color. Parameters (h, s, l, a) are UI-controlled, not graph inputs.

**Type**: block

**Source**: `01-colors.md`

---

### MakeColorOKLCH

**Definition**: Pack scalar h, s, l, a channels into a `color` payload with OKLCH unit. Enforces color validity: wrap hue, clamp others.

**Type**: block

**Source**: `01-colors.md`

**Note**: The enforcement point for OKLCH color validity.

---

### SplitColorOKLCH

**Definition**: Unpack a `color` payload with OKLCH unit into scalar h, s, l, a channels.

**Type**: block

**Source**: `01-colors.md`

---

### OklchToRgba

**Definition**: Adapter block converting `color` payload from OKLCH unit to RGBA01 unit. The only place OKLCH→RGB conversion occurs.

**Type**: block (adapter)

**Source**: `01-colors.md`

---

### Macro Lowering

**Definition**: Technique of invoking existing blocks' `lower()` functions through a LowerSandbox to produce IR without creating graph nodes. Used by DefaultSource to compose defaults from existing block semantics.

**Type**: concept (compilation technique)

**Source**: `01-macro-lowering.md`

**Note**: Keeps block semantics as single source of truth. If HueRainbow changes, the default changes automatically.

---

## Conflicting Terms (RESOLVED)

### Color UnitType Sub-Field — RESOLVED (Q2)

**Resolution**: Use `unit` (not `space`). Consistent with all other UnitType kinds.
- `{ kind: 'color', unit: 'rgba01' }` — RGB+A color space
- `{ kind: 'color', unit: 'oklch' }` — OKLCH+A color space (NEW)

### UnitType Scalar Kind — RESOLVED (Q3)

**Resolution**: Remove `scalar` and `norm01`. 6 concrete kinds: `none | count | angle | time | space | color`.

---

## Complementary Definitions (New Detail for Existing Terms)

### Stride (existing term — add detail)

**Add**: "Stride 0 is a valid classification for non-sampleable payloads (shape2d, shape3d). Stride 0 values cannot be stored in numeric slots and are never evaluated by numeric evaluators."

### Lens (existing term — add detail)

**Add to examples**: The minimal ship set comprises 10 lenses:
1. Scale+Bias (value shaping)
2. Clamp (value shaping)
3. Wrap01 (phase/hue hygiene)
4. Slew/Lag (dynamics)
5. StepQuantize (discretization)
6. Smoothstep (curves)
7. Broadcast (signal→field)
8. Reduce (field→signal: avg/sum/min/max)
9. Mask (gate/hold)
10. Extract/Construct (structural)

### DefaultSource (existing in DerivedBlockMeta — add detail)

**Add**: "DefaultSource is a polymorphic structural block whose output type uses payload and unit variables. Its lower() function dispatches on the resolved type via a DefaultPolicyTable, potentially invoking other blocks' lowerers as macros through a LowerSandbox."

---

## Proposed New Forbidden Terms

| Forbidden | Canonical Term | Reason |
|-----------|---------------|--------|
| `evaluateSignal() → number` (for stride>1) | `evaluateSigExprInto()` or strided write | Multi-component signals require stride-aware evaluation |
| `loweringPurity: 'impure'` blocks in macro expansion | `loweringPurity: 'pure'` or `'stateful'` blocks only | Macro expansion requires deterministic lowering |
| `ChannelType` (for color) | `UnitType { kind: 'color' }` | Color space is a unit, not a separate type |
