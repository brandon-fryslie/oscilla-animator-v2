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

# Canonicalization Questions — Update 2026-02-09

> Issues requiring resolution before integration into the canonical specification.

---

## CRITICAL (T1 Contradictions)

*None identified. No new sources contradict foundational principles.*

---

## HIGH (T2 Contradictions / Internal Contradictions)

### Q1: Multi-Component Signal Evaluation Model — Two Conflicting Approaches

**Tag**: CONTRADICTION-INTERNAL
**Severity**: HIGH
**Sources**: `P0-Multi-Component-Signals.md` vs `MultiValueSignals.md`

**Conflict**:
- **P0-Multi-Component-Signals.md** preserves scalar evaluation: `evaluateSignal(sigId) -> number` stays unchanged. Multi-component values written via `StepSlotWriteStrided { slotBase, inputs: SigExprId[] }` — one scalar eval per component. The core evaluator never returns arrays.
- **MultiValueSignals.md** replaces scalar evaluation entirely: `evaluateSigExprInto(exprId, out, outOffset): void` writes `payloadStride(payload)` components. "The evaluator MUST NOT return a number." Scalar signals are stride=1 writing to `out[outOffset]`.

**Why it matters**: This is the fundamental runtime evaluation contract. Every signal block, every debug plumbing path, every schedule step depends on which model we use. The approaches are architecturally incompatible.

**Options**:1
- **A (Scalar + Strided Write)**: Keep scalar evaluator, add strided write step for multi-component. Simpler migration, preserves existing infrastructure. Risk: special-casing multi-component as "N scalar evals + strided write" may leak as a dual code path.
- **B (Generic evaluateSigExprInto)**: Replace evaluator interface. Uniform handling of all strides. More invasive refactor but eliminates scalar/multi special cases. Risk: every existing evaluator call site changes.

**Impact**: [05-runtime.md](./topics/05-runtime.md), [04-compilation.md](./topics/04-compilation.md), schedule step types, debug plumbing, HistoryService

**Status**: RESOLVED

**Resolution**: Hybrid A+ model — matches what's already implemented. The codebase uses:
- Scalar signals: `evaluateValueExprSignal() → number` (unchanged from Model A)
- Multi-component signals: `construct` ValueExpr (structural, not computational) + `evaluateConstructSignal()` writes contiguously to f64 buffer
- `StepSlotWriteStrided` exists in IR types but is NOT currently generated during compilation
- ScheduleExecutor dispatches on stride>1 + construct kind for multi-component signals
- This is superior to either Model A or B alone: type-safe, compile-time strategy via CanonicalType, clean construct semantics

**Evidence**: `src/runtime/ValueExprSignalEvaluator.ts` (evaluateConstructSignal), `src/compiler/ir/value-expr.ts` (ValueExprConstruct), `src/runtime/ScheduleExecutor.ts:206-247`, `src/runtime/__tests__/construct-signal.test.ts`

**Approved by**: Brandon Fryslie (match-the-app directive)
**Approved at**: 2026-02-09T13:30:00Z

---

### Q2: Color UnitType Sub-Field Naming — 'space' vs 'unit'

**Tag**: CONTRADICTION-T2
**Severity**: HIGH
**Sources**: `01-colors.md`, `02-color-units.md` vs canonical `01-type-system.md`

**Conflict**:
- **Canonical spec** (01-type-system.md line 181): `{ kind: 'color'; space: 'rgba01' }` — uses `space` sub-field
- **01-colors.md**: `{ kind: 'color', unit: 'hsl' }` — uses `unit` sub-field
- **02-color-units.md**: "The existing `{ kind: 'color', unit: 'rgba01' }` pattern" — also uses `unit` sub-field

**Why it matters**: The sub-field name must be consistent for TypeScript interfaces, adapter matching, and all code referencing color units.
    
**Recommendation**: Use `space` (matches canonical spec). The new sources likely used `unit` informally.

**Impact**: Color blocks, adapter system, type checking code

**Status**: RESOVLED: it's 'unit'.  { kind: 'color', space: 'xyz' } does not exist, nor does it make sense to have a totally different key just for color.  it's unit just like e3verything else

---

### Q3: Scalar UnitType Kind — Canonical Spec vs Implementation

**Tag**: CONTRADICTION-T2
**Severity**: HIGH
**Sources**: Canonical `01-type-system.md` vs implementation (per MEMORY.md)

**Conflict**:
- **Canonical spec** lists 8 UnitType kinds: `none | scalar | norm01 | count | angle | time | space | color`
- **Implementation** (as of 2026-02-08 per MEMORY.md): `scalar` UnitType kind was REMOVED and unified with `none`. Only 6 kinds remain: `none | count | angle | time | space | color`
- Additionally, `norm01` is not mentioned in the implementation changes

