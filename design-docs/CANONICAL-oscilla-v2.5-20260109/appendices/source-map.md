---
parent: ../INDEX.md
---

# Source Document Map

Which original documents contributed to which parts of this specification.

---

## Encyclopedia Section Sources

| Specification Section | Primary Sources |
|-----------------------|-----------------|
| [SUMMARY.md](../SUMMARY.md) | All sources (synthesis) |
| [INVARIANTS.md](../INVARIANTS.md) | `00-invariants.md`, `1-Core-Laws.md`, `2-Core-Checklist.md` |
| [GLOSSARY.md](../GLOSSARY.md) | All sources (term extraction) |
| [RESOLUTION-LOG.md](../RESOLUTION-LOG.md) | `CANONICALIZED-QUESTIONS-*.md`, `USER-APPROVAL-*.md` |
| [01-type-system.md](../topics/01-type-system.md) | `compiler/01-type-system.md`, `compiler/canonical-types-and-constraints.md`, `ChatGPT-Fundamental Axes in Systems.md` |
| [02-block-system.md](../topics/02-block-system.md) | `graph/06-blocks.md`, `graph/08-primitives-composites.md`, `graph/stateful-blocks.md`, `15-Block-Edge-Roles.md` |
| [03-time-system.md](../topics/03-time-system.md) | `graph/02-time.md`, `time/10-phase-matching-system.md`, `time/11-phase-unwrap-IMPORTANT.md` |
| [04-compilation.md](../topics/04-compilation.md) | `compiler/04-compilation.md`, `compiler/02-polymorphism.md`, `compiler/03-category-theory.md` |
| [05-runtime.md](../topics/05-runtime.md) | `runtime/05-runtime.md`, `5-RuntimeState.md`, `6-program.md`, `7-Canonical-IR-Program-Contract.md` |
| [06-renderer.md](../topics/06-renderer.md) | `renderer/09-renderer.md`, `renderer/RENDER-PIPELINE.md` |
| [15-graph-editor-ui.md](../topics/15-graph-editor-ui.md) | `spec/10-linear-graph-editor.md` |
| [02-block-system.md](../topics/02-block-system.md) (Cardinality-Generic section) | `_new/0-CardinalityGeneric-Block-Type-Spec.md` |
| [02-block-system.md](../topics/02-block-system.md) (Payload-Generic section) | `_new/0-PayloadGeneriic-Block-Type-Spec.md` |
| [04-compilation.md](../topics/04-compilation.md) (Expression Forms, Payload Specialization) | `_new/0-CardinalityGeneric-Block-Type-Spec.md`, `_new/0-PayloadGeneriic-Block-Type-Spec.md` |
| [05-runtime.md](../topics/05-runtime.md) (State Mappings) | `_new/0-CardinalityGeneric-Block-Types-Impact.md` |
| [16-coordinate-spaces.md](../topics/16-coordinate-spaces.md) | `_new/kernel-roadmap/1-local-space.md`, `_new/kernel-roadmap/2-local-space-end-to-end-spec.md`, `_new/kernel-roadmap/3-local-space-spec-deeper.md` |
| [05-runtime.md](../topics/05-runtime.md) (Three-Layer Architecture) | `_new/kernel-roadmap/0-kernel-roadmap.md`, `_new/kernel-roadmap/5-opcode-interpreter.md`, `_new/kernel-roadmap/6-signal-kernel.md`, `_new/kernel-roadmap/7-field-kernel.md` |
| [05-runtime.md](../topics/05-runtime.md) (Typed Banks) | `_new/kernel-roadmap/3-local-space-spec-deeper.md` |
| [06-renderer.md](../topics/06-renderer.md) (RenderFrameIR, DrawPathInstancesOp) | `_new/kernel-roadmap/3-local-space-spec-deeper.md` |
| [01-type-system.md](../topics/01-type-system.md) (shape2d) | `_new/kernel-roadmap/3-local-space-spec-deeper.md` |
| [05-runtime.md](../topics/05-runtime.md) (RenderAssembler) | `_new/renderer/8-before-render.md` |
| [06-renderer.md](../topics/06-renderer.md) (Topology Registry, PathTopologyDef) | `_new/renderer/9-renderer.md` |
| [06-renderer.md](../topics/06-renderer.md) (Backend Interface, RenderBackend) | `_new/renderer/10-multiple-backends.md` |
| [06-renderer.md](../topics/06-renderer.md) (SVG Backend) | `_new/renderer/11-svg.md` |

