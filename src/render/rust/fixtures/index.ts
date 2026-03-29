/**
 * Payload Tester Fixtures
 *
 * Two fixture families exercise different boundary layers:
 *
 * 1. **WGSL-pass fixtures** (Tier 0*): RustRendererGpuPass[] with hand-authored
 *    WGSL, submitted via rebuildGpuPipelines. Tests shader compilation + dispatch.
 * 2. **Boundary-contract fixtures**: Full INSTALL_PIPELINE_V1 +
 *    PUBLISH_FRAME_INPUT_V1 payloads with sink tables, shape banks, and frame
 *    inputs. Tests the complete install→frame rendering lifecycle.
 *    (No instances yet — WGSL must come from the Rust side, not JS.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL DEBT — TIER 0 WGSL BOUNDARY IS WRONG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Tier 0 fixtures still hand-author WGSL on the JS side. This violates
 * [LAW:one-way-deps]: WGSL is a Rust-internal concern. The correct boundary
 * is OscillaIR → Rust → NagaIR → WGSL. Until then, COMPUTE_PREAMBLE must
 * mirror memory.rs::FrameHeader.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RustRendererGpuPass } from '../worker-protocol';
import type {
  InstallPipelineBoundaryPayloadV1,
  PublishFrameInputBoundaryPayloadV1,
} from '../boundary-contract';

// ─── PayloadFixture: discriminated union ─────────────────────────────────────

export interface WgslPassFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly passes: readonly RustRendererGpuPass[];
}

export interface BoundaryContractFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly install: InstallPipelineBoundaryPayloadV1;
  readonly frame: PublishFrameInputBoundaryPayloadV1;
}

export type PayloadFixture = WgslPassFixture | BoundaryContractFixture;

export function isWgslPassFixture(f: PayloadFixture): f is WgslPassFixture {
  return 'passes' in f;
}

export function isBoundaryContractFixture(f: PayloadFixture): f is BoundaryContractFixture {
  return 'install' in f;
}

// ─── WGSL-pass fixture definitions ───────────────────────────────────────────

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

// ─── Exported fixture list ───────────────────────────────────────────────────

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  // WGSL-pass fixtures (exercise shader compilation + dispatch)
  {
    id: 'tier-0-identity',
    name: 'Tier 0: Identity Copy',
    description: 'Copies arena_in to arena_out. Simplest valid compute pass.',
    passes: [
      { passId: 'identity', stage: 'compute', entryPoint: 'compute_main', wgsl: TIER_0_IDENTITY_WGSL.trim() },
    ],
  },
  {
    id: 'tier-0b-sine',
    name: 'Tier 0b: Time-Driven Sine',
    description: 'Writes sin(time + lane * 0.1) to arena. Validates uniform transport.',
    passes: [
      { passId: 'sine_wave', stage: 'compute', entryPoint: 'compute_main', wgsl: TIER_0B_SINE_WGSL.trim() },
    ],
  },
  {
    id: 'tier-0c-two-pass',
    name: 'Tier 0c: Two-Pass Chain',
    description: 'Pass A writes sine, Pass B doubles it. Validates multi-pass ping-pong.',
    passes: [
      { passId: 'sine_generate', stage: 'compute', entryPoint: 'compute_main', wgsl: TIER_0C_PASS_A_WGSL.trim() },
      { passId: 'double_values', stage: 'compute', entryPoint: 'compute_main', wgsl: TIER_0C_PASS_B_WGSL.trim() },
    ],
  },
];
