---
status: CANONICAL
generated: 2026-01-09T17:00:00Z
updated: 2026-01-22T23:00:00Z
approved_by: Brandon Fryslie
approval_method: full_walkthrough + domain_system_reconceptualization + cardinality_generic_integration + payload_generic_integration + kernel_roadmap_integration + renderer_architecture_integration + layout_system_integration + camera_projection_integration
source_documents: 77
topics: 20
resolutions: 115
update_history:
  - date: 2026-01-10T19:45:00Z
    sources_added: 23
    topics_updated: [07, 08, 09, 10, 12, 13]
    topics_added: 7
    resolutions_made: 24
  - date: 2026-01-11T06:15:00Z
    sources_added: 1
    topics_added: 1
    topics_updated: []
    resolutions_made: 2
    notes: "Archived 6 conversation exports as design history; integrated graph editor UI spec"
  - date: 2026-01-18T14:00:00Z
    action: "Domain System Reconceptualization"
    sources_integrated: [design-docs/WHAT-IS-A-DOMAIN.md, design-docs/WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md]
    topics_updated: [01-type-system, 02-block-system]
    resolutions_made: 5
    notes: "Major restructuring: Domain=ontological classification; Three-stage architecture (Primitive→Array→Layout); New types: DomainSpec, InstanceDecl, InstanceRef"
  - date: 2026-01-22T12:00:00Z
    action: "Cardinality-Generic Block Integration"
    sources_integrated: [design-docs/_new/0-CardinalityGeneric-Block-Type-Spec.md]
    topics_updated: [02-block-system, 04-compilation]
    resolutions_made: 7
    notes: "Formalized cardinality-generic block contract; Added StateId to GLOSSARY; Fixed stale DomainRef→InstanceRef in GLOSSARY; Rejected registry metadata; Deferred diagnostic codes and cardinality-transform naming"
  - date: 2026-01-22T14:30:00Z
    action: "Payload-Generic Blocks & State Mapping Refinement"
    sources_integrated: [design-docs/_new/0-CardinalityGeneric-Block-Types-Impact.md, design-docs/_new/0-PayloadGeneriic-Block-Type-Spec.md]
    topics_updated: [02-block-system, 04-compilation, 05-runtime]
    resolutions_made: 5
    notes: "Formalized payload-generic block contract; Range-based StateMappings replace StateKey; Added vec3 to PayloadType; Stride concept; Deprecated Polymorphism section; Unit constraints deferred"
  - date: 2026-01-22T18:00:00Z
    action: "Kernel Roadmap & Local-Space Geometry Integration"
    sources_integrated: [design-docs/_new/kernel-roadmap/0-kernel-roadmap.md, design-docs/_new/kernel-roadmap/1-local-space.md, design-docs/_new/kernel-roadmap/2-local-space-end-to-end-spec.md, design-docs/_new/kernel-roadmap/3-local-space-spec-deeper.md, design-docs/_new/kernel-roadmap/5-opcode-interpreter.md, design-docs/_new/kernel-roadmap/6-signal-kernel.md, design-docs/_new/kernel-roadmap/7-field-kernel.md]
    topics_created: [16-coordinate-spaces]
    topics_updated: [01-type-system, 05-runtime, 06-renderer]
    resolutions_made: 7
    notes: "New Topic 16 (Coordinate Spaces); Three-layer execution architecture; DrawPathInstancesOp replaces RenderIR; shape2d added to PayloadType; scale semantics (renamed from size); Typed banks as T3 note; Convention-based coord enforcement"
  - date: 2026-01-22T20:30:00Z
    action: "Renderer Architecture Integration"
    sources_integrated: [design-docs/_new/renderer/8-before-render.md, design-docs/_new/renderer/9-renderer.md, design-docs/_new/renderer/10-multiple-backends.md, design-docs/_new/renderer/11-svg.md]
    topics_updated: [05-runtime, 06-renderer]
    resolutions_made: 5
    notes: "RenderAssembler (runtime component); RenderBackend interface; PathTopologyDef; Topology registry (numeric IDs); SVG backend strategies; Per-instance shape future note; GeometryRegistry deprecated"
  - date: 2026-01-22T22:00:00Z
    action: "Layout System Integration"
    sources_integrated: [design-docs/_new/shapes-and-layout/15-layout.md, design-docs/_new/shapes-and-layout/17-layout-2.6d.md]
    topics_created: [17-layout-system]
    topics_updated: []
    resolutions_made: 7
    notes: "New Topic 17 (Layout System); Layout as Field<vec2> from kernels; circleLayout/lineLayout/gridLayout with normative per-lane math; Intrinsic set closed to {index, normalizedIndex, randomId}; FieldExprLayout deprecated; InstanceDecl.layout removed; Layout kernel contract pattern"
  - date: 2026-01-22T23:00:00Z
    action: "Camera & Projection Integration"
    sources_integrated: [design-docs/CANONICALIZED-QUESTIONS-shapes-layout-20260122.md (camera/projection questions)]
    topics_created: [18-camera-projection]
    topics_updated: []
    resolutions_made: 0
    notes: "New Topic 18 (Camera & Projection); Projection kernels (ortho/perspective); Camera block; RenderAssembler pipeline; Depth ordering; StepRender position contract; Added 6 terms to GLOSSARY"
  - date: 2026-01-22T23:30:00Z
    action: "2.5D Profile & Cross-Topic Updates"
    sources_integrated: [design-docs/_new/shapes-and-layout/17-layout-2.6d.md, design-docs/_new/shapes-and-layout/12-shapes-types.md, design-docs/_new/shapes-and-layout/13-shapes-3d.md, design-docs/_new/3d/4-CombineMode-Layer-Answer.md]
    topics_created: [19-2_5d-profile]
    topics_updated: [01-type-system, 05-runtime, 16-coordinate-spaces]
    resolutions_made: 4
    notes: "New Topic 19 (2.5D Profile); CombineMode restrictions table + 4 invariants in T01; shape3d packed layout (T3) in T01; World extended to [0,1]³ in T16; Camera pipeline steps in T05 RenderAssembler"
