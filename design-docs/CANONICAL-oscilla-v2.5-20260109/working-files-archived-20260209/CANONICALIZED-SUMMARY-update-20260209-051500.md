---
command: /canonicalize-docs
files: design-docs/_new/lenses/01-base-lenses.md design-docs/_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md design-docs/_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md design-docs/_new/pure-lowering-blocks/01-macro-lowering.md design-docs/_new/colors/01-colors.md design-docs/_new/colors/02-color-units.md design-docs/_new/P0-Multi-Component-Signals.md design-docs/_new/normalized-units.md design-docs/_new/MultiValueSignals.md design-docs/_new/01-cardinality-type-var.md design-docs/_new/01-obligations.md
indexed: true
source_files:
  - design-docs/_new/lenses/01-base-lenses.md
  - design-docs/_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md
  - design-docs/_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md
  - design-docs/_new/pure-lowering-blocks/01-macro-lowering.md
  - design-docs/_new/colors/01-colors.md
  - design-docs/_new/colors/02-color-units.md
  - design-docs/_new/P0-Multi-Component-Signals.md
  - design-docs/_new/normalized-units.md
  - design-docs/_new/MultiValueSignals.md
  - design-docs/_new/01-cardinality-type-var.md
  - design-docs/_new/01-obligations.md
---

# Canonicalization Summary — Update 2026-02-09

## Overview

11 new source documents analyzed covering 6 major topic areas. These documents extend the canonical spec into color system, multi-component signals, pure lowering, lens catalog, obligation-driven normalization, and cardinality type variables.

**Existing canonical**: 22 topics, 106 sources, 124 resolutions
**New sources**: 11 files
**New topics created**: 4 (Topics 23-26: Color, Multi-Component Signals, Pure Lowering, Lens System)
**Existing topics updated**: 3 (Topics 01, 04, 05)
**All contradictions resolved**: 8/8 (Q1-Q8)
**New resolutions**: 10 (R125-R134)
**Final canonical**: 26 topics, 117 sources, 134 resolutions

**STATUS: INTEGRATION COMPLETE** — All items resolved, topics created/updated, GLOSSARY and INDEX updated.

---

## New Source Documents Analyzed

### Group 1: Color System (2 files)

| File | Content | Size |
|------|---------|------|
| `_new/colors/01-colors.md` | Color block catalog: ColorPicker, MakeColorOKLCH, SplitColorOKLCH, HueShift, MixColor, AlphaMultiply, OklchToRgba | Comprehensive |
| `_new/colors/02-color-units.md` | Using UnitType to distinguish OKLCH vs RGB color spaces; compatibility rules | Focused |

**Key contributions**:
- Complete color block catalog with lowering semantics
- OKLCH color space as new UnitType sub-kind: `{ kind: 'color', space: 'oklch' }`
- Color validity enforcement (wrap hue, clamp saturation/lightness)
- Structural intrinsics for extract/construct operations on color payload
- OKLCH→RGB conversion as explicit adapter block

**Affects existing topics**: [01-type-system](./topics/01-type-system.md) (UnitType extension), [02-block-system](./topics/02-block-system.md) (new block category)

---

### Group 2: Multi-Component Signals (2 files)

| File | Content | Size |
|------|---------|------|
| `_new/P0-Multi-Component-Signals.md` | Strided value slots for vec2/vec3/color signals; scalar evaluator preserved | Comprehensive |
| `_new/MultiValueSignals.md` | Full multi-component spec with generic evaluator; stride-aware slots, debug, history | Very Comprehensive |

**Key contributions**:
- SlotMetaEntry with stride and payload for all allocated slots
- Stride-aware slot allocation: `allocTypedSlot(type)` reserves `stride` consecutive positions
- "Stride 0 = non-sampleable" concept for shape2d/shape3d
- HistoryService guard: stride>1 signals cannot be tracked
- Debug plumbing: `readSignalSampleInto(slot, out)` with stride awareness
- Compiler validations: stride mismatch is compile error

**Internal conflict**: Two competing evaluation models (see Q1 in QUESTIONS)

**Affects existing topics**: [05-runtime](./topics/05-runtime.md), [04-compilation](./topics/04-compilation.md), [08-observation-system](./topics/08-observation-system.md)

---

### Group 3: Pure Lowering / Macro Lowering (3 files)

| File | Content | Size |
|------|---------|------|
| `_new/pure-lowering-blocks/01-macro-lowering.md` | **Primary**: DefaultSource as polymorphic block with pure macro lowering | Comprehensive |
| `_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md` | Source: LowerSandbox pattern, macro lowering design rationale | Supporting |
| `_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md` | Source: Pure lowering enforcement techniques | Supporting |

