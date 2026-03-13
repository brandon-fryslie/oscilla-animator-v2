# P5-2: Error Propagation / Developer Experience - UNIMPLEMENTED Items

## Item 1: GPU Safe Mode with Recovery Pipeline
**Spec says**: When `device.lost` resolves or `GPUPipelineError` is thrown: (1) Stop dispatching compute shader, (2) Clear screen to "Sad Mac" dark red color, (3) Create a "Recovery" pipeline (simple pass-through), (4) Lock editor with "GPU Reset Detected" modal.
**Implementation**: `device.lost` / `DEVICE_LOST` is detected and surfaced via `GpuFaultEvent` (`RustWasmWebGPURenderer.ts:1459-1471`). The renderer is marked fatal (`markRendererFatal`). `RuntimeService.ts:541` reports "GPU device lost -- rendering stopped." No recovery pipeline is created. No "Sad Mac" screen or "GPU Reset Detected" modal exists. The renderer just stops.
**Gap**: Fatal GPU errors stop the renderer but there is no safe mode, no recovery pipeline, and no user-facing GPU reset modal. The renderer enters a dead state rather than a graceful degraded state.
**Classification**: UNIMPLEMENTED

## Item 2: Error Humanizer / Translation Dictionary
**Spec says**: A regex-based dictionary of common Naga error patterns mapped to musician-friendly text. Example: "The expression [1] may only be indexed by a constant" -> "Arrays must use a fixed number as an index."
**Implementation**: `src/compiler/naga-compile.ts` passes Naga error messages through with location context appended but no translation. `src/compiler/frontend/frontendDiagnosticConversion.ts` and `src/compiler/diagnosticConversion.ts` exist for frontend diagnostics but not for Naga error humanization.
**Gap**: No Naga error translation dictionary. Users see raw Naga error messages.
**Classification**: UNIMPLEMENTED

## Item 3: Cascading Error / Root Cause Analysis
**Spec says**: Topological Filtering -- sort errors by topological order, show error only for the first block in the chain. Mark downstream blocks as "Disabled/Unreachable" rather than "Error."
**Implementation**: No topological filtering of errors found. Diagnostics are surfaced as-is from the compiler. No "gray out downstream" behavior.
**Gap**: No root cause analysis or topological error filtering. All errors are shown equally.
**Classification**: UNIMPLEMENTED

## Item 4: Mini-Map Error Visualization
**Spec says**: Mini-Map renders a bright red dot at failing block coordinates. Clicking error notification "teleports" viewport to failing block.
**Implementation**: The graph editor has a minimap (`src/ui/reactFlowEditor/ReactFlowEditor.tsx`, `ReactFlowEditor.css`), but no error-specific red dot visualization or click-to-teleport behavior for error blocks.
**Gap**: Mini-map exists but has no error visualization overlay.
**Classification**: UNIMPLEMENTED

## Item 5: Block Error Red Border / Tooltip
**Spec says**: Block component checks for active errors, renders red border CSS class `has-error`, shows error tooltip with icon and message.
**Implementation**: Graph editor nodes show error highlighting (`src/ui/graphEditor/GraphEditorCore.tsx` -- grep found "error highlight" references), but the spec's specific `has-error` CSS class and tooltip pattern is not directly implemented. Error indicators exist but may not match the spec's exact UX pattern.
**Gap**: Some error display exists in the graph editor but the specific red border + tooltip pattern from the spec needs verification. Partially implemented.
**Classification**: UNIMPLEMENTED (spec-specific UX pattern)
