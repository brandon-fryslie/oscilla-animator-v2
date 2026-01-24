---
parent: ../INDEX.md
topic: power-user-debugging
order: 10
status: post-MVP
---

# Power-User Debugging (Post-MVP)

> Advanced observation and analysis tools for technical users who need to understand exactly what the system is doing.

**Related Topics**: [08-observation-system](./08-observation-system.md), [09-debug-ui-spec](./09-debug-ui-spec.md)

**Key Terms**: [DebugGraph](../GLOSSARY.md#debuggraph), [DebugSnapshot](../GLOSSARY.md#debugsnapshot)

**Status**: ⚠️ **POST-MVP** - Valuable but not blocking. Implement after core observation system is stable.

---

## Overview

Where the non-technical debug UI (topic 09) makes the system feel transparent, power-user debugging makes it feel *truthful*.

Power users need:
1. **Deterministic evaluation trace** - Exact order of operations
2. **Before/after values** - What changed at each step
3. **Dependency analysis** - Where does this value actually come from
4. **Patch diff analysis** - What changed after editing
5. **Performance attribution** - Which specific operations are slow

All tools are read-only inspection. No modification. Data is bounded (ring buffers, time windows).

---

## Part 1: Trace Events (Deterministic Log)

### What They Are

Time-ordered log of actual runtime operations. Records every bus evaluation, adapter/lens application, combine step, field materialization, block execution.

This is the "truth source" for "why did that happen?"

### TraceEvent Types

```typescript
type TraceEvent =
  | {
      tMs: number;
      kind: 'BusEvalStart';
      busId: string;
      publisherCount: number;
    }
  | {
      tMs: number;
      kind: 'PublisherEval';
      publisherId: string;
      value: ValueSummary;
    }
  | {
      tMs: number;
      kind: 'AdapterApplied';
      bindingId: string;
      adapterId: string;
      before: ValueSummary;
      after: ValueSummary;
    }
  | {
      tMs: number;
      kind: 'LensApplied';
      bindingId: string;
      lensId: string;
      before: ValueSummary;
      after: ValueSummary;
    }
  | {
      tMs: number;
      kind: 'CombineStep';
      busId: string;
      mode: CombineMode;
      accumulator: ValueSummary;
      nextValue: ValueSummary;
      result: ValueSummary;
    }
  | {
      tMs: number;
      kind: 'BusEvalEnd';
      busId: string;
      value: ValueSummary;
    }
  | {
      tMs: number;
      kind: 'ListenerDeliver';
      listenerId: string;
      value: ValueSummary;
      portKey: string;
    }
  | {
      tMs: number;
      kind: 'FieldMaterialize';
      blockId: string;
      outputPort?: string;
      elementCount: number;
      reason: string;
    }
  | {
      tMs: number;
      kind: 'BlockEval';
      blockId: string;
      outputs: Array<{
        portId: string;
        value: ValueSummary;
      }>;
    }
  | {
      tMs: number;
      kind: 'Error';
      code: string;
      message: string;
      where?: TargetRef;
    };
```

### Trace Scope (Critical for Memory Safety)

Users don't trace *everything*—they choose targets (bus, binding, port, block) and a time window.

```typescript
interface TraceConfig {
  enabled: boolean;

  // What to record
  targets: ProbeTarget[];       // bus / binding / port / block

  // How long
  durationMs: number;           // e.g., 2000ms
  maxEvents: number;            // e.g., 50000 (ring buffer)

  // Detail level
  includeCombineSteps: boolean; // verbose, default off
  includeBeforeAfter: boolean;  // heavy, default off
  includeFieldMaterialize: boolean;
}
```

**Scoping algorithm** (when is an event relevant?):

- Bus event: targeted OR any targeted listener depends on it OR any targeted port reads it
- Binding event: targeted OR in dependency chain of targeted port
- Field materialization: targeted block OR downstream of targeted bus
- Block event: targeted

This requires computing dependency closure once when starting trace.

### Trace Ring Buffer

Bounded ring buffer per target set. When full, oldest events drop.

Example: 50,000 events max. At 60fps with ~30 events/frame, ~28 seconds of history.

```typescript
interface TraceRecorder {
  config: TraceConfig;
  buffer: RingBuffer<TraceEvent>;
  dependencyClosure: Set<BlockId>;  // computed once

  record(event: TraceEvent): void;
  getEvents(fromTMs: number, toTMs: number): TraceEvent[];
  clear(): void;
}
```

---

## Part 2: Technical Debug Panel (UI Layout)

Dedicated panel (can be drawer or full-screen). Five tabs:

### Tab 1: Graph

Visual representation of DebugGraph:
- Buses as boxes
- Publishers/listeners as edges
- Hover to highlight dependencies
- Click to probe

Simple enough to render without complex visualization library.

### Tab 2: Buses

Table view of all buses:
```
Name       Type          Value    Producers    Consumers
───────────────────────────────────────────────────────
phaseA     Signal:Phase  0.25     [TimeRoot]   [Repeat, Lag]
energy     Signal:Float  0.8      [Slider]     [Scale, Clamp]
```

Sortable. Click row to show detail panel (publishers, listeners, history sparkline).

### Tab 3: Bindings

Table of all publishers and listeners:
```
ID          Kind        From              To                Type
─────────────────────────────────────────────────────────────
pub-phaseA  Publisher   TimeRoot.phaseA   phaseA bus        Phase
lis-repeat  Listener    phaseA bus        Repeat.phase      Phase
```

Click to show adapter/lens chain and trace data.

### Tab 4: Trace

Real-time event log (when Trace is enabled):
```
Time    Event                   Before          After
────────────────────────────────────────────────────────
0.100   BusEvalStart(phaseA)
0.101   PublisherEval(time)                     {t:'num', v:1500}
0.102   AdapterApplied(tMs→phase)               {t:'float', v:0.25, unit:'phase01'}
0.103   BusEvalEnd(phaseA)                      {t:'float', v:0.25, unit:'phase01'}
0.104   ListenerDeliver(Repeat)                 {t:'float', v:0.25, unit:'phase01'}
```

Scrollable. Click event to highlight related operations. Can filter by event kind.

### Tab 5: Performance

Perf counters + attribution:

```
Frame: 16.7ms (60fps)
Worst frame: 22.3ms

Top materializers:
  RenderInstances2D: 8000 elements
  Repeat: 200 elements

Top lenses:
  Lag (lag): 450 invocations
  Clamp (clamp): 450 invocations

Top adapters:
  phase→num: 50 invocations
```

Show current frame + moving average (last 100 frames).

---

## Part 3: Patch Diff Analysis (Post-MVP)

**Status**: Very useful but not essential for MVP.

After user edits and recompiles:

1. Capture DebugGraph before and after
2. Diff the topology:
   - Buses added/removed
   - Publishers/listeners added/removed
   - Pipeline changes
3. Show in technical debug panel:
   ```
   Changes:
   ─────────
   + Added bus 'speed' (numeric)
   + Added publisher Slider → speed
   - Removed listener scale → interval
   * Modified: phaseA.combineMode (last → sum)
   ```

4. Can trace impact on runtime behavior (which buses are affected)

---

## Part 4: Determinism Contracts (Exposed)

DebugGraph should explicitly surface determinism contracts so users can understand why behavior is stable:

```typescript
interface DebugGraph {
  // ... existing fields ...

  determinism: {
    busCombineOrder: string;    // e.g., "publisher.sortKey asc, tie by publisher.id"
    topoOrder: string;          // "stable topological order, tie by block.id"
    timeModelSource: {
      blockId: string;
      kind: string;             // e.g., "TimeRoot"
    };
  };
}
```

The technical debug panel can explain:
- "Bus 'energy' combines in this order: [List] because combine mode is Sum and publication order is [List]"
- "Block execution order is: [List] (stable topological order, ties broken by block ID)"

---

## Part 5: Example Workflows

### Power User 1: "Verify Determinism"

1. Open technical debug panel
2. Check "Determinism" section in Graph tab
3. See combine order, topo order, time source
4. Verify: "All buses combine in stable order ✓"
5. Can generate trace to confirm execution matches

### Power User 2: "Trace NaN Propagation"

1. See NaN diagnostic in rules engine
2. Open Trace tab
3. Enable trace for affected bus, 2-second window
4. See exact sequence:
   - PublisherEval(lens) before value
   - AdapterApplied shows NaN introduced here
   - CombineStep shows NaN propagated
5. Pinpoint: "WaveFolder lens produces NaN at t=1.23s"
6. Disable and retest

### Power User 3: "Optimize Materialization"

1. Open Performance tab
2. See RenderInstances2D materializes 8000 elements
3. Enable trace for that block, 1 second
4. Trace shows FieldMaterialize event + reason
5. See: "domain size is 8000" from upstream computation
6. Can trace back: where does this domain come from
7. Consider: smaller domain, or lazy evaluation strategy

---

## Part 6: Implementation Strategy

### Phase 1 (MVP): Foundation

- Observation system (topic 08) ✓
- Rules engine (topic 08b) ✓
- Non-technical UI (topic 09) ✓

### Phase 2 (Post-MVP): Power-User Tools

1. Trace events + ring buffer
2. Technical debug panel with Tabs 1-3
3. Determinism contracts exposed
4. Tab 4 (Trace) with event viewer
5. Tab 5 (Performance) with counters

### Phase 3 (Future): Advanced Analysis

1. Patch diff analysis
2. Dependency tracing (backward/forward)
3. Replay with breakpoints (if time)

---

## Related Documents

- [08-observation-system.md](./08-observation-system.md) - Runtime snapshot and query infrastructure
- [09-debug-ui-spec.md](./09-debug-ui-spec.md) - Non-technical UI for casual debugging

---

## Invariants

- **I20**: Traceability by Stable IDs - Trace events reference compile-time stable IDs
- **I21**: Deterministic Replay - Trace events allow reconstructing behavior given same inputs

---

**Status**: 📋 SPECIFIED (not implemented yet)

This is complete specification for post-MVP work. Implement after core observation system is proven stable.