---

# Oscilla v2.5: Canonical Specification Index

> **STATUS: ✅ CANONICAL**
> Last updated: 2026-01-22T23:30:00Z (added topics 18, 19; updated topics 01, 05, 16)
> Approved by: Brandon Fryslie

Generated: 2026-01-09T17:00:00Z
Last Updated: 2026-01-22T22:00:00Z
Approved by: Brandon Fryslie
Source Documents: 77 files
Total Resolutions: 115

---

## For Agents

**Day-to-day implementation:** Read [ESSENTIAL-SPEC.md](./ESSENTIAL-SPEC.md) (~25k tokens)

This condensed spec contains all invariants, glossary core terms, and T1 content from:
- Type System (PayloadType, Extent, SignalType, Domain/Instance)
- Block System (roles, three-stage architecture, stateful primitives)
- Compilation (pipeline, NormalizedGraph, scheduling, slot allocation)
- Runtime (execution model, state management, hot-swap)

**When to read full topics:**
| Task | Full Topic |
|------|------------|
| Implementing diagnostics | 07-diagnostics-system.md, 08-observation-system.md |
| Implementing UI panels | 09-debug-ui-spec.md, 14-modulation-table-ui.md, 15-graph-editor-ui.md |
| Disputed design questions | RESOLUTION-LOG.md |
| Deep type system details | 01-type-system.md |
| Coordinate spaces / transforms | 16-coordinate-spaces.md |
| Layout kernels / positioning | 17-layout-system.md |
| Camera, projection, depth ordering | 18-camera-projection.md |
| 2.5D / 3D profiles, constraint authoring | 19-2_5d-profile.md |
| Renderer / RenderIR | 06-renderer.md |
| Continuity/anti-jank work | 11-continuity-system.md |
| Event coordination | 12-event-hub.md, 13-event-diagnostics-integration.md |

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [ESSENTIAL-SPEC](./ESSENTIAL-SPEC.md) | **Condensed spec for agents** (~25k tokens) |
| [SUMMARY](./SUMMARY.md) | Executive overview—start here |
| [INVARIANTS](./INVARIANTS.md) | Non-negotiable rules (27 laws) |
| [GLOSSARY](./GLOSSARY.md) | Term definitions (50+ terms) |
| [Resolution Log](./RESOLUTION-LOG.md) | Decision history (50 resolutions) |

