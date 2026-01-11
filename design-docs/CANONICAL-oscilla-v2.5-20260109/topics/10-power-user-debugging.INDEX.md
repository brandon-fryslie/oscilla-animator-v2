# Power-User Debugging - Indexed Summary

**Tier**: T3 (Post-MVP UI)
**Status**: Post-MVP - valuable but not blocking
**Size**: 376 lines → ~95 lines (25% compression)

## Overview [L20-31]
Advanced observation for technical users. Where non-technical UI (topic 09) makes system transparent, this makes it truthful.

Need: Deterministic trace, before/after values, dependency analysis, patch diff, performance attribution

Read-only inspection. Bounded (ring buffers, time windows).

## Part 1: Trace Events [L35-170]
**Deterministic log** of runtime operations (truth source)

Records: Bus evaluation, adapter/lens application, combine steps, field materialization, block execution

**TraceEvent Types** [L45-120]:
- BusEvalStart (publisherCount)
- PublisherEval (value)
- AdapterApplied (before/after)
- LensApplied (before/after)
- CombineStep (accumulator, nextValue, result)
- BusEvalEnd (value)
- ListenerDeliver (value, portKey)
- FieldMaterialize (elementCount, reason)
- BlockEval (outputs array)
- Error (code, message)

**Trace Scope** [L123-152]: Users choose targets + time window, not trace everything
- Targets: bus, binding, port, block
- Duration, maxEvents (ring buffer)
- Detail level: includeCombineSteps, includeBeforeAfter, includeFieldMaterialize

**Ring buffer** [L154-169]: Dependency closure computed once, events drop oldest when full

## Part 2: Technical Debug Panel [L174-247]
Five tabs:

### Tab 1: Graph [L178-186]
Visual DebugGraph: Buses as boxes, publishers/listeners as edges, hover highlights dependencies, click to probe

### Tab 2: Buses [L188-198]
Table: Name, Type, Value, Producers, Consumers
Sortable, click row for detail panel (publishers, listeners, history sparkline)

### Tab 3: Bindings [L200-210]
Table of publishers/listeners: ID, Kind, From, To, Type
Click to show adapter/lens chain + trace data

### Tab 4: Trace [L212-225]
Real-time event log (when enabled):
Time, Event, Before, After
Scrollable, click event to highlight related ops, filter by event kind

### Tab 5: Performance [L227-247]
Perf counters + attribution
Frame time, worst frame, top materializers, top lenses, top adapters
Current frame + moving avg (100 frames)

## Part 3: Patch Diff Analysis (Post-MVP) [L251-272]
**Status**: Very useful but not essential
After edit + recompile:
1. Capture DebugGraph before/after
2. Diff topology (buses added/removed, publishers/listeners, pipelines)
3. Show in panel (+ Added, - Removed, * Modified)
4. Trace impact on runtime

## Part 4: Determinism Contracts (Exposed) [L276-298]
**DebugGraph** should expose:
```typescript
determinism: {
  busCombineOrder: string;     // e.g., "publisher.sortKey asc, tie by id"
  topoOrder: string;           // "stable topo order, ties by block.id"
  timeModelSource: { blockId, kind };
};
```

UI can explain: "Bus 'energy' combines in order: [...] because combine=Sum + sort order=[...]"

## Part 5: Example Workflows [L301-331]
1. **Verify Determinism**: Check Determinism section, verify all buses combine in stable order
2. **Trace NaN**: Enable trace for affected bus (2s), see exact sequence where NaN introduced, pinpoint lens
3. **Optimize Materialization**: See RenderInstances2D materializes 8000, trace back to domain

## Part 6: Implementation Strategy [L335-356]
**Phase 1 (MVP)**: Foundation (topics 08, 08b, 09)
**Phase 2 (Post-MVP)**: Power-user tools
  1. Trace events + ring buffer
  2. Technical panel tabs 1-3
  3. Determinism contracts
  4. Tab 4 (Trace viewer)
  5. Tab 5 (Performance)
**Phase 3 (Future)**: Advanced analysis

## Related
- [08-observation-system](./08-observation-system.md) - Snapshot + query infrastructure
- [09-debug-ui-spec](./09-debug-ui-spec.md) - Non-technical UI
- [Invariants](../INVARIANTS.md) - I20 (traceability), I21 (determinism)

**Status**: 📋 SPECIFIED (not implemented yet) - Complete specification for post-MVP
