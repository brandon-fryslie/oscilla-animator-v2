---
topic: 8
name: observation-system
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08-observation-system.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 16
---

# Topic 08: Observation System - Gap Analysis

## Primary Category: UNIMPLEMENTED (16 items)

The spec describes a comprehensive observation system with DebugGraph, DebugSnapshot, DebugTap, and DebugService. The implementation takes a DIFFERENT approach: instead of bus-centric observation, it uses edge/slot-based debug value tracking. Many spec concepts are unimplemented.

### 1. DebugGraph (compile-time topology metadata)
- **Spec**: Full topology structure with DebugBusNode, DebugPublisherNode, DebugListenerNode, byPort reverse-lookups, pipelines
- **Status**: UNIMPLEMENTED - No DebugGraph type or construction anywhere in the codebase

### 2. DebugBusNode / DebugPublisherNode / DebugListenerNode
- **Spec**: Detailed per-bus/publisher/listener metadata (type, combineMode, adapterChain, lensStack, etc.)
- **Status**: UNIMPLEMENTED - System has no bus-awareness in its debug layer

### 3. DebugPipeline (pre-resolved transformation chains)
- **Spec**: Per-binding pipeline with stages (source, adapter, lens, combine)
- **Status**: UNIMPLEMENTED

### 4. DebugSnapshot (periodic runtime samples)
- **Spec**: busNow[], bindingNow[], health, perf counters at 10-15 Hz
- **Status**: UNIMPLEMENTED - RuntimeHealthSnapshot serves a similar role but lacks bus/binding values

### 5. ValueSummary type
- **Spec**: Tagged union (num, vec2, color, float, bool, trigger, none, err) for bounded value representation
- **Status**: UNIMPLEMENTED - The system uses raw numbers, not ValueSummary

### 6. DebugLevel enum (OFF/BASIC/TRACE/PERF/FULL)
- **Spec**: Controls what is captured and sampled
- **Status**: UNIMPLEMENTED - No debug level concept. DebugTap has no level field.

### 7. DebugTap.onDebugGraph()
- **Spec**: Called after DebugGraph is built at compile time
- **Status**: UNIMPLEMENTED - DebugTap only has recordSlotValue, recordFieldValue, getTrackedFieldSlots

### 8. DebugTap.onSnapshot()
- **Spec**: Called at sample rate with DebugSnapshot
- **Status**: UNIMPLEMENTED

### 9. DebugTap.hitMaterialize() / hitAdapter() / hitLens()
- **Spec**: Constant-time runtime counter increments
- **Status**: UNIMPLEMENTED - No counter increment hooks

### 10. DebugTap.recordBusNow() / recordBindingNow()
- **Spec**: Per-bus and per-binding value recording
- **Status**: UNIMPLEMENTED - System records per-slot values instead

### 11. Ring buffers (per-bus timeseries)
- **Spec**: Fixed-capacity ring buffers per bus (typed arrays, no GC pressure)
- **Status**: UNIMPLEMENTED - No ring buffer implementation for observation (frame times use fixed arrays in HealthMonitor)

### 12. DebugService.probePort() / probeBus() / probeBinding()
- **Spec**: Query API for UI with PortProbeResult, BusProbeResult, BindingProbeResult
- **Status**: UNIMPLEMENTED - DebugService has getEdgeValue/getPortValue but not bus/binding probing

### 13. DebugService.getBusSeries()
- **Spec**: Timeseries query with windowed statistics
- **Status**: UNIMPLEMENTED

### 14. DebugService.setLevel() / getLevel()
- **Spec**: Debug level configuration
- **Status**: UNIMPLEMENTED

### 15. DebugService.setSnapshotFrequency()
- **Spec**: Configurable snapshot rate
- **Status**: UNIMPLEMENTED

### 16. TopK counters (bounded performance tracking)
- **Spec**: Space-saving algorithm for topMaterializers, topAdapters, topLenses
- **Status**: UNIMPLEMENTED

## Also

### TO-REVIEW (3 items)
1. **DebugTap.recordSlotValue()** - Implemented but spec says `recordBusNow`/`recordBindingNow` instead. The edge/slot approach may be better suited to a non-bus architecture.
2. **DebugService singleton** - Implemented as singleton with edge-to-slot mapping and field tracking. Different from spec but functional for current wire-based architecture.
3. **HistoryService** - Implemented with per-key micro-history tracking. Not in spec but provides similar value to spec's ring buffers, just for edges rather than buses.

### DONE (2 items)
1. DebugTap interface exists with optional methods and no-throw contract
2. Demand-driven field tracking (trackField/untrackField) for performance
