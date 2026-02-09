---
command: /canonicalize-docs
files: design-docs/_new/lenses/01-base-lenses.md design-docs/_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md design-docs/_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md design-docs/_new/pure-lowering-blocks/01-macro-lowering.md design-docs/_new/colors/01-colors.md design-docs/_new/colors/02-color-units.md design-docs/_new/P0-Multi-Component-Signals.md design-docs/_new/normalized-units.md design-docs/_new/MultiValueSignals.md design-docs/_new/01-cardinality-type-var.md design-docs/_new/01-obligations.md
indexed: true
---

# Proposed Topic Updates — 2026-02-09

## New Topics Proposed

### Topic 23: Color System

**Proposed file**: `topics/23-color-system.md`
**Tier**: T2 (structural) + T3 (details)
**Depends on**: Q2 (UnitType sub-field naming), Q3 (UnitType kind set)

**T2 content (structural)**:
- Color space as UnitType extension: `{ kind: 'color', space: 'hsl' }` and `{ kind: 'color', space: 'rgba01' }`
- Compatibility rule: HSL and RGBA01 require explicit adapter (HslToRgba)
- Color validity enforcement: MakeColorHSL wraps hue, clamps s/l/a
- Extract/Construct as structural intrinsics (new ValueExpr kinds, not registry kernels)
- All color blocks are cardinality-polymorphic

**T3 content (details)**:
- Block catalog: ColorPicker, MakeColorHSL, SplitColorHSL, HueShift, MixColor, AlphaMultiply, HslToRgba
- Per-block lowering semantics
- HSL→RGB conversion algorithm (hue2rgb)
- Convenience outputs (scalar h/s/l/a from ColorPicker)
- Shortest-arc hue interpolation for MixColor

**Cross-references**: 01-type-system (UnitType), 02-block-system (block definitions), 21-adapter-system (HslToRgba adapter)

**Source documents**: `01-colors.md`, `02-color-units.md`

---

### Topic 24: Multi-Component Signal Values

**Proposed file**: `topics/24-multi-component-signals.md`
**Tier**: T2 (structural)
**Depends on**: Q1 (evaluation model choice)

**T2 content**:
- SlotMetaEntry: slot, offset, stride, payload — compiler-emitted single source of truth
- Stride-aware slot allocation: `allocTypedSlot(type)` reserves stride consecutive positions
- Sampleability: stride>0 is sampleable, stride=0 (shape2d/shape3d) is non-sampleable
- Evaluation contract: [depends on Q1 — either scalar+strided-write or generic evaluateInto]
- Compiler validations: stride mismatch is compile error; scalar-only opcodes rejected with non-1 stride
- HistoryService guard: stride>1 signals not tracked (no-op, no allocation)
- Debug plumbing: readSignalSampleInto with stride awareness

**Proposed invariant**: I38 — Stride is derived from payload, never stored independently
**Proposed invariant**: I39 — Non-sampleable payloads (stride=0) forbidden in numeric slot allocation

**Cross-references**: 01-type-system (PayloadType, stride), 04-compilation (slot allocation), 05-runtime (evaluation), 08-observation-system (debug)

**Source documents**: `P0-Multi-Component-Signals.md`, `MultiValueSignals.md`

---

### Topic 25: Pure Lowering Contract

**Proposed file**: `topics/25-pure-lowering.md`
**Tier**: T2 (principle) + T3 (details)
**Depends on**: Q5 (spec depth)

**T2 content (principle)**:
- Block `lower()` is a pure function of (resolved types, params, inputs, ctx)
- LowerSandbox: capability-based builder enforcing purity
- No graph mutation in lowering — outputs are ValueExpr DAGs only
- Effects-as-data model: lowerers return `exprOutputs + effects?`
- Separate compiler stage consumes effects (slot allocation, schedule steps)
- DefaultSource as polymorphic block using macro lowering

**T3 content (details)**:
- Purity tagging: `loweringPurity: "pure" | "stateful" | "impure"`
- LowerSandbox API surface (emitConst, emitOp, emitKernel, etc.)
- Macro lowering: invoking block lower() through sandbox
- DefaultSource three-phase separation (normalize → type-resolve → lower)
- DefaultPolicyTable: type-indexed with per-port profiles
- Purity enforcement techniques (determinism check, freeze+proxy, forbidden imports, record-replay)

**Cross-references**: 04-compilation (pipeline), 02-block-system (BlockDef)

**Source documents**: `01-macro-lowering.md`, `03-hybrid-approach.md`, `04-keeping-them-pure.md`

