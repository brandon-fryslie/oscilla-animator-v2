---
topic: 10
name: power-user-debugging
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/10-power-user-debugging.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 8
note: "T3 post-MVP - entire topic is marked post-MVP in spec"
---

# Topic 10: Power-User Debugging - Gap Analysis

## Primary Category: UNIMPLEMENTED (8 items)

This entire topic is marked "POST-MVP" in the spec header (`status: post-MVP`). None of these features are implemented, which is expected.

### 1. TraceEvent types (deterministic evaluation log)
- **Spec**: BusEvalStart, PublisherEval, AdapterApply, LensApply, CombineStep, ListenerDeliver, FieldMaterialize, BlockExecute
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 2. TraceRecorder (bounded event ring buffer)
- **Spec**: Ring buffer with maxEvents cap, start/stop/clear API
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 3. TraceConfig (what to record)
- **Spec**: Per-bus, per-block, per-binding trace configuration
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 4. Dependency graph (what feeds what)
- **Spec**: Given a port, trace back through buses/publishers to find all sources
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 5. Before/After comparison (patch diff analysis)
- **Spec**: Compare two snapshots or two compile results side by side
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 6. Performance attribution (which operations are slow)
- **Spec**: Per-block, per-adapter, per-lens timing breakdown
- **Status**: UNIMPLEMENTED - T3 post-MVP. HealthMonitor has aggregate stats but no per-block attribution.

### 7. Expression evaluator (runtime expression evaluation)
- **Spec**: Evaluate arbitrary expressions in the context of current state
- **Status**: UNIMPLEMENTED - T3 post-MVP

### 8. Signal path highlighter (visual trace in graph)
- **Spec**: Highlight the path a value takes through the graph
- **Status**: UNIMPLEMENTED - T3 post-MVP

## Notes

All items in this topic are T3/post-MVP. Their absence is expected and not a priority concern. The topic explicitly states: "Valuable but not blocking. Implement after core observation system is stable."
