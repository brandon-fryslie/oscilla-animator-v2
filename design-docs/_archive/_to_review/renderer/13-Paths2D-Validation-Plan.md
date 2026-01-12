# Paths2D Validation Plan (DevTools-First)

This plan defines how to validate the Paths2D pipeline without relying on automated tests. It is designed for manual verification using DevTools and the in-app debugger.

## Goals
- Confirm the IR compiler emits a `paths2d` render sink with correct inputs.
- Confirm schedule includes `materializePath` and path buffer slots.
- Confirm RenderFrameIR contains a Paths2D pass with valid buffers and styles.
- Confirm Canvas rendering matches expectations (shape + stroke/fill + opacity).

## Tools
- Chrome DevTools console
- Built-in debug probes (if enabled)
- Render frame inspector output (if available)

## Checks

### 1) Compiler Output Check
1. Compile a patch that includes `RenderPaths2D`.
2. In DevTools, inspect the compiled IR (compiledProgram or compiledIR).
3. Confirm:
   - `renderSinks` includes `{ sinkType: "paths2d" }`.
   - `schedule.steps` includes a `materializePath` step.
   - `schedule.initialSlotValues` includes `{ kind: "fieldExpr", exprId: ... }` for pathExprSlot.

### 2) Runtime Buffer Check
1. At runtime, inspect ValueStore slots used by the `materializePath` step.
2. Confirm:
   - `outCmdsSlot` contains `Uint16Array`.
   - `outParamsSlot` contains `Float32Array`.
   - `outCmdStartSlot/outCmdLenSlot/outPointStartSlot/outPointLenSlot` contain `Uint32Array`.

### 3) RenderFrameIR Check
1. Inspect the RenderFrameIR produced by `executeRenderAssemble`.
2. Confirm:
   - `passes` includes a `paths2d` pass.
   - `geometry` buffer refs match the slots in ValueStore.
   - `style` fields are present when inputs are provided (fill/stroke/opacity).

### 4) Visual Output Check
1. Verify on-canvas output:
   - The path geometry is visible and stable.
   - Fill and/or stroke appear as configured.
   - Opacity is respected.

### 5) Failure Mode Check
1. Remove a required input (e.g., fillColor) and confirm:
   - Compiler or schedule builder throws a clear error.
   - No silent fallback occurs.

## Documentation
Record any mismatch in:
- `design-docs/13-Renderer/12-Paths2D-Implementation-Plan.md`
- `design-docs/13-Renderer/14-Paths2D-Risks.md`