---

### Topic 26: Lens System

**Proposed file**: `topics/26-lens-system.md`
**Tier**: T2 (concept) + T3 (catalog)

**T2 content (concept)**:
- Lens = value transformation that compiles to a block in the patch
- 8 categories: value shaping, dynamics, quantization, curves, noise, domain/cardinality, structural, units
- Minimal ship set: 10 lenses for 80% workflow coverage
- Lenses are distinct from adapters (adapters change type compatibility; lenses change values)

**T3 content (catalog)**:
- Value shaping: Scale, Bias, Scale+Bias, Clamp, Wrap01, Fold, Deadzone, Normalize
- Dynamics: Slew/Lag, QuantizeTime, Delay, Accumulator
- Quantization: StepQuantize, SnapToSet, Bitcrush
- Curves: LerpRemap, Power/Gamma, Smoothstep, Ease family
- Noise: AddDither, Jitter
- Domain/cardinality: Broadcast, Reduce, Mask
- Structural: ExtractComponent, Construct, Swizzle
- Units: UnitConvert adapters, Saturate01
- Normalized unit policy: when to use 0..1 vs natural units

**Cross-references**: 14-modulation-table-ui (lens UI), 02-block-system (blocks), 01-type-system (units)

**Source documents**: `01-base-lenses.md`, `normalized-units.md`

---

### Topic 27: Obligation-Driven Normalization (Conditional)

**Proposed file**: `topics/27-obligation-normalization.md`
**Tier**: T2 (architecture)
**Depends on**: Q4 (adopt ODN or defer)

**If Q4 → A (adopt)**:

**T2 content**:
- Obligation abstraction: declarative request for deferred graph structure
- Pipeline restructuring: Phase A (structural normalization + obligation collection) → Phase B (constraint solving) → Phase C (obligation materialization)
- ObligationKind: missingInput, coerce, lens, busJunction
- AnchorRef: stable deterministic ID derivation from user graph anchors
- DefaultPolicyTable integration with obligation materialization
- Materialization is the last mutating pass before immutable NormalizedGraph
- Invariant update: I26 enforced after materialization, not after normalization

**If Q4 → B (defer)**: Record as T3 future architecture note in Topic 04 (Compilation)

**Source documents**: `01-obligations.md`, `01-cardinality-type-var.md`

---

## Existing Topic Updates

### Topic 01 (Type System) — Updates

1. **UnitType kinds**: Remove `scalar` (unified with `none`). Clarify `norm01`. Add `{ kind: 'color', space: 'hsl' }`. (Blocked on Q2, Q3)
2. **Normalized unit policy**: Add T3 note: "Normalize glue signals (phase, mix, masks, easings, normalizedIndex). Keep time/space/physics in real units."
3. **Cardinality type variables**: Note that DefaultSource and cardinality-generic blocks can declare output type with cardinality var, resolved via inference

### Topic 04 (Compilation) — Updates

1. **Pure lowering section**: Add reference to Topic 25 (pure lowering contract)
2. **Stride-aware slot allocation**: Add SlotMetaEntry concept, compiler invariant `stride === payloadStride(payload)`
3. **DefaultSource policy**: Update from basic "materializes default source" to "type-indexed policy table with per-port profiles"
4. **Pipeline description**: Update normalization stages if ODN adopted (Q4)

### Topic 05 (Runtime) — Updates

1. **Multi-component evaluation**: Add evaluation contract for stride>1 signals (blocked on Q1)
2. **HistoryService guard**: Add "stride>1 signals not tracked" restriction
3. **Debug sample API**: Add `readSignalSampleInto(slot, out)` with stride parameter

---

## Topic Dependency Map

```
Topic 23 (Color) ──── depends on ──── Topic 01 (Type System: UnitType)
    │                                      │
    └── depends on ── Topic 24 (Multi-Component: stride for color)
                                           │
Topic 24 (Multi-Component) ── depends on ── Topic 05 (Runtime: evaluation)
    │                                      │
    └── depends on ── Topic 04 (Compilation: slot allocation)

Topic 25 (Pure Lowering) ── depends on ── Topic 04 (Compilation)
    │
    └── depends on ── Topic 02 (Block System: BlockDef)

Topic 26 (Lens System) ── depends on ── Topic 02 (Block System)
    │
    └── depends on ── Topic 14 (Modulation Table UI)

Topic 27 (Obligations) ── depends on ── Topic 04 (Compilation: pipeline)
    │
    └── depends on ── Topic 01 (Type System: inference)
```
