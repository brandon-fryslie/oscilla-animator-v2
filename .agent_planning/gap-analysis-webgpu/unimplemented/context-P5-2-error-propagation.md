# Context: P5-2 - Error Propagation / Developer Experience

## Target State
The spec requires an "immune system" for error handling:
1. Source-mapped compiler errors pinpointed to specific UI blocks
2. Naga error humanization (regex dictionary for user-friendly messages)
3. Root cause analysis via topological error filtering
4. GPU Safe Mode with recovery pipeline on device.lost
5. Block-level red border + tooltip error visualization
6. Mini-map error dots with click-to-teleport
7. Previous valid pipeline survives compilation failures

## Current State
1. Source mapping exists at two layers: TS exprToBlock (`IRBuilderImpl.ts:73`) and Naga source map (`ScheduleNagaLowering.ts:174`). Naga errors are parsed and mapped back to blockIds in `naga-compile.ts:142-162`.
2. No error humanization dictionary -- raw Naga messages are passed through.
3. No topological error filtering or root cause analysis.
4. GPU faults (device.lost, validation, OOM) are detected and surfaced via `GpuFaultEvent`. Renderer enters fatal state but no recovery pipeline or safe mode exists.
5. Some error indication in graph editor but not the spec's specific red border + tooltip pattern.
6. Mini-map exists but no error overlay.
7. Stale state rule is fully implemented -- previous pipeline survives.

## Files Involved
- `src/compiler/naga-compile.ts` (Naga error parsing, source map lookup)
- `src/compiler/ir/IRBuilderImpl.ts` (exprToBlock mapping)
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` (Naga source map entries)
- `src/compiler/ir/naga-emitter/NagaBuilder.ts` (expression/statement source maps)
- `src/render/webgpu/RustWasmWebGPURenderer.ts` (device.lost handling, fatal error)
- `src/render/wasm/rust/oscilla-rust-renderer/src/error_boundary.rs` (Rust panic hook)
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (on_uncaptured_error)
- `src/events/types.ts` (GpuFaultEvent)
- `src/diagnostics/DiagnosticHub.ts` (diagnostic aggregation)
- `src/ui/graphEditor/GraphEditorCore.tsx` (error display)
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` (mini-map)

## Suggested Approach
1. **Humanizer**: Create a `naga-error-humanizer.ts` with regex patterns -> user messages. Medium effort.
2. **GPU Safe Mode**: On fatal error, clear canvas to dark red, show modal overlay. No recovery pipeline needed since we can prompt reload. Medium effort.
3. **Root cause**: Sort compile errors by topological order in the frontend result. Filter downstream errors. Medium effort.
4. **Mini-map dots**: Add error overlay to ReactFlow minimap. Low effort.
5. **Block tooltips**: Add error tooltip component to graph nodes. Low effort.

## Risks
- Humanizer needs ongoing maintenance as Naga error messages evolve.
- GPU safe mode recovery pipeline is complex and may not be needed if reload is acceptable.
- Topological filtering requires the dependency graph from the compiler, which must be threaded to the UI.