## Topics

| # | Topic | Description | Key Concepts |
|---|-------|-------------|--------------|
| 01 | [Type System](./topics/01-type-system.md) | Five-axis type model | PayloadType, Extent, SignalType, DomainSpec, InstanceDecl |
| 02 | [Block System](./topics/02-block-system.md) | Compute units and roles | Block, BlockRole, Primitive → Array → Layout |
| 03 | [Time System](./topics/03-time-system.md) | Time sources and rails | TimeRoot, Rails, tMs, phase |
| 04 | [Compilation](./topics/04-compilation.md) | Graph normalization and IR | NormalizedGraph, CompiledProgramIR |
| 05 | [Runtime](./topics/05-runtime.md) | Execution model and state | State slots, scheduling, erasure |
| 06 | [Renderer](./topics/06-renderer.md) | Render pipeline and sinks | RenderInstances2D, batching |
| 07 | [Diagnostics System](./topics/07-diagnostics-system.md) | Structured diagnostics and observability | Diagnostic, DiagnosticHub, TargetRef, Events |
| 08 | [Observation System](./topics/08-observation-system.md) | Runtime state capture and queries | DebugGraph, DebugSnapshot, DebugTap, DebugService |
| 08b | [Diagnostic Rules Engine](./topics/08b-diagnostic-rules-engine.md) | Heuristic rules for problem detection | Rules A-H, evidence, fixes |
| 09 | [Debug UI](./topics/09-debug-ui-spec.md) | Non-technical inspection interface | Probe mode, Trace view, diagnostics drawer |
| 10 | [Power-User Debugging](./topics/10-power-user-debugging.md) | Advanced observation tools (post-MVP) | TraceEvents, technical panel |
| 11 | [Continuity System](./topics/11-continuity-system.md) | Anti-jank architecture (gauge invariance) | Phase offset, value reconciliation, field projection |
| 12 | [Event Hub](./topics/12-event-hub.md) | Event coordination spine | Typed events, emission patterns, decoupling |
| 13 | [Event-Diagnostics Integration](./topics/13-event-diagnostics-integration.md) | How events drive diagnostics | DiagnosticHub subscriptions, snapshot semantics |
| 14 | [Modulation Table UI](./topics/14-modulation-table-ui.md) | Table view for port connections (UI only) | Transform chains, Adapters, Lenses |
| 15 | [Graph Editor UI](./topics/15-graph-editor-ui.md) | Linear auto-layout graph editor | Chain, Pivot Block, Perspective Rotation, Focus/Dimming |
| 16 | [Coordinate Spaces](./topics/16-coordinate-spaces.md) | Three-space coordinate model | Local/World/Viewport, scale, transforms |
| 17 | [Layout System](./topics/17-layout-system.md) | Field-based positioning via kernels | circleLayout, lineLayout, gridLayout, intrinsics |
| 18 | [Camera & Projection](./topics/18-camera-projection.md) | Projection kernels and camera pipeline | projectWorldToScreenOrtho, Camera Block, depth ordering |
| 19 | [2.5D Profile](./topics/19-2_5d-profile.md) | Constrained authoring mode (T3) | PatchProfile, depth policy, tilt-only camera |

## Recommended Reading Order

For newcomers to this architecture:

1. **[SUMMARY](./SUMMARY.md)** - Get the big picture
2. **[INVARIANTS](./INVARIANTS.md)** - Understand the rules
3. **[01-type-system](./topics/01-type-system.md)** - Foundation concepts
4. **[02-block-system](./topics/02-block-system.md)** - Core building blocks
5. **[GLOSSARY](./GLOSSARY.md)** - Reference as needed

