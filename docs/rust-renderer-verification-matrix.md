# Rust Renderer Verification Matrix

## Gate 1: Native Compute Functional Test
- Manifest: `native-tests/webgpu-headless/Cargo.toml`
- Test: `gate1_native_headless_compute_math_is_correct`
- Contract:
  - Creates Vulkan-backed `wgpu::Device` in headless mode.
  - Dispatches compute shader over storage buffers.
  - Maps readback buffer and asserts exact numeric outputs.

## Gate 2: Zero-Allocation Trap in Browser Worker
- Playwright test: `tests/e2e/webgpu/rust-worker-gates.spec.ts`
- Contract:
  - Boots dedicated worker and Rust/WASM engine.
  - Sends `INJECT_POISON_ALLOC`.
  - Asserts worker fatal path is observed.

## Gate 3: Render Snapshot Regression
- Manifest: `native-tests/webgpu-headless/Cargo.toml`
- Test: `gate3_render_snapshot_matches_golden_master_pixels`
- Contract:
  - Renders deterministic frame to headless texture.
  - Copies texture to CPU buffer.
  - Encodes PNG payload.
  - Performs pixel diff against fixed golden target (all-red frame).

## Gate 4: Frame Pacing Telemetry
- Runtime channel: `RUNTIME_TELEMETRY` worker outbound message.
- Playwright test: `tests/e2e/webgpu/rust-worker-gates.spec.ts`
- Contract:
  - Rust engine records tick mean/stddev every 60 frames.
  - Worker emits telemetry packet.
  - Test asserts `stdDevMs <= 1.0`.

## Binary ABI Rules
- No JSON parsing in hot/runtime control paths.
- Runtime inputs flow through one `SharedArrayBuffer` plane (`Float32Array` + signal words).
- Pipeline rebuild payload uses typed worker message fields:
  - `simulationWgsl`
  - `assemblyWgsl`
  - `uberShaderWgsl`
  - `particleCount`
  - `shapeCount`

## Lifecycle Controls
- `RESIZE_CANVAS`: surface/depth reconfigure out-of-band.
- `PAUSE` / `RESUME`: suspend/resume frame tick around expensive rebuild operations.
- `DEVICE_LOST`: emitted by worker when surface loss is detected; caller must cold-boot.
