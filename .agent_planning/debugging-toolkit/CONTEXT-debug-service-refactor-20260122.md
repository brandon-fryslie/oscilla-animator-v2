# Debug Service Refactor - Context Document

**Date**: 2026-01-22
**Status**: Completed
**Related Task**: oscilla-animator-v2-vr6 (Port Visualization)

## What Was Done

### Problem Statement
The debug data flow was fragile with silent failures that made it hard to diagnose issues. When debug values weren't showing in the UI, it was unclear whether the problem was in:
1. Compiler not producing debugIndex
2. mapDebugEdges not creating proper mappings
3. Runtime not calling the tap
4. DebugService not storing values
5. UI not querying correctly

### Solution: Loud Failures + Strict Validation

#### 1. mapDebugEdges Now Throws on Incomplete Data
Previously returned empty map silently. Now throws specific errors:
- `debugIndex is null/undefined`
- `debugIndex.ports is missing`
- `debugIndex.blockMap is missing`
- `debugIndex.slotToPort is missing`

#### 2. DebugService Validates at Query Time
- **Unmapped edge**: Throws - if UI queries an edge that's not in the mapping, that's a compiler bug
- **Missing slot value after runtime started**: Throws - all slots should be written every frame
- **Missing slot value before runtime started**: Returns undefined - expected, runtime hasn't run yet

Added `runtimeStarted` boolean flag that gets set on first `updateSlotValue()` or `updateFieldValue()` call.

#### 3. Field Debug Support Added
Fields were being skipped because:
- They write to `state.values.objects` (Map of buffers), not `state.values.f64` (typed array)
- The debug tap only had `recordSlotValue(slot, number)`

Fixed by:
- Adding `recordFieldValue(slot, buffer)` to DebugTap interface
- Adding `updateFieldValue()` to DebugService (stores first element as representative)
- Calling tap from ScheduleExecutor's `materialize` step

#### 4. Port-Based Queries for Unconnected Outputs
Previously could only query debug values via edge ID. But unconnected output ports have no edge.

Fixed by:
- `mapDebugMappings()` returns both `edgeMap` and `portMap`
- `portMap` keys are `blockId:portName`
- Added `getPortValue(blockId, portName)` to DebugService
- PortInfoPopover now queries by port for unconnected outputs

## Architecture

### Data Flow
```
Compiler
  └─> debugIndex (ports, blockMap, slotToPort)
        └─> mapDebugMappings(patch, program)
              └─> edgeMap: Map<edgeId, {slotId, type}>
              └─> portMap: Map<blockId:portName, {slotId, type}>
                    └─> debugService.setEdgeToSlotMap(edgeMap)
                    └─> debugService.setPortToSlotMap(portMap)

Runtime (each frame)
  └─> evalSig step
        └─> state.tap.recordSlotValue(slot, value)
              └─> debugService.updateSlotValue(slot, value)
  └─> materialize step
        └─> state.tap.recordFieldValue(slot, buffer)
              └─> debugService.updateFieldValue(slot, buffer)

UI Query
  └─> debugService.getEdgeValue(edgeId) -> {value, slotId, type}
  └─> debugService.getPortValue(blockId, portName) -> {value, slotId, type}
```

### Key Files Modified
- `src/services/mapDebugEdges.ts` - Added throws, mapDebugMappings(), portMap
- `src/services/DebugService.ts` - Added runtimeStarted, throws, field support, port queries
- `src/runtime/DebugTap.ts` - Added recordFieldValue interface
- `src/runtime/ScheduleExecutor.ts` - Added tap call in materialize step
- `src/main.ts` - Wired up both tap methods, use mapDebugMappings
- `src/ui/reactFlowEditor/PortInfoPopover.tsx` - Added blockId prop, port-based query
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Pass blockId to popover

### Key Design Decisions

1. **First element for field display**: Fields produce buffers with N values (one per instance element). For debug display, we show the first element. Could extend later to show stats (min/max/mean) or sparklines.

2. **Throw vs return undefined**:
   - Throw for things that indicate bugs (missing mapping, missing value after runtime started)
   - Return undefined for expected cases (runtime not started yet, input port not in map)

3. **runtimeStarted flag**: Simple boolean, set on first value write. Lets us distinguish "runtime hasn't run yet" from "runtime ran but didn't write this slot".

4. **Port map separate from edge map**: Could have merged them, but keeping separate makes the semantics clearer and allows different lookup patterns.

## Testing

Tests in `src/services/DebugService.test.ts`:
- Edge-to-slot mapping and retrieval
- Throws for unmapped edge
- Returns undefined before runtime starts
- Throws for missing value after runtime starts
- Multiple edges to same slot
- Clear resets runtimeStarted
- Port-based queries
- Field value storage (first element)

Tests in `src/services/mapDebugEdges.test.ts`:
- Correct edge mapping
- Multiple edges from same block
- Empty patch
- Unknown source port (skipped, not thrown)
- Throws for all incomplete debugIndex cases

## Future Work

1. **Better field visualization**: Instead of just first element, could show:
   - Min/max/mean
   - Sparkline of all values
   - Histogram

2. **Debug levels**: Currently records every slot every frame. Could add filtering by DebugLevel to reduce overhead.

3. **History/timeseries**: Currently only stores latest value. Sprint 3 feature per spec.

4. **DebugGraph**: More sophisticated debug structure per spec. Sprint 2 feature.

## Gotchas

1. **Const blocks**: They use `sigConst` which doesn't allocate a slot in the schedule - the value is inlined. So Const outputs won't show debug values (they're compile-time constants anyway).

2. **Field slots use objects storage**: They're stored in `state.values.objects` Map, not `state.values.f64` array. The slotId is still valid, just used as a Map key instead of array index.

3. **Edge IDs**: Generated as `e0`, `e1`, etc. by PatchStore. Must match exactly between patch and UI.

4. **Port names**: Must match between block definition outputs and debugIndex ports array. Case-sensitive.
