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
import type { MemoryManifestIR } from '../../../compiler/ir/program';

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

// ─── Tier 1: Triangle render (with memory manifest) ─────────────────────────
// Writes fixed arena slots for position, color, scale, shape, and control
// points. Includes a memory manifest so the Rust renderer can resolve sink
// pointers. This is the simplest fixture that exercises the full render path.

const TRIANGLE_RENDER_WGSL = `
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
  if (lane != 0u) {
    return;
  }

  // arena:slot:1 (vec2) -> position center
  arena_out[0u] = 0.0;
  arena_out[1u] = 0.0;

  // arena:slot:2 (vec4) -> color in OKLCH space
  arena_out[4u] = 0.02;
  arena_out[5u] = 0.18;
  arena_out[6u] = 0.75;
  arena_out[7u] = 1.0;

  // arena:slot:3 (f32) -> scale
  arena_out[8u] = 1.0;

  // arena:slot:4 (shape) -> reserved shape slot signal
  arena_out[9u] = 0.0;

  // arena:slot:10 (vec2, cardinality=3) -> triangle control points
  arena_out[10u] = 0.20; // cp0.x
  arena_out[13u] = 0.20; // cp0.y
  arena_out[11u] = 0.80; // cp1.x
  arena_out[14u] = 0.20; // cp1.y
  arena_out[12u] = 0.50; // cp2.x
  arena_out[15u] = 0.80; // cp2.y
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
  {
    id: 'visible-triangle-v1',
    name: 'Visible Triangle',
    description: 'Writes fixed position/color/scale/shape + triangle control points. Exercises memory manifest for sink pointer resolution.',
    passes: [
      {
        passId: 'triangle_writer',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: TRIANGLE_RENDER_WGSL.trim(),
        memoryManifest: {
          resources: [
            { id: 'arena:slot:1', type: 'vec2', cardinality: 1, packing: 'soa', updateClass: '' },
            { id: 'arena:slot:2', type: 'vec4', cardinality: 1, packing: 'soa', updateClass: '' },
            { id: 'arena:slot:3', type: 'f32', cardinality: 1, packing: 'soa', updateClass: '' },
            { id: 'arena:slot:4', type: 'shape', cardinality: 1, packing: 'soa', updateClass: '' },
            { id: 'arena:slot:10', type: 'vec2', cardinality: 3, packing: 'soa', updateClass: '' },
          ],
        } as unknown as MemoryManifestIR,
      },
    ],
  },
];
