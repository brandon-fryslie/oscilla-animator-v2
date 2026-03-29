/**
 * Payload Tester Fixtures
 *
 * Hand-authored GPU pass payloads for testing the WASM renderer boundary.
 * Each fixture is a complete, valid RustRendererGpuPass[] that can be
 * submitted directly to rebuildGpuPipelines.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL DEBT — THIS BOUNDARY IS WRONG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file violates [LAW:one-way-deps] in multiple ways. It exists as a
 * temporary testing shim and must be replaced. The problems:
 *
 * 1. JS IS IGNORANT OF RUST STRUCT SHAPES — AND MUST STAY THAT WAY
 *
 *    The FrameHeader struct (view_proj, resolution, time_seconds,
 *    delta_time_seconds) is a Rust-internal #[repr(C)] type defined in
 *    memory.rs. Its layout — field order, padding, alignment — is
 *    determined by the Rust compiler and WebGPU uniform buffer rules.
 *    The JS side has no business knowing or replicating this layout.
 *
 *    In the canonical rendering path, JS is correctly ignorant: it writes
 *    flat f64 values to SharedArrayBuffer at indices defined in
 *    runtime-input-layout.ts, and Rust reads those values and populates
 *    FrameHeader internally. JS never touches the struct shape.
 *
 *    These fixtures break that contract by hand-authoring WGSL that
 *    declares `struct FrameHeader { ... }` — an upward dependency from JS
 *    into Rust internals. When the Rust struct changes (as it did when
 *    view_proj was added), the fixtures silently read garbage.
 *
 * 2. JS SHOULD NOT BE PASSING WGSL TO THE RENDERER
 *
 *    The current RustRendererGpuPass payload includes a `wgsl: string`
 *    field — raw WGSL source that JS constructs and the Rust worker
 *    compiles via naga/wgpu. This means the JS side must understand:
 *    - The bind group layout (which bindings exist, their types)
 *    - The uniform buffer struct layout (FrameHeader field order)
 *    - WGSL syntax and semantics
 *    - Storage buffer conventions (arena_in, arena_out, etc.)
 *
 *    None of this is JS's concern. WGSL is a GPU-side implementation
 *    detail owned by the Rust renderer. JS passing WGSL strings is like
 *    a frontend passing SQL to a database — it collapses the abstraction
 *    boundary and couples the caller to implementation details.
 *
 * 3. JS SHOULD NOT BE DOING ANYTHING NAGA-SPECIFIC
 *
 *    The current compiler pipeline has a Naga lowering pass
 *    (ScheduleNagaLowering) that produces NagaModuleIR on the JS side,
 *    which is then sent to the Rust Naga shim for WGSL emission. This
 *    means JS understands Naga's type system, expression model, and
 *    statement semantics — all of which are Rust/GPU implementation
 *    details. The JS compiler should not need to know that Naga exists.
 *
 * 4. THE CORRECT BOUNDARY: OscillaIR → Rust → NagaIR → WGSL
 *
 *    The JS compiler should produce an OscillaIR — a high-level,
 *    domain-specific intermediate representation that describes the
 *    computation semantically (which slots to read, which kernels to
 *    apply, which outputs to write) without any knowledge of GPU bind
 *    groups, WGSL syntax, Naga types, or struct layouts.
 *
 *    The Rust side should then:
 *    a) Receive OscillaIR across the worker boundary
 *    b) Lower OscillaIR → NagaIR (Rust-internal, not exposed to JS)
 *    c) Emit NagaIR → WGSL via the Naga shim (entirely Rust-side)
 *    d) Compile WGSL → GPU pipeline (already happens in Rust)
 *
 *    This makes the JS→Rust boundary a clean data contract: JS describes
 *    WHAT to compute, Rust decides HOW to compute it on the GPU. The
 *    FrameHeader struct, bind group layout, WGSL syntax, and Naga types
 *    all become Rust-internal implementation details that JS never sees.
 *
 * 5. WHAT THIS MEANS FOR THESE FIXTURES
 *
 *    Once the OscillaIR boundary exists, these fixtures should be
 *    expressed as OscillaIR payloads (e.g., "identity: read slot N,
 *    write slot M" or "sine: apply sin(time + lane * 0.1) to slot N").
 *    The Rust side would lower them to WGSL. No hand-authored WGSL on
 *    the JS side, no FrameHeader knowledge, no Naga dependency.
 *
 *    Until then, this file is a pragmatic testing shim that works but
 *    violates the architectural boundary. The COMPUTE_PREAMBLE constant
 *    below replicates the Rust FrameHeader layout — any change to
 *    memory.rs::FrameHeader must be manually mirrored here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RustRendererGpuPass } from '../worker-protocol';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly passes: readonly RustRendererGpuPass[];
}

// [LAW:one-source-of-truth] This WGSL preamble must mirror the Rust
// FrameHeader struct in memory.rs (view_proj, resolution, time, delta_time)
// and the bind group layout in compute.rs. Any drift is a bug.
const COMPUTE_PREAMBLE = `
struct FrameHeader {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
}

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: FrameHeader;
`;

// ─── Tier 0: Identity compute ─────────────────────────────────────────────────
// The simplest valid payload. A single compute pass that copies arena_in[lane]
// to arena_out[lane]. If this renders without error, the pipeline is alive.
// Note: lane gating uses arrayLength(&arena_in) since active_lanes is a
// dispatch constant, not a uniform field.

const TIER_0_IDENTITY_WGSL = `${COMPUTE_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= arrayLength(&arena_in)) {
    return;
  }
  arena_out[lane] = arena_in[lane];
}
`;

// ─── Tier 0b: Time-driven sine wave ──────────────────────────────────────────
// Writes sin(time + lane * 0.1) to arena_out. If the debug readback shows
// changing values, per-frame uniform transport is working.

const TIER_0B_SINE_WGSL = `${COMPUTE_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= arrayLength(&arena_in)) {
    return;
  }
  arena_out[lane] = sin(uniforms.time_seconds + f32(lane) * 0.1);
}
`;

// ─── Tier 0c: Two-pass chain ─────────────────────────────────────────────────
// First pass writes sin(time + lane), second pass reads that and doubles it.
// Validates multi-pass ping-pong dispatch.

const TIER_0C_PASS_A_WGSL = `${COMPUTE_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= arrayLength(&arena_in)) { return; }
  arena_out[lane] = sin(uniforms.time_seconds + f32(lane) * 0.1);
}
`;

const TIER_0C_PASS_B_WGSL = `${COMPUTE_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= arrayLength(&arena_in)) { return; }
  arena_out[lane] = arena_in[lane] * 2.0;
}
`;

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'tier-0-identity',
    name: 'Tier 0: Identity Copy',
    description: 'Copies arena_in to arena_out. Simplest valid compute pass.',
    passes: [
      {
        passId: 'identity',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: TIER_0_IDENTITY_WGSL.trim(),
      },
    ],
  },
  {
    id: 'tier-0b-sine',
    name: 'Tier 0b: Time-Driven Sine',
    description: 'Writes sin(time + lane * 0.1) to arena. Validates uniform transport.',
    passes: [
      {
        passId: 'sine_wave',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: TIER_0B_SINE_WGSL.trim(),
      },
    ],
  },
  {
    id: 'tier-0c-two-pass',
    name: 'Tier 0c: Two-Pass Chain',
    description: 'Pass A writes sine, Pass B doubles it. Validates multi-pass ping-pong.',
    passes: [
      {
        passId: 'sine_generate',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: TIER_0C_PASS_A_WGSL.trim(),
      },
      {
        passId: 'double_values',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: TIER_0C_PASS_B_WGSL.trim(),
      },
    ],
  },
];