For implementers:
1. [INVARIANTS](./INVARIANTS.md) - Don't violate these
2. [04-compilation](./topics/04-compilation.md) - How it compiles
3. [05-runtime](./topics/05-runtime.md) - Runtime constraints
4. [GLOSSARY](./GLOSSARY.md) - Naming conventions

## Search Hints

Looking for something specific? Here's where to find it:

| Concept | Location |
|---------|----------|
| PayloadType, Extent, SignalType | [01-type-system.md](./topics/01-type-system.md) |
| Cardinality, Temporality, Binding | [01-type-system.md](./topics/01-type-system.md) |
| Domain, DomainSpec, DomainTypeId | [01-type-system.md](./topics/01-type-system.md) |
| Instance, InstanceDecl, InstanceRef | [01-type-system.md](./topics/01-type-system.md) |
| Block, BlockRole, DerivedBlockMeta | [02-block-system.md](./topics/02-block-system.md) |
| Primitive Block, Array Block, Layout Block | [02-block-system.md](./topics/02-block-system.md) |
| Three-stage architecture | [02-block-system.md](./topics/02-block-system.md) |
| Cardinality-Generic Block, lane-locality | [02-block-system.md](./topics/02-block-system.md) |
| Payload-Generic Block, AllowedPayloads | [02-block-system.md](./topics/02-block-system.md) |
| UnitDelay, Lag, Phasor, SampleAndHold | [02-block-system.md](./topics/02-block-system.md) |
| TimeRoot, Rails, tMs | [03-time-system.md](./topics/03-time-system.md) |
| NormalizedGraph, CompiledProgramIR | [04-compilation.md](./topics/04-compilation.md) |
| Expression forms, broadcast, ZipSig | [04-compilation.md](./topics/04-compilation.md) |
| Payload specialization, stride | [04-compilation.md](./topics/04-compilation.md) |
| State slots, scheduling | [05-runtime.md](./topics/05-runtime.md) |
| StateId, StateMappingScalar, StateMappingField | [05-runtime.md](./topics/05-runtime.md) |
| Lane, stride, state migration | [05-runtime.md](./topics/05-runtime.md) |
| RenderFrameIR, DrawPathInstancesOp, batching | [06-renderer.md](./topics/06-renderer.md) |
| PathGeometryTemplate, PathInstanceSet, PathStyle | [06-renderer.md](./topics/06-renderer.md) |
| PathTopologyDef, topology registry, verbs | [06-renderer.md](./topics/06-renderer.md) |
| RenderBackend, backend interface, SVG backend | [06-renderer.md](./topics/06-renderer.md) |
| RenderAssembler, shape2d resolution, render assembly | [05-runtime.md](./topics/05-runtime.md) |
| Local Space, World Space, Viewport Space | [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md) |
| scale, scale2, transform chain | [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md) |
| Coordinate-space enforcement, naming conventions | [16-coordinate-spaces.md](./topics/16-coordinate-spaces.md) |
| Layout kernels, circleLayout, lineLayout, gridLayout | [17-layout-system.md](./topics/17-layout-system.md) |
| Intrinsics (index, normalizedIndex, randomId) | [17-layout-system.md](./topics/17-layout-system.md) |
| Position fields, world-normalized layout | [17-layout-system.md](./topics/17-layout-system.md) |
| Three-layer architecture, Opcode/Signal Kernel/Field Kernel | [05-runtime.md](./topics/05-runtime.md) |
| Materializer, typed banks | [05-runtime.md](./topics/05-runtime.md) |
| shape2d, handle type | [01-type-system.md](./topics/01-type-system.md) |
| RenderInstances2D | [06-renderer.md](./topics/06-renderer.md) |
| Diagnostic, DiagnosticHub, TargetRef | [07-diagnostics-system.md](./topics/07-diagnostics-system.md) |
| DiagnosticCode, Severity, Events | [07-diagnostics-system.md](./topics/07-diagnostics-system.md) |
| DebugGraph, DebugSnapshot, DebugTap | [08-observation-system.md](./topics/08-observation-system.md) |
| DebugService, ValueSummary | [08-observation-system.md](./topics/08-observation-system.md) |
| Rules A-H, Rule thresholds | [08b-diagnostic-rules-engine.md](./topics/08b-diagnostic-rules-engine.md) |
| Probe mode, Trace view, fixes | [09-debug-ui-spec.md](./topics/09-debug-ui-spec.md) |
| TraceEvent, Trace panel | [10-power-user-debugging.md](./topics/10-power-user-debugging.md) |
| Phase offset, continuity, gauge invariance | [11-continuity-system.md](./topics/11-continuity-system.md) |
| EventHub, EditorEvent, GraphCommitted | [12-event-hub.md](./topics/12-event-hub.md) |
| DiagnosticHub event subscriptions | [13-event-diagnostics-integration.md](./topics/13-event-diagnostics-integration.md) |
| Transform, Adapter, Lens, Modulation Table UI | [14-modulation-table-ui.md](./topics/14-modulation-table-ui.md) |
| Chain, Pivot Block, Perspective Rotation | [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md) |
| Focused Subgraph, Dimmed Subgraph | [15-graph-editor-ui.md](./topics/15-graph-editor-ui.md) |
| projectWorldToScreenOrtho, projectWorldToScreenPerspective | [18-camera-projection.md](./topics/18-camera-projection.md) |
| Camera Block, visible, depth ordering | [18-camera-projection.md](./topics/18-camera-projection.md) |
| Projection kernels, RenderAssembler camera pipeline | [18-camera-projection.md](./topics/18-camera-projection.md) |
| StepRender position contract (positionXY, positionZ) | [18-camera-projection.md](./topics/18-camera-projection.md) |
| PatchProfile, 2D/2.5D/3D profiles | [19-2_5d-profile.md](./topics/19-2_5d-profile.md) |
| Depth policy, bounded depth authoring | [19-2_5d-profile.md](./topics/19-2_5d-profile.md) |
| Tilt-only camera, constrained camera controls | [19-2_5d-profile.md](./topics/19-2_5d-profile.md) |
| All term definitions | [GLOSSARY.md](./GLOSSARY.md) |
| All invariant rules (I1-I31) | [INVARIANTS.md](./INVARIANTS.md) |

