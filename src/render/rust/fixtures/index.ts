/**
 * Payload Tester Fixtures
 *
 * Hand-authored GPU pass payloads for testing the WASM renderer boundary.
 * Each fixture is a complete, valid RustRendererGpuPass[] that can be
 * submitted directly to rebuildGpuPipelines.
 *
 * The WGSL in these fixtures must match the bind group layout defined in
 * compute.rs create_compiler_simulation_layout():
 *   @group(0) @binding(0) var<storage, read>       arena_in  : array<f32>;
 *   @group(0) @binding(1) var<storage, read_write>  arena_out : array<f32>;
 *   @group(0) @binding(2) var<storage, read>       state_in  : array<f32>;
 *   @group(0) @binding(3) var<storage, read_write>  state_out : array<f32>;
 *   @group(0) @binding(4) var<uniform>              uniforms  : FrameHeader;
 */

import type { RustRendererGpuPass } from '../worker-protocol';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly passes: readonly RustRendererGpuPass[];
}

// ─── Tier 0: Identity compute ─────────────────────────────────────────────────
// The simplest valid payload. A single compute pass that copies arena_in[lane]
// to arena_out[lane]. If this renders without error, the pipeline is alive.

const TIER_0_IDENTITY_WGSL = `
struct FrameHeader {
  viewport_width: f32,
  viewport_height: f32,
  time_seconds: f32,
  delta_time: f32,
  mouse_x: f32,
  mouse_y: f32,
  mouse_buttons: u32,
  active_lanes: u32,
}

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: FrameHeader;

@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  let active = uniforms.active_lanes;
  if (lane >= active) {
    return;
  }
  arena_out[lane] = arena_in[lane];
}
`;

// ─── Tier 0b: Time-driven sine wave ──────────────────────────────────────────
// Writes sin(time + lane * 0.1) to arena_out. If the debug readback shows
// changing values, per-frame uniform transport is working.

const TIER_0B_SINE_WGSL = `
struct FrameHeader {
  viewport_width: f32,
  viewport_height: f32,
  time_seconds: f32,
  delta_time: f32,
  mouse_x: f32,
  mouse_y: f32,
  mouse_buttons: u32,
  active_lanes: u32,
}

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: FrameHeader;

@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  let active = uniforms.active_lanes;
  if (lane >= active) {
    return;
  }
  arena_out[lane] = sin(uniforms.time_seconds + f32(lane) * 0.1);
}
`;

// ─── Tier 0c: Two-pass chain ─────────────────────────────────────────────────
// First pass writes sin(time + lane), second pass reads that and doubles it.
// Validates multi-pass ping-pong dispatch.

const TIER_0C_PASS_A_WGSL = `
struct FrameHeader {
  viewport_width: f32,
  viewport_height: f32,
  time_seconds: f32,
  delta_time: f32,
  mouse_x: f32,
  mouse_y: f32,
  mouse_buttons: u32,
  active_lanes: u32,
}

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: FrameHeader;

@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= uniforms.active_lanes) { return; }
  arena_out[lane] = sin(uniforms.time_seconds + f32(lane) * 0.1);
}
`;

const TIER_0C_PASS_B_WGSL = `
struct FrameHeader {
  viewport_width: f32,
  viewport_height: f32,
  time_seconds: f32,
  delta_time: f32,
  mouse_x: f32,
  mouse_y: f32,
  mouse_buttons: u32,
  active_lanes: u32,
}

@group(0) @binding(0) var<storage, read> arena_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> arena_out: array<f32>;
@group(0) @binding(2) var<storage, read> state_in: array<f32>;
@group(0) @binding(3) var<storage, read_write> state_out: array<f32>;
@group(0) @binding(4) var<uniform> uniforms: FrameHeader;

@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane >= uniforms.active_lanes) { return; }
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
