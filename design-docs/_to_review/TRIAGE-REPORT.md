# Triage Report - _to_review Documents

**Date:** 2026-01-12
**Canonical Spec Version:** v2.5-20260109
**Total Files Reviewed:** 96

## Summary

This report triages 96 files against the canonical specification at `design-docs/CANONICAL-oscilla-v2.5-20260109/`.

### Key Canonical T1 Constraints (Non-negotiable)

1. **Type System**: SignalType = PayloadType + Extent (5-axis model). PayloadType = float|int|vec2|color|phase|bool|unit
2. **Deprecated Terms**: TypeDesc, World, ValueType, DomainTag, SlotType are all stale terminology
3. **Block System**: Blocks are only compute unit. Uses `kind` not `type`. BlockRole is user|derived
4. **Time System**: Single TimeRoot authority, tMs monotonic, phase rails
5. **Compilation**: Raw -> Normalized -> IR pipeline, slot-addressed execution
6. **Runtime**: No type info at runtime, slot indices only
7. **Renderer**: Sink only, RenderIR, batching
8. **Continuity**: Gauge invariance (anti-jank)

---

## DISCARD (throw these out)

Files that contradict T1 canonical spec or use deprecated terminology.

| File | Reason |
|------|--------|
| `SPEC-00-missing-primitives-index.md` | Uses deprecated "world" terminology (signal/field/scalar), not canonical SignalType |
| `SPEC-01-field-signal-combination.md` | Uses deprecated TypeDesc/world model, contradicts 5-axis SignalType |
| `SPEC-02-field-runtime.md` | Uses deprecated TypeDesc/domain model, contradicts canonical type system |
| `SPEC-03-signal-runtime.md` | Uses deprecated TypeDesc with world/domain, not SignalType/PayloadType |
| `SPEC-04-render-pipeline.md` | Uses deprecated TypeDesc, should reference canonical 06-renderer |
| `SPEC-05-time-architecture.md` | Pre-canonical; TimeRoot concepts superseded by 03-time-system |
| `SPEC-06-type-system.md` | Uses deprecated TypeDesc with world/domain/semantics, contradicts canonical 01-type-system |
| `SPEC-07-bus-system.md` | Uses deprecated TypeDesc, CombineMode model not in canonical spec |
| `SPEC-08-default-sources.md` | Uses deprecated TypeDesc/world terminology |
| `SPEC-09-compiler-passes.md` | Uses deprecated TypeDesc, pass structure differs from canonical 04-compilation |
| `SPEC-10-export-pipeline.md` | Export is T3 and not in canonical spec; uses deprecated terminology |
| `SPEC-11-debug-system.md` | Uses deprecated TypeDesc throughout |
| `compiler/01-Overview.md` | Early brainstorm doc, superseded by canonical spec |
| `compiler/01.1-CompilerMigration-Roadmap.md` | Stale roadmap referencing deprecated architecture |
| `compiler/02-IR-Schema.md` | Uses deprecated TypeWorld/TypeDomain, contradicts canonical 01-type-system |
| `compiler/03-Nodes.md` | Fragment, uses deprecated terminology |
| `compiler/04-FieldExpr.md` | Uses deprecated world model |
| `compiler/05-Lenses-Adapters.md` | Concept not in canonical spec at T1 level |
| `compiler/06-Default-Sources.md` | Uses deprecated TypeDesc |
| `compiler/07-Buses.md` | Uses deprecated TypeDesc/world |
| `compiler/08-Outputs.md` | Fragment, uses deprecated concepts |
| `compiler/09-Caching.md` | Fragment, architecture changed |
| `compiler/10-Schedule-Semantics.md` | Uses deprecated terminology, superseded by canonical 05-runtime |
| `compiler/11-Opcode-Taxonomy.md` | Fragment, architecture changed |
| `compiler/12-SignalExpr.md` | Uses deprecated TypeDesc model |
| `compiler/13-SignalExpr-Evaluator.md` | Uses deprecated TypeDesc |
| `compiler/14-Compiled-IR-Program-Contract.md` | Uses deprecated TypeDesc/world model |
| `compiler/15-Canonical-Lowering-Pipeline.md` | Uses deprecated TypeDesc, pass structure differs from canonical |
| `compiler/16-Block-Lowering.md` | Uses deprecated terminology |
| `compiler/17-Domain-IR-Representation.md` | Uses deprecated TypeDesc/world model |
| `compiler/17-Scheduler-Full.md` | Uses deprecated terminology, superseded by canonical 05-runtime |
| `compiler/18-Debugger-Part-1.md` | Uses deprecated TypeDesc |
| `compiler/19-Debugger-ValueKind.md` | Uses deprecated TypeDesc/world model |
| `compiler/20-TraceStorage.md` | Uses deprecated terminology |
| `compiler/21-Dual-Emit-Strategy.md` | Sprint-specific, uses deprecated terminology |
| `compiler/25-WrapUpGemini.md` | Fragment/notes |
| `compiler/999-Claude-Review.md` | Review notes, not spec |
| `compiler/Compiler-Audit-Areas-Checklist.md` | Checklist against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Blocks.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Bus-System.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Core.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Debug-Tooling.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Default-Sources.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Export-Pipeline.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Field-Runtime.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Passes.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Render-Pipeline.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Schedule-and-Runtime.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Signal-Runtime.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-Time-Architecture.md` | Audit against stale architecture |
| `compiler/Compiler-Audit-RedFlags-TypeSystem-and-Conversions.md` | Audit against stale architecture |
| `compiler/TypeDesc-Unification.md` | Documents deprecated TypeDesc system |
| `compiler/Pulses.md` | Uses deprecated terminology |
| `renderer/00-Overview-n-Context.md` | Early context, superseded by canonical 06-renderer |
| `renderer/01-RendererIR.md` | Uses deprecated TypeDesc concepts, superseded by canonical RenderIR |
| `renderer/03-Decisions-Color-PathFlattening-Basic3d.md` | Decision doc, architecture changed |
| `renderer/04-Decision-to-IR.md` | Decision doc, architecture changed |
| `renderer/05-VM-vs-Renderer-Impacts.md` | Decision doc, architecture changed |
| `renderer/06-3d-IR-Deltas.md` | 3D is not T1, uses deprecated terminology |
| `renderer/07-3d-Canonical.md` | 3D is not T1 |
| `renderer/08-Caching-Spec.md` | Uses deprecated terminology |
| `renderer/09-Materialization-Steps.md` | Uses deprecated terminology |
| `renderer/10-Rust-WASM-Compatibility.md` | Future work, not T1 |
| `renderer/11-FINAL-INTEGRATION.md` | Uses deprecated terminology |
| `renderer/12-Paths2D-Implementation-Plan.md` | Implementation plan against stale architecture |
| `renderer/12-ValueSlotPerNodeOutput.md` | Fragment, uses deprecated concepts |
| `renderer/13-Paths2D-Validation-Plan.md` | Validation plan against stale architecture |
| `renderer/14-Paths2D-Risks.md` | Risk assessment against stale architecture |
| `renderer/15-Paths2D-Dependency-Plan.md` | Plan against stale architecture |
| `renderer/16-Paths2D-Milestones.md` | Milestones against stale architecture |
| `renderer/17-Paths2D-DevTools-Recipes.md` | Recipes against stale architecture |
| `debugger/2-EventSystemIntegration.md` | Uses deprecated concepts |
| `debugger/3-Diagnostic-Events-and-Payloads-Schema.md` | Uses deprecated TypeDesc |
| `debugger/4-DiagnosticPayloadSpec.md` | Uses deprecated concepts |
| `debugger/5-DiagnosticsPolish.md` | Polish doc against stale architecture |
| `debugger/7-NonTech-.md` | Empty file |
| `debugger/8-NonTech-.md` | Empty file |
| `debugger/9-NonTech-.md` | Empty file |
| `confbox/*` | Third-party library (confbox), not design docs - RELOCATE |

---

## ARCHIVE (historical value only)

Files that document decisions or history but should not be integrated.

| File | Reason |
|------|--------|
| `debugger/1-NonTech-Overview.md` | Historical non-technical overview |
| `debugger/2-NonTech-Arch.md` | Historical non-technical architecture |
| `debugger/3-NonTech-LowLevel.md` | Historical non-technical low-level details |
| `debugger/4-NonTech-UI-Spec.md` | Historical UI spec, architecture changed |
| `debugger/5-NonTech-RulesEngine.md` | Historical rules engine concept |
| `debugger/6-NonTech-MainUI.md` | Historical main UI concepts |
| `debugger/10-PowerUser-Overview.md` | Historical power user features |
| `debugger-audit-checklist.md` | Audit checklist against old architecture |

---

## REVIEW (needs human decision)

Files that have potential value but need careful evaluation.

| File | Summary | Potential Value | Concern |
|------|---------|-----------------|---------|
| `PLAN-UNIFIED-BINDINGS.md` | Unifies wire/bus bindings under shared abstraction | Good architectural pattern for connection management | Uses some deprecated terminology, needs update to canonical types |
| `PLAN-UNIFIED-BINDINGS-CHECKLIST.md` | Checklist for unified bindings | Execution checklist | Depends on PLAN-UNIFIED-BINDINGS |
| `PLAN-UNIFIED-TRANSFORMS-LENSES-ADAPTERS.md` | Unified transform system for lenses/adapters | Transform stack concept may be useful | Lenses/adapters not in canonical T1, needs validation |
| `PLAN-UNIFIED-TRANSFORMS-LENSES-ADAPTERS-CHECKLIST.md` | Checklist for transforms | Execution checklist | Depends on parent plan |
| `PLAN-DEFAULT-SOURCES-STRUCTURAL-BLOCKS.md` | Default sources as structural blocks | Good pattern for ensuring inputs always have sources | Uses BlockRole concept that aligns with canonical spec |
| `PLAN-DEFAULT-SOURCES-STRUCTURAL-BLOCKS-CHECKLIST.md` | Checklist for default sources | Execution checklist | Depends on parent plan |
| `PROBLEM-STATEMENT-NUMERIC-RANGE-METADATA.md` | Numeric range semantics for phase/unit | Identifies real problem with range metadata | May have value if updated to canonical PayloadType model |
| `debugger/1-Diagnostics.md` | Diagnostics system design philosophy | Strong diagnostic event model concept | Core concepts are sound but terminology needs update |
| `debugger/Diagnostics-System.md` | Comprehensive diagnostics spec | Detailed diagnostics infrastructure | Good structure, needs terminology update to canonical spec |

---

## INTEGRATE (safe to add)

Files that can be integrated without conflicting with canonical spec.

| File | Target Topic | What it adds |
|------|--------------|--------------|
| *None identified* | - | All reviewed files use deprecated terminology or contradict canonical T1 constraints |

---

## Recommendations

### Immediate Actions

1. **Delete DISCARD files** - These contradict canonical spec and will cause confusion
2. **Move ARCHIVE files** to `design-docs/_archive/` for historical reference
3. **Relocate confbox/** - This is a third-party library, not design docs. Move to appropriate location.
4. **Evaluate REVIEW files** with human judgment - the concepts may have value but need rewriting

### For REVIEW Files

The following files have potentially valuable architectural patterns that could be extracted and rewritten against the canonical spec:

1. **PLAN-DEFAULT-SOURCES-STRUCTURAL-BLOCKS.md** - The concept of "every input always has exactly one source" aligns well with canonical spec. The BlockRole structural metadata pattern could be useful.

2. **debugger/Diagnostics-System.md** - The diagnostic event model (stable, addressable, typed facts) is architecturally sound. The three-stream model (compile/runtime/authoring) is useful.

3. **PLAN-UNIFIED-BINDINGS.md** - The "binding facade" concept for unifying wire/bus connections could reduce code duplication. However, it needs to be rewritten against canonical SignalType.

### Key Pattern: Terminology Mapping

If any concepts are salvaged, map terminology:

| Deprecated | Canonical |
|------------|-----------|
| TypeDesc | SignalType |
| world (signal/field/scalar) | Use Extent.Temporality + Extent.Cardinality |
| domain (number/vec2/color) | PayloadType |
| semantics | Part of PayloadType or Extent |
| unit | Dropped or in metadata |
| SlotType | SignalType at port |
| TypeWorld | Extent components |
| TypeDomain | PayloadType |

---

## Statistics

| Category | Count |
|----------|-------|
| DISCARD | 79 |
| ARCHIVE | 8 |
| REVIEW | 9 |
| INTEGRATE | 0 |
| **Total** | **96** |

### By Directory

| Directory | Total | Discard | Archive | Review |
|-----------|-------|---------|---------|--------|
| Top-level | 20 | 12 | 1 | 7 |
| compiler/ | 41 | 41 | 0 | 0 |
| debugger/ | 16 | 6 | 8 | 2 |
| renderer/ | 18 | 18 | 0 | 0 |
| confbox/ | ~10 | 10* | 0 | 0 |

*confbox is a third-party library that should be relocated, not design docs

---

## Appendix: Canonical Spec Quick Reference

### T1 Topics (Foundational - Cannot Change)

- `01-type-system.md`: 5-axis SignalType = PayloadType + Extent
- `02-block-system.md`: Blocks as only compute units, BlockRole
- `03-time-system.md`: Single TimeRoot, monotonic tMs, phase rails
- `04-compilation.md`: Raw -> Normalized -> IR pipeline
- `05-runtime.md`: Slot-addressed execution
- `06-renderer.md`: RenderIR, batching, sink-only
- `11-continuity-system.md`: Gauge invariance (anti-jank)
- `INVARIANTS.md`: 31 non-negotiable laws (I1-I31)

### PayloadType Enum (Canonical)

```
float | int | vec2 | vec3 | vec4 | color | phase | bool | unit | trigger | domain | mesh | path | image | any
```

### Extent Structure (Canonical)

```
{
  Cardinality: zero | one | many
  Temporality: continuous | discrete
  Binding: static | dynamic
  Perspective: global | local
  Branch: main | variant
}
```

---

**Report Status**: Complete
**Report Generated**: 2026-01-12