**Why it matters**: The canonical spec is out of date with the implementation. This must be resolved to keep the spec authoritative.

**Recommendation**: Update canonical spec to match implementation — remove `scalar`, clarify `norm01` status.

**Impact**: [01-type-system.md](./topics/01-type-system.md) UnitType section, GLOSSARY UnitType entry

**Status**: RESOLVED

**Resolution**: Match the implementation. Remove `scalar` and `norm01` from UnitType. 6 concrete kinds remain: `none | count | angle | time | space | color`. The `space` sub-field on color UnitType is renamed to `unit` per Q2 resolution.

**Evidence**: `src/core/canonical-types/unit.ts` defines exactly 6 kinds. No `scalar` or `norm01` exists in the codebase. Unit vars (`kind: 'var'`) are inference-only in `src/core/inference-types.ts`.

**Approved by**: Brandon Fryslie (match-the-app directive)
**Approved at**: 2026-02-09T13:30:00Z

---

### Q4: Obligation-Driven Normalization vs Current DefaultSource Approach

**Tag**: CONTRADICTION-T2
**Severity**: HIGH
**Sources**: `01-obligations.md` vs existing [04-compilation.md](./topics/04-compilation.md) pipeline

**Conflict**:
- **Current canonical** (04-compilation.md): GraphNormalization materializes default sources, buses, lenses as actual blocks/edges BEFORE type solving. "Every default-source is an actual BlockInstance + Edge."
- **01-obligations.md**: Proposes split: Phase A (structural normalization emits Obligations as side-table), Phase B (constraint solving), Phase C (obligation materialization after solved facts). Default sources become obligations that materialize AFTER type solving.

**Why it matters**: This is a fundamental pipeline restructuring. The obligation model defers default source creation until types are known, enabling type-aware defaults. But it changes the invariant that "NormalizedGraph has every input connected" — that invariant now holds only AFTER materialization, not after normalization.

**Note**: The current implementation already has a fixpoint loop with `DefaultSourcePolicy` that partially addresses this. The obligation system would generalize this.

**Options**:
- **A (Integrate ODN)**: Adopt obligation-driven normalization as the canonical pipeline. Update I26 to specify when "every input has a source" is enforced.
- **B (Keep current + note future)**: Record ODN as a T3 future architecture note, keep current pipeline description.

**Impact**: [04-compilation.md](./topics/04-compilation.md), I26, normalization pipeline description

**Status**: RESOLVED: "Every default-source is an actual BlockInstance + Edge." You are fundamentally not understanding the spec.  It's a loop. 

It already works like this, please update the canonical spec to reflect the new normalization engine that inserts blocks + solves for types in a loop.


---

### Q5: Pure Lowering Contract — How Far to Specify?

**Tag**: AMBIGUITY
**Severity**: HIGH
**Sources**: `01-macro-lowering.md`, `03-hybrid-approach.md`, `04-keeping-them-pure.md`

**Ambiguity**: The new sources describe a comprehensive pure lowering system with:
- `LowerSandbox` as capability-based builder
- `loweringPurity: "pure" | "stateful" | "impure"` tagging on BlockDef
- Effects-as-data model (exprOutputs + LowerEffects)
- Purity enforcement (determinism checks, no-mutation, forbidden imports)

**Question**: Should the canonical spec prescribe the full pure lowering contract (LowerSandbox API, purity tags, effects-as-data), or only the architectural principle ("lowering is pure, no graph mutation")?

**The current implementation** has `LowerSandbox.ts` already. The question is about spec authority level.

**Options**:
- **A (Full contract as T2)**: Pure lowering contract, LowerSandbox API, purity tagging are structural (T2)
- **B (Principle only as T2, details as T3)**: The principle "lowering must be pure" is T2; LowerSandbox API details are T3

**Impact**: [04-compilation.md](./topics/04-compilation.md) or new topic

**Status**: Resolve

Specify at least:

- LowerSandbox (T2)
- loweringPurity - do not inlcude
- - Effects-as-data model (exprOutputs + LowerEffects) (T2)
- Purity enforcement (determinism checks, no-mutation, forbidden imports) (T2)

---

## NORMAL (T3 Contradictions / Overlaps)

### Q6: Multi-Component Signals — Stride Table Differences

**Tag**: CONTRADICTION-T3
**Severity**: NORMAL
**Sources**: `P0-Multi-Component-Signals.md` vs `MultiValueSignals.md`

**Conflict on stride table**:
- **P0**: Lists float/int/bool→1, vec2→2, vec3→3, color→4 (no phase, no unit, no cameraProjection)
- **MultiValueSignals**: Adds `unit→1`, `phase→1`, includes "stride 0" concept for non-sampleable payloads