---

## Detailed Source Attribution

### Type System (01-type-system.md)

| Section | Sources |
|---------|---------|
| PayloadType | `compiler/01-type-system.md:DomainTag` |
| Extent (5-axis) | `ChatGPT-Fundamental Axes in Systems.md` (primary), `compiler/canonical-types-and-constraints.md` |
| AxisTag pattern | `ChatGPT-Fundamental Axes in Systems.md` |
| Cardinality | `ChatGPT-Fundamental Axes in Systems.md`, mapped from `World` |
| Temporality | `ChatGPT-Fundamental Axes in Systems.md`, mapped from `event` |
| Domain system | `compiler/01-type-system.md:Domain`, `ChatGPT-Fundamental Axes in Systems.md` |
| Unification rules | `compiler/canonical-types-and-constraints.md:solver.ts` |

### Block System (02-block-system.md)

| Section | Sources |
|---------|---------|
| Block structure | `graph/06-blocks.md` |
| BlockRole/EdgeRole | `15-Block-Edge-Roles.md` |
| DerivedBlockMeta | `15-Block-Edge-Roles.md`, `16-Graph-Normalization.md` |
| Stateful primitives | `graph/stateful-blocks.md`, `graph/08-primitives-composites.md` |
| Basic 12 blocks | `graph/basic-12-blocks.md` |
| Combine modes | `graph/03-buses.md` |
| Default sources | `13-DefaultSources.md` |
| Rails | `Rail.md`, `Rail-Modulation-and-Feedback.md` |

### Time System (03-time-system.md)

| Section | Sources |
|---------|---------|
| TimeRoot | `graph/02-time.md` |
| Time invariants | `1-Core-Laws.md:A.1-5`, `00-invariants.md` |
| Phase system | `time/10-phase-matching-system.md` |
| Phase unwrap | `time/11-phase-unwrap-IMPORTANT.md` |
| Rails | `Rail.md` |
| Palette | `Palette.md` |

### Compilation (04-compilation.md)

| Section | Sources |
|---------|---------|
| Pipeline overview | `compiler/04-compilation.md`, `INDEX.md` |
| NormalizedGraph | `16-Graph-Normalization.md`, `compiler/04-compilation.md` |
| Type propagation | `compiler/canonical-types-and-constraints.md` |
| Cycle detection | `1-Core-Laws.md:B.6`, `00-invariants.md` |
| Scheduling | `1-Core-Laws.md:B.8`, `7-Canonical-IR-Program-Contract.md` |
| Slot allocation | `compiler/canonical-types-and-constraints.md:irBuilder.ts` |
| Runtime erasure | `ChatGPT-Fundamental Axes in Systems.md`, `1-Core-Laws.md` |
| Polymorphism | `compiler/02-polymorphism.md`, `compiler/03-category-theory.md` |

### Runtime (05-runtime.md)

| Section | Sources |
|---------|---------|
| Storage model | `5-RuntimeState.md`, `7-Canonical-IR-Program-Contract.md` |
| State management | `1-Core-Laws.md:A.3`, `5-RuntimeState.md` |
| Scheduling | `6-program.md`, `7-Canonical-IR-Program-Contract.md` |
| Hot-swap | `1-Core-Laws.md:A.2`, `00-invariants.md` |
| Caching | `1-Core-Laws.md:C.13` |
| Traceability | `1-Core-Laws.md:E.19` |
| Replay | `1-Core-Laws.md:E.20`, `3-Agent-Checklist.md` |