**Key contributions**:
- **Three-phase separation**: Normalization (insert DefaultSource) → Type Resolution → Lowering (specialize by type)
- **LowerSandbox**: Constrained IR builder enforcing purity (no graph mutation, deterministic, type-correct)
- **Pure lowering contract**: `BlockDef.lower()` is pure function of (resolved types, params, inputs, ctx)
- **Effects-as-data**: Lowerers return `exprOutputs + effects?` — separate compiler stage handles effects
- **Purity tagging**: `loweringPurity: "pure" | "stateful" | "impure"` on BlockDef
- **DefaultSource policy table**: Type-indexed first-match-wins table for choosing defaults
- **Macro trace attribution**: `{ producer: DefaultSource(anchor), expandedUsing: HueRainbow }`

**Affects existing topics**: [04-compilation](./topics/04-compilation.md), [02-block-system](./topics/02-block-system.md)

---

### Group 4: Lens Catalog (1 file)

| File | Content | Size |
|------|---------|------|
| `_new/lenses/01-base-lenses.md` | Comprehensive lens catalog: value shaping, dynamics, quantization, curves, noise, domain/cardinality, structural, units | Catalog |

**Key contributions**:
- **8 categories**: Value shaping, dynamics/time-domain, quantization/discretization, curves/remapping, noise/dither, domain/cardinality, structural (vec/color), units/safety
- **Minimal ship set (10 lenses)**: Scale+Bias, Clamp, Wrap01, Slew/Lag, StepQuantize, Smoothstep, Broadcast, Reduce, Mask, Extract/Construct
- Recognition that Broadcast/Reduce/Mask are domain/cardinality operations (already in canonical as adapters/blocks)
- Extract/Construct as structural operations (vec/color ergonomics)

**Affects existing topics**: [14-modulation-table-ui](./topics/14-modulation-table-ui.md) (lens concept), [02-block-system](./topics/02-block-system.md) (new blocks)

---

### Group 5: Normalized Units (1 file)

| File | Content | Size |
|------|---------|------|
| `_new/normalized-units.md` | Policy: when to normalize to 0..1 vs keep natural units | Focused |

**Key contributions**:
- **Normalize to 0..1**: phase, weights/mix/masks, easings, normalizedIndex
- **Keep natural units**: time (seconds/ms), angles (radians/degrees), positions, velocities
- **Practical rule**: Use UnitType to encode convention; only normalize when unit says so
- **Lens recommendations**: NormalizeRange, DenormalizeRange, Wrap01, Clamp01, Bipolar↔Unipolar

**Affects existing topics**: [01-type-system](./topics/01-type-system.md) (UnitType usage guidance)

---

### Group 6: Type System Extensions (2 files)

| File | Content | Size |
|------|---------|------|
| `_new/01-cardinality-type-var.md` | Cardinality type variable implementation plan for DefaultSource | Comprehensive |
| `_new/01-obligations.md` | Obligation-Driven Normalization (ODN) framework | Very Comprehensive |

**Key contributions (cardinality vars)**:
- InferenceExtent with axis vars on all 5 axes
- DefaultSource uses `cardinalityVar()` in output type
- Extends Substitution with cardinality resolution
- Architectural principle: lower functions MUST NOT check cardinality

**Key contributions (obligations)**:
- **Obligation** abstraction: declarative request for deferred graph structure
- **ObligationKind**: missingInput, coerce, lens, busJunction
- **Pipeline restructuring**: Normalization → Obligations → Solve → Materialize
- **DefaultPolicyTable**: type-indexed resolution with per-port profiles
- **Generic mechanism** for all constraint-dependent derived structure (not just default sources)
- **Diagnostics**: MissingInputDefaultUnresolvable, MissingInputTypeUnconstrained, CoerceImpossible

**Affects existing topics**: [01-type-system](./topics/01-type-system.md), [04-compilation](./topics/04-compilation.md)

---

## Proposed New Topics

### Topic 23: Color System (T2/T3)

**Tier classification**:
- T2: Color space as UnitType extension, OKLCH vs RGB distinction, compatibility rules
- T3: Specific block catalog, lowering details, convenience outputs

**Content from**:
- `01-colors.md` (block catalog, lowering semantics)
- `02-color-units.md` (UnitType extension, compatibility)
- `normalized-units.md` (color normalization conventions, partial)

**Depends on**: Topic 01 (UnitType), Topic 02 (block system), Q2 resolution (sub-field naming)

---

### Topic 24: Multi-Component Signal Values (T2)

**Tier classification**:
- T2: SlotMetaEntry with stride, stride-aware allocation, evaluation contract, compiler validations

**Content from**:
- `P0-Multi-Component-Signals.md` or `MultiValueSignals.md` (depending on Q1 resolution)

**Depends on**: Q1 resolution (evaluation model choice)

---

