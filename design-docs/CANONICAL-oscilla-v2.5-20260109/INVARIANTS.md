---
parent: INDEX.md
priority: CRITICAL
---

# System Invariants

> **These rules are non-negotiable. Violations indicate bugs.**

Invariants are prominently placed because they constrain all other decisions.
When reading topic documents, keep these rules in mind.

---

## A. Time, Continuity, and Edit-Safety

### I1: Time is Monotonic and Unbounded

**Rule**: `tMs` never wraps, resets, or clamps. Time is always increasing.

**Rationale**: Monotonic time is required for deterministic phase calculations and replay.

**Consequences of Violation**: Phase discontinuities, non-deterministic behavior, broken replay.

**Enforcement**: Runtime assertion; TimeRoot implementation.

---

### I2: Gauge Invariance (Transport Continuity)

**Rule**: Effective values (phase, parameters, fields) are continuous across discontinuities unless explicitly reset by user action. This is enforced by gauge layers (phase offset, value reconciliation, field projection) that absorb discontinuities.

**Formal Statement**: For all observables `x_eff(t)`:
```
lim(t→t0⁻) x_eff(t) = lim(t→t0⁺) x_eff(t)
```
Even when underlying `x_base(t)` jumps due to scrubbing, looping, hot-swap, or topology changes.

**Rationale**: Without gauge invariance:
- Scrubbing breaks animation
- Loops pop at boundaries
- Edits feel jarring
- Export cannot match playback
- The system feels mechanical, not alive

**Consequences of Violation**: Visual pops, broken export parity, unusable live editing.

**Enforcement**: Continuity System (topic 11); phase offset in timeDerive; value reconciliation and field projection at hot-swap boundaries.

**See**: [11-continuity-system](./topics/11-continuity-system.md) for complete specification.

---

### I3: State Continuity with Stable IDs

**Rule**: Stateful blocks have stable StateIds. Migration rules:
- Same StateId + same type/layout → copy
- Same StateId + compatible layout → transform
- Else → reset + surface as diagnostic

**Rationale**: Without this, no determinism, debugging, or Rust port.

**Consequences of Violation**: State becomes "whatever closure happened to persist."

**Enforcement**: State migration system with diagnostics.

---

### I4: Deterministic Event Ordering

**Rule**: Events need stable ordering across combine and within-frame scheduling.

**Rationale**: "Sometimes it triggers, sometimes not" kills performance contexts.

**Consequences of Violation**: Non-deterministic behavior in live performance.

**Enforcement**: Explicit ordering in scheduler; writer order is stable.

---

### I5: Single Time Authority

**Rule**: One authority produces time; everything else derives.

**Rationale**: No "player loops" competing with patch loops.

**Consequences of Violation**: Unexplained jumps on bar boundaries.

**Enforcement**: Single TimeRoot per patch.

---

## B. Graph Semantics

### I6: Compiler Never Mutates the Graph

**Rule**: No blocks or edges inserted during compilation.

**Rationale**: The compiler consumes a fully explicit NormalizedGraph.

**Consequences of Violation**: Hidden behavior, debugging impossible.

**Enforcement**: Type signature; NormalizedGraph is immutable input.

---

### I7: Explicit Cycle Semantics