### Renderer (06-renderer.md)

| Section | Sources |
|---------|---------|
| Render contract | `1-Core-Laws.md:D.14`, `renderer/09-renderer.md` |
| Render IR | `1-Core-Laws.md:D.15`, `renderer/RENDER-PIPELINE.md` |
| Batching | `1-Core-Laws.md:D.16`, `renderer/RENDER-PIPELINE.md` |
| Temporal stability | `1-Core-Laws.md:D.17`, `00-invariants.md` |
| PathTopologyDef | `_new/renderer/9-renderer.md` |
| Topology Registry | `_new/renderer/9-renderer.md` |
| Backend Interface | `_new/renderer/10-multiple-backends.md` |
| SVG Backend | `_new/renderer/11-svg.md` |
| Pass-level prevalidation | `_new/renderer/9-renderer.md` |

---

## Refinement Document

The v2.5 type system upgrade came primarily from:

**ChatGPT-Fundamental Axes in Systems.md**

This document introduced:
- Five-axis coordinate system
- PayloadType/Extent/CanonicalType naming
- AxisTag pattern (no optional fields)
- Domain as compile-time resource
- Binding/Perspective/Branch axes
- Axis unification rules

---

---

## Update 2026-02-09 Integration

### Topic 23 (Color System)

| Section | Sources |
|---------|---------|
| Color space as UnitType extension | `_new/colors/01-colors.md` |
| Compatibility rules | `_new/colors/02-color-units.md` |
| Block catalog | `_new/colors/01-colors.md` |
| HSL→RGB conversion | `_new/colors/01-colors.md` |
| Extract/Construct intrinsics | `_new/colors/01-colors.md` |

### Topic 24 (Multi-Component Signals)

| Section | Sources |
|---------|---------|
| Evaluation model | `_new/P0-Multi-Component-Signals.md`, `_new/MultiValueSignals.md` |
| SlotMetaEntry | `_new/MultiValueSignals.md` |
| Stride-aware allocation | `_new/MultiValueSignals.md` |
| Sampleability | `_new/MultiValueSignals.md` |
| Construct ValueExpr | `_new/MultiValueSignals.md` |

### Topic 25 (Pure Lowering)

| Section | Sources |
|---------|---------|
| LowerSandbox | `_new/pure-lowering-blocks/01-macro-lowering.md` |
| Effects-as-data model | `_new/pure-lowering-blocks/01-macro-lowering.md` |
| Purity enforcement | `_new/pure-lowering-blocks/_source_docs/04-keeping-them-pure.md` |
| Macro lowering | `_new/pure-lowering-blocks/01-macro-lowering.md` |
| DefaultPolicyTable | `_new/pure-lowering-blocks/01-macro-lowering.md`, `_new/01-obligations.md` |
| Hybrid approach | `_new/pure-lowering-blocks/_source_docs/03-hybrid-approach.md` |

### Topic 26 (Lens System)

| Section | Sources |
|---------|---------|
| Lens concept | `_new/lenses/01-base-lenses.md` |
| 8 categories | `_new/lenses/01-base-lenses.md` |
| Minimal ship set | `_new/lenses/01-base-lenses.md` |
| Lens vs adapter | `_new/lenses/01-base-lenses.md` |
| Normalized unit policy | `_new/normalized-units.md` |

### Topic 27 (Obligation-Driven Normalization)

| Section | Sources |
|---------|---------|
| Obligation abstraction | `_new/01-obligations.md` |
| Pipeline restructuring | `_new/01-obligations.md` |
| ObligationKind | `_new/01-obligations.md` |
| AnchorRef | `_new/01-obligations.md` |
| Fixpoint loop architecture | `_new/01-obligations.md` |

### Topic 01 Updates (Type System)

