# P2-4: Scoped Naga IR Control Flow and Memory Model - TO-REVIEW Items

## Item 1: Atomics — Integer Payload Constraint
**Spec says**: "Atomic operations are expression-level (AtomicResult) and return the prior value. Integer payload constraints are mandatory."
**Implementation**:
  - `NagaBuilder.atomicAdd()` at `NagaBuilder.ts:408-436` enforces integer payload via `isIntegerScalar(valueType)` check at line 417-419.
  - `NagaValidator` at `NagaValidator.ts:329-343` validates `AtomicResult` expressions require `isIntegerScalar(valueType)`.
  - However, `NagaExpressionIR` in `ScheduleNagaLowering.ts` does NOT have an atomic expression kind. The actual lowering path has no atomic support.
**Gap**: Atomics exist in the `NagaBuilder` IR family but not in the `ScheduleNagaLowering` IR family (the active one). No GPU compute pass currently uses atomics. This will need extension when atomic operations are needed.
**Classification**: TO-REVIEW

## Item 2: String Interpolation Exclusion in Emitter Lowering Files
**Spec says**: Verification gate #4: "string interpolation exclusion in emitter lowering files" — lowering code must not generate WGSL strings.
**Implementation**: `ScheduleNagaLowering.ts` produces structured `NagaExpressionIR`/`NagaStatementIR` objects, never WGSL strings. Verified: no template literals or WGSL syntax appear in the file.
However, `fluid-gpu-bundle.ts` generates WGSL strings directly via template literals throughout the file (lines 410-838). This is documented as a deliberate architectural choice for the fluid simulation path.
**Gap**: The simulation compute path strictly avoids string generation. The fluid path does not. The spec's verification gate would fail for `fluid-gpu-bundle.ts`.
**Classification**: TO-REVIEW — the fluid bundle is a separate concern from the main lowering pipeline, but the spec's verification gate does not distinguish between them.

## Item 3: Draw-Prep Metadata in Compiler IR
**Spec says**: Verification gate #4: "Draw-prep metadata stays structured in compiler IR (drawPrepProgram.sinks); compile.ts must not assemble draw-prep WGSL source text."
**Implementation**: No `drawPrepProgram` concept exists in the current codebase. The Rust renderer owns draw-prep internally. The compiler produces `generatedComputeProgram` metadata and `nagaLoweringProgram` but does not generate draw-prep shaders.
**Gap**: The draw-prep responsibility has been moved to the Rust renderer, which is a reasonable architectural decision but diverges from the spec's expectation that the TS compiler would produce draw-prep metadata.
**Classification**: TO-REVIEW

## Item 4: Uber-Shader Integration via Explicit Function/Module Boundaries
**Spec says**: "Graph-generated shader logic is integrated through explicit function/module boundaries into the rendering pipeline rather than ad hoc source mutation."
**Implementation**: The simulation compute shader is a standalone WGSL module with one entry point (`compute_main`). It is not integrated into an uber-shader. The Rust renderer creates its own render/draw-prep pipelines independently.
**Gap**: No uber-shader pattern. Each compute pass is a self-contained module. This is cleaner than the spec's uber-shader concept.
**Classification**: TO-REVIEW — implemented differently but arguably better.

## Item 5: Validator Reports Source Mapping to visualBlockId
**Spec says**: Verification gate #3: "Validator reports expression vs statement failures with source mapping to visualBlockId."
**Implementation**:
  - `NagaValidator` at `NagaValidator.ts:10-15` issues carry `visualBlockId: string | null` and `isStatement: boolean`.
  - `NagaValidationError` at `NagaValidator.ts:17-31` carries `handle` and `visualBlockId`.
  - Naga compile errors are mapped back via `naga-compile.ts:142-162` using the `sourceMap` from lowering.
**Gap**: Fully implemented across both validation layers (TS `NagaValidator` and Rust shim error mapping).
**Classification**: TO-REVIEW — confirmed working.