**Rule**: Cycles must be:
- Detected structurally (Tarjan's SCC)
- Validated (crosses a memory boundary - stateful block)
- Scheduled deterministically

**Rationale**: Otherwise any "cool" patch becomes a random bug generator.

**Consequences of Violation**: Non-deterministic feedback behavior.

**Enforcement**: Cycle validation in compiler.

---

### I8: Slot-Addressed Execution

**Rule**: Names are for UI; runtime uses indices. No lookups by string, closures, or object graphs in hot loops.

**Rationale**: Required for performance targets and Rust port.

**Consequences of Violation**: Never hit perf targets; Rust will be miserable.

**Enforcement**: CompiledProgramIR uses slot indices only.

---

### I9: Schedule is Data

**Rule**: No hidden evaluation. Schedule is inspectable, diffable, traceable data.

**Rationale**: If runtime behavior lives in incidental traversal order, debugging is impossible.

**Consequences of Violation**: Non-reproducible behavior.

**Enforcement**: Schedule IR is explicit data structure.

---

### I10: Uniform Transform Semantics

**Rule**: Transforms are table-driven and type-driven:
- Scalar transforms → scalars
- Signal transforms → signal plans
- Field transforms → field expr nodes
- Reductions (field→signal) are explicit and diagnosable

**Rationale**: If transforms are "whatever each block does," you can't reason about patches.

**Consequences of Violation**: Unpredictable type behavior.

**Enforcement**: Transform registry with type rules.

---

## C. Fields, Identity, and Performance

### I11: Stable Element Identity

**Rule**: Instances provide stable element IDs, not "array indices we hope stay stable."

**Rationale**: Required for: temporal effects, physics, per-element state, selection UI, caches.

**Consequences of Violation**: Can't do trails, history, physics, or coherent UI.

**Enforcement**: Instance as first-class identity handle; pool-based allocation with stable indices.

---

### I12: Lazy Fields with Explicit Materialization

**Rule**: Materialization must be scheduled, cached, and attributable.

**Rationale**: If every field becomes an array "because it's easiest," you hit a wall.

**Consequences of Violation**: Memory and performance explosion.

**Enforcement**: Explicit materialization points; field expr DAGs.

---

### I13: Structural Sharing / Hash-Consing

**Rule**: Identical FieldExpr/SignalExpr subtrees share an ExprId.

**Rationale**: Without canonicalization, compilation and runtime explode.

**Consequences of Violation**: Duplicate computation; memory bloat.

**Enforcement**: Hash-consing in expr construction.

---

### I14: Explicit Cache Keys

**Rule**: Every cache depends on: (time, instance, upstream slots, params, state version).

**Rationale**: Without explicit cache keys, oscillate between "slow" and "wrong."

**Consequences of Violation**: Stale caches or cache misses everywhere.

**Enforcement**: Cache key model in compilation.

---

## D. Rendering

### I15: Renderer is a Sink, Not an Engine

**Rule**: Renderer accepts render commands/instances, batches, sorts, culls, rasterizes. Zero "creative logic."

**Rationale**: All motion/layout/color comes from the patch.

**Consequences of Violation**: Renderer becomes second patch system.

**Enforcement**: Render IR; no "radius/wobble/spiral mode" in renderer.

---

### I16: Real Render IR

**Rule**: Generic render intermediate with instances, geometry assets, materials, layering.

**Rationale**: Otherwise every new visual idea requires new renderer code.

**Consequences of Violation**: Renderer becomes bottleneck for features.

**Enforcement**: Render IR specification.

---

### I17: Planned Batching

**Rule**: Render output contains enough info to batch deterministically.

**Rationale**: Canvas/WebGL performance requires minimizing state changes and draw calls.

**Consequences of Violation**: CPU-bound rendering.

**Enforcement**: Style/material keys, z/layer, blend in render commands.

---

### I18: Temporal Stability in Rendering

**Rule**: Old program renders until new program is ready. Swap is atomic. No flicker.

**Rationale**: Otherwise live editing feels like "glitching a web demo."

**Consequences of Violation**: Jank during edits.

**Enforcement**: Atomic swap; render continuity.

---

## E. Debuggability

### I19: First-Class Error Taxonomy

**Rule**: Errors include:
- Type mismatch: from/to, suggested adapters
- Cycle illegal: show loop and missing memory edge
- Bus conflict: show publishers + combine semantics
- Forced materialization: show culprit sink and expr chain

**Rationale**: If errors are vague, only programmers can use it.

**Consequences of Violation**: Unusable for non-programmers.

**Enforcement**: Error types in compiler output.

---

### I20: Traceability by Stable IDs

**Rule**: Every value is attributable: produced by NodeId/StepId, transformed by lens chain, combined on BusId, materialized due to SinkId.

**Rationale**: Must answer "why is this 0?" quickly.

**Consequences of Violation**: Feels like a toy.

**Enforcement**: Structural instrumentation with stable IDs.

---

### I21: Deterministic Replay

**Rule**: Given PatchRevision + Seed + inputs, output is identical.

**Rationale**: Foundation for bug reports, performance tuning, collaboration, server authority.

**Consequences of Violation**: Can't reproduce issues.

**Enforcement**: No Math.random(); seeded randomness only.

---

## F. Live Performance

### I22: Safe Modulation Ranges

**Rule**: Normalized domains (0..1, phase 0..1, timeMs), explicit unit tags where critical.

**Rationale**: Otherwise patches become fragile "magic numbers."

**Consequences of Violation**: Patches can't be reused.

**Enforcement**: Unit discipline in type system.

---

## G. Scaling

### I23: Separation of Patch vs Instance

**Rule**: A patch is a spec. A runtime instance has: time state, state cells, caches, inputs, render target.

**Rationale**: Required for multi-client and server-authoritative.

**Consequences of Violation**: Can't scale beyond single browser tab.

**Enforcement**: Patch/Instance separation in architecture.

---

### I24: Snapshot/Transaction Model

**Rule**: Live edits are transactional.

**Rationale**: Required for multi-client sync and trustworthy undo/redo.

**Consequences of Violation**: Desync and broken undo.

**Enforcement**: Transaction-based edit model.

---

### I25: Asset System with Stable IDs

**Rule**: Assets (geometry, fonts, SVGs) have stable IDs.

**Rationale**: Required for collaboration and deployment.

**Consequences of Violation**: "Whatever the client has loaded" breaks collaboration.

**Enforcement**: Asset registry with IDs.

---

## H. Architecture Laws

### I26: Every Input Has a Source

**Rule**: DefaultSource block is ALWAYS connected during GraphNormalization.

**Rationale**: Combine modes require exactly one aggregated value per frame.

**Consequences of Violation**: Undefined input behavior.

**Enforcement**: GraphNormalization invariant.

---

### I27: The Toy Detector Meta-Rule

**Rule**: If behavior depends on UI order, object identity, or incidental evaluation order—it's a toy.

**Rationale**: Execution order, identity, state, transforms, time topology must all be explicit.

**Consequences of Violation**: Non-deterministic, non-portable system.

**Enforcement**: This entire invariant set.

---

### I28: Diagnostic Attribution

**Rule**: Every diagnostic must be attributable to a specific graph element via TargetRef.

**Rationale**: Diagnostics must be navigable and fixable. A diagnostic without a target is useless.

**Consequences of Violation**: Users cannot locate/fix the problem.

**Enforcement**: TargetRef in Diagnostic type; compiler validation.

---

### I29: Error Taxonomy

**Rule**: Errors are categorized by domain (compile/runtime/authoring/perf) and severity (fatal/error/warn/info/hint).

**Rationale**: Different error streams require different UI treatment and urgency handling.

**Consequences of Violation**: UI cannot prioritize, users miss critical issues.

**Enforcement**: DiagnosticCode enumeration; severity assignment in producers.

---

### I30: Continuity is Deterministic

**Rule**: All continuity operations (phase offset, value reconciliation, field projection, slew) use `t_model_ms` and deterministic algorithms. Given same inputs, continuity produces identical outputs.

**Rationale**: Export must match playback. Non-deterministic continuity breaks replay and debugging.

**Consequences of Violation**: Export drifts from playback, debugging becomes impossible, profiling is meaningless.

**Enforcement**: Continuity System uses only `t_model_ms`, seeded RNGs, and deterministic mapping algorithms.

---

### I31: Export Matches Playback (Continuity Parity)

**Rule**: Export uses the exact same schedule, continuity steps, and policies as live playback. No "simplified" or "optimized" continuity for export.

**Rationale**: Users expect export to match what they see. Divergence destroys trust.

**Consequences of Violation**: "It looks different when I export" - deal-breaker for professional use.

**Enforcement**: Export loop executes same `StepContinuityApply` steps as live runtime.

---

## Invariant Quick Reference

| ID | Category | Rule (Brief) |
|----|----------|--------------|
| I1 | Time | Time is monotonic, never wraps |
| I2 | Continuity | Gauge invariance across discontinuities |
| I3 | Time | State migration with stable IDs |
| I4 | Time | Deterministic event ordering |
| I5 | Time | Single time authority |
| I6 | Graph | Compiler never mutates graph |
| I7 | Graph | Cycles cross stateful boundary |
| I8 | Graph | Slot-addressed execution |
| I9 | Graph | Schedule is data |
| I10 | Graph | Uniform transform semantics |
| I11 | Fields | Stable element identity |
| I12 | Fields | Lazy fields, explicit materialization |
| I13 | Fields | Structural sharing / hash-consing |
| I14 | Fields | Explicit cache keys |
| I15 | Render | Renderer is sink only |
| I16 | Render | Real render IR |
| I17 | Render | Planned batching |
| I18 | Render | Temporal stability (no flicker) |
| I19 | Debug | First-class error taxonomy |
| I20 | Debug | Traceability by stable IDs |
| I21 | Debug | Deterministic replay |
| I22 | Perf | Safe modulation ranges |
| I23 | Scale | Patch vs instance separation |
| I24 | Scale | Snapshot/transaction model |
| I25 | Scale | Asset system with stable IDs |
| I26 | Arch | Every input has a source |
| I27 | Arch | Toy detector meta-rule |
| I28 | Debug | Diagnostic attribution to targets |
| I29 | Debug | Error taxonomy by domain/severity |
| I30 | Continuity | Continuity is deterministic |
| I31 | Continuity | Export matches playback |

---

## Related Documents

- [01-type-system](./topics/01-type-system.md) - Enforces I22 (unit discipline)
- [02-block-system](./topics/02-block-system.md) - Enforces I6, I26 (graph invariants)
- [04-compilation](./topics/04-compilation.md) - Enforces I7, I8, I9 (scheduling)
- [05-runtime](./topics/05-runtime.md) - Enforces I1-I5 (time/state invariants)
- [06-renderer](./topics/06-renderer.md) - Enforces I15-I18 (render invariants)