| Section | Sources |
|---------|---------|
| UnitType removal (scalar) | Implementation verification (per MEMORY.md 2026-02-08) |
| Cardinality type variables | `_new/01-cardinality-type-var.md` |
| Normalized unit policy | `_new/normalized-units.md` |

### Topic 04 Updates (Compilation)

| Section | Sources |
|---------|---------|
| Pure lowering reference | Topic 25 cross-reference |
| Stride-aware slot allocation | `_new/MultiValueSignals.md` |
| DefaultSource policy | `_new/pure-lowering-blocks/01-macro-lowering.md` |
| ODN pipeline description | `_new/01-obligations.md` |

### Topic 05 Updates (Runtime)

| Section | Sources |
|---------|---------|
| Multi-component evaluation | `_new/P0-Multi-Component-Signals.md`, `_new/MultiValueSignals.md` |
| HistoryService guard | `_new/MultiValueSignals.md` |
| Debug sample API | `_new/MultiValueSignals.md` |

---

## Source File List

All files from `design-docs/spec/` (archived to `spec-archived-20260109-160000/`):

### Core
- `INDEX.md`
- `00-invariants.md`
- `AMBIGUITIES.md`

### Graph
- `graph/02-time.md`
- `graph/03-buses.md`
- `graph/06-blocks.md`
- `graph/07-transforms.md`
- `graph/08-primitives-composites.md`
- `graph/stateful-blocks.md`
- `graph/basic-12-blocks.md`

### Compiler
- `compiler/01-type-system.md`
- `compiler/02-polymorphism.md`
- `compiler/03-category-theory.md`
- `compiler/04-compilation.md`
- `compiler/canonical-types-and-constraints.md`
- `compiler/canonical-types-and-constraints-UPDATED.md`
- `compiler/maybe-block-defs.md`

### Runtime
- `runtime/05-runtime.md`

### Renderer
- `renderer/09-renderer.md`
- `renderer/RENDER-PIPELINE.md`

### Time
- `time/10-phase-matching-system.md`
- `time/11-phase-unwrap-IMPORTANT.md`

### Architecture Refinement
- `_architecture-refinement/ChatGPT-Fundamental Axes in Systems.md`

### Invariants (from final-System-Invariants/)
- `1-Core-Laws.md`
- `2-Core-Checklist.md`
- `3-Agent-Checklist.md`
- `5-RuntimeState.md`
- `6-program.md`
- `7-Canonical-IR-Program-Contract.md`
- `13-DefaultSources.md`
- `14-Stateful-Primitives.md`
- `15-Block-Edge-Roles.md`
- `16-Graph-Normalization.md`
- `Palette.md`
- `Rail.md`
- `Rail-Modulation-and-Feedback.md`
- `Unified-Transforms-Architecture.md`

### Update 2026-02-09 Source Files

All files from `design-docs/_new/` (archived to `_new-archived-20260209/`):

**Processed and integrated:**
- `01-cardinality-type-var.md` → Topic 01 (Type System)
- `01-obligations.md` → Topic 27 (Obligation-Driven Normalization)
- `P0-Multi-Component-Signals.md` → Topic 24 (Multi-Component Signals)
- `MultiValueSignals.md` → Topic 24 (Multi-Component Signals)
- `normalized-units.md` → Topics 01, 26 (Type System, Lens System)
- `colors/01-colors.md` → Topic 23 (Color System)
- `colors/02-color-units.md` → Topic 23 (Color System)
- `lenses/01-base-lenses.md` → Topic 26 (Lens System)
- `pure-lowering-blocks/01-macro-lowering.md` → Topic 25 (Pure Lowering)
- `pure-lowering-blocks/_source_docs/03-hybrid-approach.md` → Topic 25 (Pure Lowering)
- `pure-lowering-blocks/_source_docs/04-keeping-them-pure.md` → Topic 25 (Pure Lowering)