## Appendices

- [Source Map](./appendices/source-map.md) - Which sources contributed to which sections
- [Superseded Documents](./appendices/superseded-docs.md) - Archived original documents

---

## About This Encyclopedia

This specification series was generated through a structured canonicalization process:

1. **Source Analysis** (Phase 1): 27 documents analyzed for contradictions and ambiguities
2. **Resolution** (Phase 1): 53 items resolved through iterative refinement
3. **Editorial Review**: Peer design review conducted
4. **User Approval**: All decisions approved by Brandon Fryslie (full walkthrough method)
5. **Update** (Phase 2, 2026-01-10): Debugger specification integrated (16 files, 20 resolutions)
   - 4 critical blockers resolved
   - 4 high-priority design decisions made
   - 4 new canonical topics created (08, 08b, 09, 10)
   - 2 invariants added (I28, I29)
   - 5 new glossary terms
   - Total resolutions: 53 → 73

Resolution history is preserved in [RESOLUTION-LOG.md](./RESOLUTION-LOG.md).

---

## Archived & Legacy Documents

Old specification documents, working files, and superseded materials are archived in:
[spec-archived-20260110-190000/](../spec-archived-20260110-190000/)

This includes:
- **Intermediate working files** from canonicalization (questions, summaries, integration reports)
- **Legacy designs** (v1 debugger specs, event system, modulation tables, etc.)
- **Single-document reference** (monolithic version for quick lookup)
- **Design exploration** (earlier iterations, analysis documents)

See the archive [README](../spec-archived-20260110-190000/README.md) for complete manifest.

## Companion Document

For a condensed single-document quick reference, see:
[../spec-archived-20260110-190000/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md](../spec-archived-20260110-190000/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md)

The monolith provides quick lookup; this encyclopedia provides exhaustive detail and is the authoritative specification.
