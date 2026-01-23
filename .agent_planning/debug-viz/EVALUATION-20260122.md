# Evaluation: Debug Visualization System (DebugMiniView)

Generated: 2026-01-22
Topic: debug-viz
Verdict: CONTINUE

## Current State (~40% Foundation Complete)

### What Exists (Working)
- **DebugService** (`src/services/DebugService.ts`): EdgeValueResult discriminated union (signal/field/field-untracked), demand-driven field tracking, signal values, metadata queries
- **DebugTap** (`src/runtime/DebugTap.ts`): Runtime injection interface (recordSlotValue, recordFieldValue, getTrackedFieldSlots)
- **DebugStore** (`src/stores/DebugStore.ts`): MobX reactive state, 1Hz polling, auto-track on hover
- **SimpleDebugPanel** (`src/ui/components/SimpleDebugPanel.tsx`): Basic signal/field stats display
- **useDebugProbe** (`src/ui/hooks/useDebugProbe.ts`): React hook with 1Hz polling
- **PortInfoPopover** (`src/ui/reactFlowEditor/PortInfoPopover.tsx`): Port hover with debug values
- **mapDebugEdges** (`src/services/mapDebugEdges.ts`): Edge-to-slot mapping with cardinality
- **Tests**: DebugService comprehensively tested (27 tests passing)

### What's Missing (All Specified in Design Docs)
- HistoryService (ring buffers, push-driven, keyed by DebugTargetKey)
- ValueRenderer registry (fallback ladder: exact→payload→category)
- SampleSource abstraction (ScalarSampleSource, FieldSampleSource)
- Chart primitives (Sparkline, DistributionBar, WarmupIndicator)
- ViewModes (SignalViewMode, FieldViewMode)
- DebugMiniView component (replaces inline UI)
- Core types (DebugTargetKey, HistoryView, SampleEncoding, AggregateStats)
- DebugService push hook to HistoryService
- onMappingChanged event

## Architect-Locked Decisions

1. History capacity: 128 samples, Float32Array
2. Stride typed as literal `0 | 1 | 2 | 3 | 4`
3. AggregateStats: component-wise Float32Array[4] (not scalar)
4. Color encoding: float RGBA [0,1] canonical
5. Unit naming: `float:phase` not `phase01`
6. Wrap detection: history-delta only (in Sparkline), never instantaneous
7. Registry lookup: exact(payload+unit) → payload-only → category
8. DebugMiniView: knows only DebugTargetKey, never slots
9. HistoryService: signal-only (stride=1), push-driven, MAX_TRACKED=32
10. TrackedEntry IS the HistoryView (object-stable, no allocation on read)
11. Key serialization: `"e:"+edgeId` or `"p:"+blockId+"\0"+portName`
12. RendererSample scalar: components Float32Array + stride (not value:number)
13. No onFieldWrite in HistoryService v1 (field viz is non-temporal)
14. StorageLine in MiniView: either uses targetKey internally or dropped in v1

## Implementation Order (Architect-Specified)

1. Types (`src/ui/debug-viz/types.ts`)
2. SampleSources (ScalarSampleSource, FieldSampleSource)
3. ValueRenderer registry + GenericValueRenderer
4. HistoryService
5. DebugService → HistoryService push hook + onMappingChanged
6. Sparkline (canvas, auto-scale, NaN/Inf handling, phase wrap markers)
7. FloatValueRenderer (unit-aware: normalized warns, phase no wrap, scalar no range)
8. ColorValueRenderer (aggregate: swatch + channel ranges)
9. DistributionBar
10. WarmupIndicator
11. SignalViewMode + FieldViewMode
12. DebugMiniView

## Risks

- **Stride divergence**: SampleSource and HistoryService must share `getSampleEncoding()`
- **Slot leakage**: MiniView must never know about ValueSlot
- **Field buffer copy perf**: `new Float32Array(buffer)` in updateFieldValue is a hot-path footgun
- **FieldValueResult mismatch**: Current uses scalar stats, needs component-wise AggregateStats eventually

## Test Gaps (for new components)
- HistoryService: ring buffer semantics, recompile clearing, stride validation, cap eviction
- SampleSource: stride compliance, stats computation, edge cases
- ValueRenderer: fallback ladder, unit formatting
- Sparkline: auto-scale, flat-line, NaN/Inf, phase wrap
- All UI components: no tests currently
