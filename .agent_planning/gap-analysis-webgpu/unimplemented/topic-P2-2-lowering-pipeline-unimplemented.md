# P2-2: Naga Compiler Lowering Pipeline - UNIMPLEMENTED Items

## Item 1: Struct Type in NagaModule for Uniforms
**Spec says**: "uniforms: Var { class: 'Uniform', ... type: Type[Struct_Uniforms] }" — uniforms should use a named struct type.
**Implementation**: Uniforms use `array<vec4<f32>, 5>` at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:303` rather than a named struct. The Rust shim emits `var<uniform> uniforms: array<vec4<f32>, 5>` which works but is not a named struct.
**Gap**: The spec calls for a `Struct_Uniforms` type for semantic clarity. The current array-of-vec4 approach works but loses named field access semantics. The fluid GPU bundles in `fluid-gpu-bundle.ts:411-423` DO use a `GlobalUniforms` struct type for the same data.
**Classification**: UNIMPLEMENTED — inconsistency between the simulation compute pass (flat array) and the fluid compute passes (named struct) for the same uniform data.

## Item 2: Multiple Functions in NagaModule (helpers)
**Spec says**: "functions: NagaFunction[] // The code (compute_main, helpers)" — multiple functions including library helpers for complex blocks.
**Implementation**: Only one function is ever emitted: `compute_main` at `ScheduleNagaLowering.ts:2328-2335`. The `functions` array always has exactly one entry.
**Gap**: No helper function support. All operations are inlined into `compute_main`. This will need extension when complex GPU-side operations (noise, etc.) are added.
**Classification**: UNIMPLEMENTED
