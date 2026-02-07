# Step-Through Schedule Debugger

A generator-based debugger that pauses between schedule steps, exposing full slot/expression inspection without modifying the production `executeFrame()` code path.

## Quick Start

1. Open the app and load any demo patch
2. In the **Step Debugger** panel (Dockview), click **Activate**
3. The animation loop pauses. Use **Step**, **Run to BP**, **Run to Phase End**, or **Finish Frame** to advance
4. Inspect slot values, expression trees, and anomalies in the right pane

## Architecture

```
StepDebugStore (MobX)
  └─ StepDebugSession (controller)
       └─ executeFrameStepped() (generator)
            ├─ yields StepSnapshot per step
            ├─ uses same helpers as ScheduleExecutor
            └─ never modifies production code path
```

### Key Files

| File | Role |
|------|------|
| `src/runtime/executeFrameStepped.ts` | Generator executor — mirrors `executeFrame()` but yields between steps |
| `src/runtime/StepDebugSession.ts` | Session controller — breakpoints, lifecycle, frame completion guarantee |
| `src/runtime/StepDebugTypes.ts` | Type definitions (`StepSnapshot`, `SlotValue`, `Breakpoint`, `ExprTreeNode`, etc.) |
| `src/runtime/ValueExprTreeWalker.ts` | Exhaustive child enumeration + DFS traversal for expression DAGs |
| `src/runtime/ValueInspector.ts` | Read-only slot inspection, anomaly detection, cross-frame deltas, lane identity |
| `src/runtime/WhyNotEvaluated.ts` | Analysis of why a block/port has no value in the debugger |
| `src/runtime/SlotLookupCache.ts` | Shared slot lookup utilities (used by both production and debug paths) |
| `src/stores/StepDebugStore.ts` | MobX store — reactive observables for UI binding |
| `src/ui/components/StepDebugPanel.tsx` | Dockview panel — step list, inspector, breakpoints, expression tree, frame summary |

### Execution Model

Each frame executes in two phases (mirroring the production executor):

- **Phase 1**: Evaluates all signals/fields, reads from previous frame's state
- **Phase Boundary**: Assembles render frame from collected render steps
- **Phase 2**: Writes new state values for the next frame (stateWrite, fieldStateWrite)

The generator yields a `StepSnapshot` after each step, capturing written slots, anomalies, and provenance.

## Features

### Core Debugger (Base Implementation)

- **Step-through execution**: Pause at each schedule step, inspect runtime state
- **Phase markers**: Pre-frame, Phase 1, Phase Boundary, Phase 2, Post-frame snapshots
- **Slot value inspection**: Scalars, buffers (expandable), events, objects
- **Anomaly detection**: NaN, +Infinity, -Infinity flagged per step with block/port provenance

### F1: exprToBlock Mapping

`DebugIndexIR.exprToBlock` maps each `ValueExprId` to its source `BlockId`. Populated during block lowering via `IRBuilder.setCurrentBlock()` / `clearCurrentBlock()`. Enables expression tree nodes to show which block emitted them.

### F2: Dockview Panel UI

Full React panel with:
- Toggle activate/deactivate
- Step list (left pane) with auto-scroll, phase badges, and click-to-inspect
- Slot inspector (right pane) with typed value display
- Collapsible sections for breakpoints, expression tree, and why-not-evaluated

### F3: Conditional Breakpoints

Extended `Breakpoint` union with:
- `slot-condition`: Break when a slot value satisfies a predicate
- `value-delta`: Break when a slot value changes by more than a threshold between steps

### F4: Temporal Comparison (Cross-Frame Diff)

`StepSnapshot.previousFrameValues` carries the previous frame's scalar slot values. `StepDebugSession` captures end-of-frame values and passes them to the next frame's generator. The store exposes `currentDeltas` as a computed property.

### F5: Lane Identity via Continuity

`buildLaneIdentityMap()` in `ValueInspector.ts` maps field slots to per-lane identity information (instance label, lane index, element ID from continuity state). Accessible via `StepDebugStore.getLaneIdentities()`.

