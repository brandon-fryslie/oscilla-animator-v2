# Debug Probe Feature

## Current Status: Signal-Only MVP Complete

The debug probe allows hovering over edges in the ReactFlow graph editor to see runtime values flowing through them.

### What Works

- **Signal edges only**: Edges carrying scalar Signal values (float, phase, etc.) show their current value
- **SimpleDebugPanel**: Fixed bottom-right panel displays value, type, and slot ID
- **Toggle**: "Debug: ON/OFF" button in top-right of graph editor

### What Doesn't Work Yet

- **Field edges**: Edges carrying Field values (arrays/buffers) don't show values
  - Fields use `materialize` steps, not `evalSig` steps
  - Displaying field values requires visualization (histogram, min/max, spatial view) - not just a number
  - **Deferred** until after the field refactor is complete

### Architecture

```
Compiler (pass7-schedule.ts)
    ↓ generates evalSig steps for signals with registered slots
Runtime (ScheduleExecutor.ts)
    ↓ executes evalSig, calls tap.recordSlotValue()
DebugService
    ↓ stores slot values in Map
mapDebugEdges (on recompile)
    ↓ builds edge ID → slot mapping from debugIndex
useDebugProbe hook (1Hz polling)
    ↓ queries DebugService.getEdgeValue()
SimpleDebugPanel
    → displays value with type-appropriate formatting
```

### Key Files

- `src/compiler/passes-v2/pass7-schedule.ts` - Generates evalSig steps
- `src/runtime/ScheduleExecutor.ts` - Executes evalSig, calls tap
- `src/services/DebugService.ts` - Stores and queries slot values
- `src/services/mapDebugEdges.ts` - Maps edge IDs to slots
- `src/ui/hooks/useDebugProbe.ts` - React hook for querying values
- `src/ui/components/SimpleDebugPanel.tsx` - Display component

### Future Work

When field visualization is needed:
1. Add tap point in `materialize` step (or separate field tap)
2. Compute summary stats (min, max, avg, distribution)
3. Build appropriate visualization (not just a number)

---

**Last Updated**: 2026-01-21
**Status**: Signal-only MVP working
