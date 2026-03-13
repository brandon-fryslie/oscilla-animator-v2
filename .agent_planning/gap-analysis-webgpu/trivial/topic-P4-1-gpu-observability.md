# P4-1: GPU Observability / Async Readback System - TRIVIAL Items

## Item 1: Sparkline Component
**Spec says**: Create a `<Sparkline />` component that consumes the raw data stream.
**Implementation**: `src/ui/debug-viz/charts/Sparkline.tsx` exists and renders sparkline charts from debug history data. It consumes history views from `HistoryService`.
**Gap**: None - sparkline exists and consumes debug data. Naming and behavior match spec intent.
**Classification**: TRIVIAL (cosmetic: consumes pull-based history rather than push-based Subject)

## Item 2: Buffer Usage Flags
**Spec says**: Readback buffers use `COPY_DST | MAP_READ`.
**Implementation**: `WebGPUIndirectArgsInspector.ts:121` creates readback buffers with `COPY_DST | MAP_READ`. The Rust-side `GpuMemoryArena` also creates a staging buffer with equivalent flags.
**Gap**: Correct flags are used.
**Classification**: TRIVIAL