### Topic 25: Pure Lowering Contract (T2/T3)

**Tier classification**:
- T2: Pure lowering principle, LowerSandbox concept, effects-as-data model
- T3: Specific API surface, purity testing techniques, ESLint rules

**Content from**:
- `01-macro-lowering.md` (primary)
- `03-hybrid-approach.md`, `04-keeping-them-pure.md` (supporting)

**Depends on**: Q5 resolution (spec depth)

---

### Topic 26: Lens System (T2/T3)

**Tier classification**:
- T2: Lens catalog categories, minimal ship set, lens-as-block principle
- T3: Individual lens specifications, parameter details

**Content from**:
- `01-base-lenses.md`
- Existing lens concepts from [14-modulation-table-ui](./topics/14-modulation-table-ui.md)

---

### Topic 27: Obligation-Driven Normalization (T2/T3)

**Tier classification**:
- T2: Obligation abstraction, pipeline restructuring, DefaultPolicyTable
- T3: Specific obligation kinds, materialization details, anchor strategies

**Content from**:
- `01-obligations.md`
- `01-cardinality-type-var.md` (related)

**Depends on**: Q4 resolution (adopt ODN or defer)

---

## Affected Existing Topics

### 01-type-system.md — Updates Required

1. **UnitType structured kinds**: Remove `scalar` kind (already removed in implementation). Clarify `norm01` status. Add `{ kind: 'color', space: 'oklch' }` sub-kind. (Depends on Q2, Q3)
2. **Cardinality type variables**: Note that DefaultSource and cardinality-generic blocks use axis vars for cardinality inference
3. **Unit normalization policy**: Add T3 note on when to use 0..1 vs natural units

### 04-compilation.md — Updates Required

1. **Normalization pipeline**: Either update to ODN model (if Q4→A) or note ODN as future direction (if Q4→B)
2. **Pure lowering**: Add pure lowering contract section (scope depends on Q5)
3. **Stride-aware slot allocation**: Add SlotMetaEntry with stride and payload (from multi-component signals)
4. **DefaultSource policy**: Update to reflect type-indexed policy table from macro-lowering spec

### 05-runtime.md — Updates Required

1. **Multi-component signal evaluation**: Add evaluation contract for stride>1 signals (depends on Q1)
2. **HistoryService guard**: stride>1 signals not tracked
3. **Debug plumbing**: readSignalSampleInto with stride awareness

---

## Overlap Analysis

| New Source | Existing Coverage | Action |
|-----------|------------------|--------|
| Color payload | PayloadType 'color' stride 4 in 01-type-system | COMPLEMENT: add color space details |
| Stride table | GLOSSARY PayloadType entry | COMPLEMENT: add stride 0 concept |
| Lens concept | GLOSSARY Transform/Adapter/Lens entries, 14-modulation-table-ui | COMPLEMENT: expand with catalog |
| Broadcast/Reduce | 01-type-system cardinality transforms, 21-adapter-system | OVERLAP: lens catalog lists them alongside new lenses |
| Extract/Construct | Not in canonical | NEW: structural intrinsics for vector/color |
| DefaultSource | 04-compilation, I26 | COMPLEMENT: policy table extends basic concept |
| Axis<T,V> vars | 01-type-system Axis polymorphism | COMPLEMENT: cardinality vars use existing pattern |

---

## Gap Analysis

| Gap | Source | Severity | Notes |
|-----|--------|----------|-------|
| Lens compilation strategy | 01-base-lenses | Medium | How lenses compile to IR not specified |
| Color render pipeline integration | 01-colors | Medium | How OKLCH→RGB connects to render sinks |
| ODN adapter obligations | 01-obligations | Low | CoerceObligation not fully specified |
| SigExpr → multi-component mapping | MultiValueSignals | Medium | Migration path from current SigExpr system |
| Cardinality var propagation for instance refs | 01-cardinality-type-var | Low | How many(instanceRef) propagates through inference |
| Extract/Construct IR nodes | 01-colors | Medium | Whether these are ValueExpr variants or kernels |

---

## Integration Readiness

**Can integrate immediately** (no open questions):
- Normalized units guidance (I3 — pure complement to UnitType)
- Cardinality type variable principle (I4 — builds on existing Axis<T,V>)

**Blocked on Q1** (evaluation model):
- Multi-component signal topic (Topic 24)
- Runtime evaluation updates

**Blocked on Q2, Q3** (UnitType naming/removal):
- Color system topic (Topic 23)
- UnitType spec update

**Blocked on Q4** (ODN adoption):
- Obligation topic (Topic 27)
- Pipeline restructuring

**Blocked on Q5** (spec depth):
- Pure lowering topic (Topic 25)

**No blockers** (can create with T3 detail level):
- Lens system topic (Topic 26)
