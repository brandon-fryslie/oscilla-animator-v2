---
status: CANONICAL
generated: 2026-01-09T17:00:00Z
updated: 2026-01-10T19:45:00Z
updating_started: 2026-01-10T16:30:00Z
updating_sources:
  - design-docs/debugger/*.md (16 files)
  - design-docs/4-Event-System/*.md (6 files)
  - design-docs/ANTi-JANK-GAUGE-INVARIANCE.md
approved_by: Brandon Fryslie
approval_method: full_walkthrough + integrated_debugger_update + event_system_integration + continuity_integration
source_documents: 51
topics: 13
---

# Oscilla v2.5: Canonical Specification Index

> **STATUS: ✅ CANONICAL**
> Debugger specification integrated successfully (2026-01-10T18:30:00Z)

Generated: 2026-01-09T17:00:00Z
Last Updated: 2026-01-10T19:45:00Z
Approved by: Brandon Fryslie
Source Documents: 51 files (27 original + 16 debugger + 1 anti-jank + 6 event-system + 1 modulation-table)
Total Resolutions: 74 (53 original + 20 debugger integration + 1 continuity)

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [SUMMARY](./SUMMARY.md) | Executive overview—start here |
| [INVARIANTS](./INVARIANTS.md) | Non-negotiable rules (27 laws) |
| [GLOSSARY](./GLOSSARY.md) | Term definitions (50+ terms) |
| [Resolution Log](./RESOLUTION-LOG.md) | Decision history (50 resolutions) |

## Topics

| # | Topic | Description | Key Concepts |
|---|-------|-------------|--------------|
| 01 | [Type System](./topics/01-type-system.md) | Five-axis type model | PayloadType, Extent, SignalType, AxisTag |
| 02 | [Block System](./topics/02-block-system.md) | Compute units and roles | Block, BlockRole, DerivedBlockMeta |
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
| Block, BlockRole, DerivedBlockMeta | [02-block-system.md](./topics/02-block-system.md) |
| UnitDelay, Lag, Phasor, SampleAndHold | [02-block-system.md](./topics/02-block-system.md) |
| TimeRoot, Rails, tMs | [03-time-system.md](./topics/03-time-system.md) |
| NormalizedGraph, CompiledProgramIR | [04-compilation.md](./topics/04-compilation.md) |
| State slots, scheduling | [05-runtime.md](./topics/05-runtime.md) |
| RenderInstances2D, batching | [06-renderer.md](./topics/06-renderer.md) |
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
   - Status: CANONICAL (fully approved)

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
