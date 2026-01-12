---
source_file: topics/10-power-user-debugging.md
source_hash: 72e8922a38ab
index_version: 1
generated: 2026-01-12
---

# INDEX: Power-User Debugging (Post-MVP)

## 1. Document Metadata

| Field | Value |
|-------|-------|
| **Parent** | `../INDEX.md` |
| **Topic Slug** | `power-user-debugging` |
| **Order** | 10 |
| **Status** | post-MVP |
| **Title** | Power-User Debugging (Post-MVP) |
| **Description** | Advanced observation and analysis tools for technical users who need to understand exactly what the system is doing. |

---

## 2. Outline & Structure

```
10-power-user-debugging.md
├── Overview (why power-user debugging matters)
├── Part 1: Trace Events (Deterministic Log)
│   ├── What They Are
│   ├── TraceEvent Types (10 event types)
│   ├── Trace Scope (memory safety & config)
│   └── Trace Ring Buffer
├── Part 2: Technical Debug Panel (UI Layout)
│   ├── Tab 1: Graph
│   ├── Tab 2: Buses
│   ├── Tab 3: Bindings
│   ├── Tab 4: Trace
│   └── Tab 5: Performance
├── Part 3: Patch Diff Analysis (Post-MVP)
├── Part 4: Determinism Contracts (Exposed)
├── Part 5: Example Workflows (3 power-user scenarios)
├── Part 6: Implementation Strategy (3 phases)
└── Related Documents & Invariants
```

---

## 3. Key Concepts

| Concept | Definition | Location |
|---------|-----------|----------|
| **TraceEvent** | Time-ordered record of runtime operations (bus evals, adapter/lens application, combines, field materialize, block exec, errors) | Lines 45–121 |
| **Trace Scope** | Config limiting what to record (targets, duration, max events, detail level) to ensure memory safety | Lines 123–143 |
| **TraceRecorder** | Interface managing ring buffer of bounded trace events with dependency closure | Lines 160–170 |
| **Technical Debug Panel** | Five-tab UI for graph, buses, bindings, trace events, and performance metrics | Lines 174–248 |
| **Determinism Contracts** | Explicit documentation of combine order, topo order, and time model source in DebugGraph | Lines 276–293 |
| **Patch Diff Analysis** | Post-MVP feature: diff DebugGraph before/after edits to show topology changes | Lines 251–273 |
| **DebugGraph** | Snapshot of system topology (buses, publishers, listeners) with determinism metadata | Throughout |

---

## 4. Dependencies & References

### Internal References (Same Document)

| Type | Reference | Lines |
|------|-----------|-------|
| **Related Topic** | [08-observation-system](./08-observation-system.md) | 12, 361 |
| **Related Topic** | [09-debug-ui-spec](./09-debug-ui-spec.md) | 12, 362 |
| **Glossary Term** | [DebugGraph](../GLOSSARY.md#debuggraph) | 14 |
| **Glossary Term** | [DebugSnapshot](../GLOSSARY.md#debugsnapshot) | 14 |

### External Dependencies

- **Invariant I20**: Traceability by Stable IDs (line 368)
- **Invariant I21**: Deterministic Replay (line 369)

---

## 5. Semantic Sections & Anchors

| Section | Line Range | Purpose |
|---------|-----------|---------|
| **Overview** | 20–32 | Establishes need for deterministic observation and bounded data structures |
| **TraceEvent Types** | 43–121 | Specifies 10 event types covering full evaluation pipeline |
| **Trace Scope & Config** | 123–152 | Defines scoping algorithm and memory safety guardrails |
| **TraceRecorder Interface** | 160–170 | Ring buffer implementation contract |
| **Technical Debug Panel Layout** | 174–248 | Five-tab UI specification with mock data |
| **Determinism Contracts** | 276–293 | Exposed metadata: combine order, topo order, time source |
| **Example Workflows** | 301–331 | Three power-user scenarios (verify determinism, trace NaN, optimize materialization) |
| **Implementation Strategy** | 335–355 | Three-phase rollout: MVP foundation, post-MVP tools, future advanced analysis |
| **Related Documents** | 359–362 | Links to observation system and debug UI spec |
| **Invariants** | 366–369 | References I20 (stable IDs) and I21 (deterministic replay) |

---

## 6. Critical Terms & Definitions

| Term | Definition | Usage Context |
|------|-----------|----------------|
| **Deterministic Evaluation Trace** | Exact, time-ordered log of all operations that can be replayed given same inputs | Power-user requirement (line 25) |
| **Before/After Values** | Captured state at each step in evaluation pipeline for diff analysis | Power-user requirement (line 26) |
| **Dependency Analysis** | Tracing value origin through publisher → adapter → lens → combine pipeline | Power-user requirement (line 27) |
| **Ring Buffer** | Bounded, circular log dropping oldest events when full (example: 50k events ~28s @ 60fps) | Memory safety mechanism (lines 155–158) |
| **Scoping Algorithm** | Logic determining which events are relevant to a trace target set | Lines 145–152 |
| **Combine Order** | Deterministic ordering of publisher contributions in bus combine step | Determinism contract (line 285) |
| **Topo Order** | Stable topological order for block execution (ties broken by block.id) | Determinism contract (line 286) |

---

## 7. Implementation Requirements & Constraints

### MVP Foundation (Depends On)

| Requirement | Status | Ref |
|-------------|--------|-----|
| Observation system (topic 08) | Required | Line 339 |
| Rules engine (topic 08b) | Required | Line 340 |
| Non-technical UI (topic 09) | Required | Line 341 |

### Post-MVP Features (Phase 2)

| Feature | Description | Lines |
|---------|-------------|-------|
| Trace Events & Ring Buffer | Implement TraceRecorder with scoping algorithm | 335–337 |
| Technical Debug Panel Tabs 1–3 | Graph, Buses, Bindings views | 337 |
| Determinism Contracts Exposed | Display combine/topo/time source info | 337 |
| Trace & Performance Tabs | Event viewer + performance counters | 338 |

### Future (Phase 3)

| Feature | Description | Lines |
|---------|-------------|-------|
| Patch Diff Analysis | Before/after topology diffing | 351 |
| Dependency Tracing | Backward/forward dependency navigation | 352 |
| Replay with Breakpoints | Replay evaluation with breakpoint support (if time) | 352 |

### Memory & Performance Constraints

- **Max events per trace**: 50,000 (ring buffer)
- **History window**: ~28 seconds @ 60fps / ~30 events per frame
- **Bounded data structures**: All observation is read-only, no memory growth
- **Scoping**: Users select targets to avoid tracing entire graph

### Determinism Invariants

- **I20 (Traceability by Stable IDs)**: Trace events reference compile-time stable IDs
- **I21 (Deterministic Replay)**: Given trace and same inputs, behavior reconstructible

---

**Index Version**: 1
**Last Updated**: 2026-01-12