**Note**: The canonical spec already has a complete stride table in the GLOSSARY (PayloadType entry) and topic 01. The multi-component signal docs add the "stride 0 = non-sampleable" concept which is useful.

**Recommendation**: Keep canonical stride table. Add "stride 0 for shape2d/shape3d = non-sampleable" concept from MultiValueSignals if not already there.

**Status**: RESOLVED

**Resolution**: Keep canonical stride table from Topic 01. Add "stride 0 for shape2d/shape3d = non-sampleable" concept. Stride table is T3; the spec is a minimum set. Implementation's `payloadStride()` in `src/core/canonical-types/stride.ts` is the single authority. cameraProjection stride is 1 (not 16 as spec says — verify and update).

**Approved by**: Brandon Fryslie (match-the-app directive)
**Approved at**: 2026-02-09T13:30:00Z

---

### Q7: Lens System — Block vs Inline Lens?

**Tag**: AMBIGUITY
**Severity**: NORMAL
**Sources**: `01-base-lenses.md` vs canonical `14-modulation-table-ui.md`

**Ambiguity**: The canonical spec describes Lens as a "Transform subtype" that "compiles to blocks in the patch" (GLOSSARY). The new lens catalog lists specific operations but doesn't specify whether these are:
- Standalone blocks (like current signal/math blocks)
- Edge decorators (lenses attached to edges, compiled to blocks)
- A separate lens expansion pass in compilation

**Note**: Some items in the lens catalog (Broadcast, Reduce, Mask) are already canonical blocks/adapter operations.

**Recommendation**: Lenses compile to blocks — consistent with existing canonical statement. Catalog items are either existing blocks or proposed new blocks.

**Status**: RESOLVED

"edge decorators (lenses attached to edges, compiled to blocks)" <- WRONG!
They are attached to the port, not the edge.  They can be attached to both input ports and output ports

- Remove the 'transform subtype' language, this was dropped


Remove this: "Some items in the lens catalog (Broadcast, Reduce, Mask)"
There is no 'lens catalog'


This is correct:
- Lens "compiles to blocks in the patch"
- these are Standalone blocks (like current signal/math blocks)
- PORT decorators (lenses attached to edges, compiled to blocks)
- A separate lens expansion pass in compilation
- There is no 'lens catalog'.  There is a block catalog and blocks can be used as lenses



---

### Q8: Color Blocks — Cardinality Polymorphism Mechanism

**Tag**: AMBIGUITY
**Severity**: NORMAL
**Sources**: `01-colors.md`

**Ambiguity**: The color spec says "Every block below is cardinality-polymorphic" and "No separate signal/field implementations; it's the same lowering shape." This implies all color blocks use cardinality type variables.

**Question**: Does this depend on the cardinality type variable system described in `01-cardinality-type-var.md`? If so, these are linked — color blocks can't be fully implemented until cardinality type variables exist.

**Recommendation**: Note dependency. Color blocks are cardinality-polymorphic and require cardinality type variable support from the inference system.

**Status**: RESOLVED

This system has been implemnented for a while

---

## INFORMATIONAL (Overlaps / Complements)

### I1: P0-Multi-Component-Signals + MultiValueSignals Overlap

**Tag**: OVERLAP
**Sources**: `P0-Multi-Component-Signals.md`, `MultiValueSignals.md`

Both documents cover multi-component signal evaluation. MultiValueSignals is more comprehensive and detailed. After Q1 is resolved (which evaluation model), use the chosen document as primary source and archive the other.

---

### I2: Pure Lowering Source Document Hierarchy

**Tag**: OVERLAP
**Sources**: `03-hybrid-approach.md`, `04-keeping-them-pure.md`, `01-macro-lowering.md`

`01-macro-lowering.md` is a clean synthesis of the other two source documents. Use it as the primary source. The other two provide supporting rationale and can be archived as source material.

---

### I3: Normalized Units — Complements UnitType System

**Tag**: COMPLEMENT
**Source**: `normalized-units.md`

Provides policy guidance for unit usage:
- **Normalize to 0..1**: phase, weights/mix/masks, easings, normalizedIndex
- **Keep in natural units**: time (seconds/ms), angles (radians/degrees), positions, velocities

This complements the existing UnitType structured kinds. It's authoring guidance, not a structural change. Should be added as a T3 note in [01-type-system.md](./topics/01-type-system.md) or the color/lens topic.

IMPORTANT: this is FAR more than just 'guidance'.  This is a critical foundational piece of our number syste

---

### I4: Cardinality Type Variables — Complements Existing Axis<T,V>

