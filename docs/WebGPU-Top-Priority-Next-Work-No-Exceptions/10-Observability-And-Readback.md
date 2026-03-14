# 10 - Observability And Readback

Spec target: `../WebGPU-Complete/P4-1_GPU_Observability__Async_Readback_System.md`, `../WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`

// [LAW:single-enforcer] Debug readback should have one canonical GPU-to-host pathway rather than a mix of ad hoc staging, logging, and stubs.

## Where We Are

- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1016-1058` maps a single staging slice, prints a short float preview to the console, and gates readback with one in-flight flag.
- `src/render/webgpu/RustWasmWebGPURenderer.ts:758-764` returns an empty indirect-args debug snapshot rather than reading actual GPU records.
- `src/render/webgpu/WebGPUIndirectArgsInspector.ts:33-129` defines a separate readback helper, but the Rust worker path does not expose a complete canonical readback flow through it.
- `src/runtime/DebugTap.ts:15-99` defines probe-slice interfaces, but the current worker readback path is not yet aligned with the spec's dedicated async surgical-slice system.

## First Draft Proposal

- Build one readback contract that starts from explicit probe descriptors, copies just the requested GPU slices, and decodes them through one canonical parser.
- Replace console-preview logging with structured readback publication that feeds runtime debugging services.
- Add the indirect-args readback path as a real worker-backed feature rather than a stub.
- Keep observability off the render dependency path: asynchronous, bounded, and owned by a dedicated readback system.