### F6: "Why Not Evaluated" Analysis

`analyzeWhyNotEvaluated()` examines compiler pass outputs to determine why a block/port has no value: compile error, not scheduled, pruned, disconnected, or event not fired.

### E1: Cumulative Slot State

Phase 2 steps (`stateWrite`, `fieldStateWrite`) now capture their written values. The store provides `cumulativeValueSlots` and `cumulativeStateSlots` computed properties that accumulate all written slots across history — showing "full state at this point" instead of just per-step writes.

### E2: User-Friendly Block Names

`DebugIndexIR.blockDisplayNames` maps numeric `BlockId` to user-facing display names (e.g., "Golden Spiral" instead of a UUID). Populated during compilation from `Block.displayName`. The step list, breakpoint selector, and why-not-evaluated panel all show friendly names.

### E3: Expression Tree Visualization

Interactive collapsible tree view showing the full DAG of how each value was computed. For each expression node: kind label, source block name, current scalar value, and anomaly highlighting. Built from `ValueExprTreeWalker` + `exprToBlock` mapping. Root expression determined from the current step's `step.expr` or `step.field`.

### E3.1: Expression Provenance

`DebugIndexIR.exprProvenance` maps each `ValueExprId` to an `ExprProvenanceIR` record containing the emitting block, output port name, and — for derived blocks — the user-visible target it serves. Built during debug index construction from `Block.role.meta` (already available during compilation).

Expression tree nodes now show user-facing context instead of raw IR labels:
- **Default sources**: `Array 1 . Count` with amber "default" badge (instead of `const(4)`)
- **User blocks**: `Oscillator 1 . Output` (instead of bare block name)
- **Adapters**: `ScalarToPhase` with purple "adapter" badge
- **Wire state**: `Lag 1` with blue "state" badge
- **Infrastructure**: `time:phaseA` (no block context, unchanged)

Provenance covers all 5 `DerivedBlockMeta` kinds: `defaultSource`, `adapter`, `wireState`, `lens`, `compositeExpansion`.

### E4: Breakpoint UX Improvements

- `stepToBlock` populated in compiler (was previously empty)
- Block-id breakpoint matching resolves through `blockMap` for correct string/numeric comparison
- Anomaly context panel: when paused at an anomaly, shows which slot, what kind, which block/port
- Quick breakpoint toggle from step list items
- Named slot picker for value-delta breakpoints
- "Step Index" hidden behind Advanced toggle

### E5: Ergonomic Improvements

- **Status icons**: Colored badges in step list (anomaly, materialization, state write, continuity, healthy, empty)
- **Frame summary**: When a frame completes, shows per-block summary with step counts, value ranges, and anomaly counts
- **Block-centric view**: Toggle between schedule-order and block-grouped step list (users think in blocks, not steps)

## Breakpoint Types

| Kind | Trigger | UI |
|------|---------|-----|
| `step-index` | Specific schedule step number | Advanced (hidden by default) |
| `block-id` | Any step from a specific block | Block dropdown with display names |
| `phase-boundary` | Phase transition | "Phase Change" button |
| `anomaly` | Any NaN/Infinity value | Toggle button |
| `slot-condition` | Slot value satisfies predicate | Programmatic (store API) |
| `value-delta` | Slot value changes by > threshold | Slot picker + threshold input |

## Invariants

1. **Frame completion guarantee**: Once `startFrame()` is called, the frame MUST complete (via `finishFrame()` or `dispose()`) before the next frame starts. Abandoning mid-frame leaves `RuntimeState` with incomplete Phase 2 writes.
2. **Production code untouched**: The debug executor uses the same imported helpers as `ScheduleExecutor` but never modifies it.
3. **Separate buffer pool**: `STEPPED_MATERIALIZER_POOL` avoids interference with the production `BufferPool`.
4. **Debug index is read-only**: All provenance data flows from `CompiledProgramIR.debugIndex`. The debugger never writes back to compiler artifacts.