**Tag**: COMPLEMENT
**Source**: `01-cardinality-type-var.md`

The canonical spec already supports axis variables via `Axis<T, V>`. The cardinality type variable document proposes:
- `InferenceExtent` with axis vars on all 5 axes (partially exists)
- Cardinality variable constructor
- Extending Substitution with cardinality resolution
- DefaultSource using cardinality var

**Implementation Status (Verified 2026-02-09)**:

The cardinality type variable system is **fully implemented** and matches the design doc closely:

1. **Type Representation** — COMPLETE:
   - `Axis<T, V>` with `inst`/`var` kinds in `src/core/canonical-types/`
   - `CardinalityVarId`, `InstanceVarId` branded IDs in `src/core/ids.ts`
   - `InstanceTerm = { kind: 'inst', ref } | { kind: 'var', id }` in `src/compiler/frontend/cardinality/solve.ts`
   - `InferenceCanonicalType` supports payload vars, unit vars, and axis vars via `Substitution`

2. **Cardinality Solver** — COMPLETE (5-phase algorithm):
   - `src/compiler/frontend/cardinality/solve.ts`: Union-find based solver
   - Constraint types: `equal`, `clampOne`, `forceMany`, `zipBroadcast`
   - Phase 1: Build equality UF, Phase 2: Collect group facts, Phase 3: Local resolution, Phase 4: ZipBroadcast fixpoint, Phase 5: Finalize substitution
   - Produces `CardinalitySolveResult { cardinalities, instances, errors }`

3. **Constraint Extraction** — COMPLETE:
   - `src/compiler/frontend/extract-constraints.ts` generates cardinality constraints from block metadata
   - Template var instantiation with alpha-renaming (e.g. `card:{blockId}:{templateId}`)
   - `baseCardinalityAxis` stores rewritten axes for the solver

4. **Block Usage** — COMPLETE:
   - Expression block uses `axisVar(cardinalityVarId('expr_refs'))` for polymorphic cardinality
   - Preserve/zipBroadcast patterns from block metadata drive constraint generation
   - DefaultSource uses cardinality vars for polymorphic output

5. **Differences from design doc**:
   - No `InferenceExtent` type — extent uses concrete `Extent` type with axis vars embedded in `Axis<T,V>` (cleaner)
   - No `CardinalityTemplate` field on BlockDef — derived from existing `BlockCardinalityMetadata`
   - `join` constraints named `zipBroadcast` in implementation
   - No `manyInstanceEq` constraint — instance equality enforced within `forceMany` resolution

---

### I5: Obligation-Driven Normalization — Complements Pipeline

**Tag**: COMPLEMENT
**Source**: `01-obligations.md`

Beyond the Q4 contradiction about pipeline ordering, ODN introduces useful concepts:
- **Obligation**: declarative request for graph structure dependent on solved facts
- **ObligationKind**: missingInput, coerce, lens, busJunction
- **AnchorRef**: stable deterministic ID derivation
- **DefaultPolicyTable**: type-indexed default resolution

Even if the full ODN restructuring is deferred, the concepts (particularly DefaultPolicyTable and per-port default profiles) complement the existing default source system.

Full ODN normalization will not be deferred.  Add the work to beads

---

## Resolution Summary

| # | Tag | Severity | Topic | Status |
|---|-----|----------|-------|--------|
| Q1 | CONTRADICTION-INTERNAL | HIGH | Multi-component eval model | **RESOLVED** — Hybrid A+ (construct exprs) |
| Q2 | CONTRADICTION-T2 | HIGH | Color UnitType sub-field name | **RESOLVED** — use `unit` not `space` |
| Q3 | CONTRADICTION-T2 | HIGH | Scalar UnitType removal | **RESOLVED** — match implementation (6 kinds) |
| Q4 | CONTRADICTION-T2 | HIGH | ODN vs current pipeline | **RESOLVED** — fixpoint loop already implemented |
| Q5 | AMBIGUITY | HIGH | Pure lowering spec depth | **RESOLVED** — LowerSandbox + effects-as-data T2 |
| Q6 | CONTRADICTION-T3 | NORMAL | Stride table differences | **RESOLVED** — match implementation, add stride 0 |
| Q7 | AMBIGUITY | NORMAL | Lens implementation model | **RESOLVED** — port decorators compiled to blocks |
| Q8 | AMBIGUITY | NORMAL | Color block cardinality dep | **RESOLVED** — already implemented |

**ALL ITEMS RESOLVED** — Ready for integration phase.

**CRITICAL**: 0
**HIGH**: 5 → all resolved
**NORMAL**: 3 → all resolved
**INFORMATIONAL**: 5 (action items noted)
