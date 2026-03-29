/**
 * Payload Tester Fixtures
 *
 * Two fixture families exercise different boundary layers:
 *
 * 1. **WGSL-pass fixtures** (Tier 0*): RustRendererGpuPass[] with hand-authored
 *    WGSL, submitted via rebuildGpuPipelines. Tests shader compilation + dispatch.
 * 2. **Boundary-contract fixtures** (Triangle*): Full INSTALL_PIPELINE_V1 +
 *    PUBLISH_FRAME_INPUT_V1 payloads with sink tables, shape banks, and frame
 *    inputs. Tests the complete install→frame rendering lifecycle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURAL DEBT — THIS BOUNDARY IS WRONG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * See original fixture header for full rationale. In short: JS hand-authoring
 * WGSL that replicates Rust-internal FrameHeader layout is an upward dependency
 * violation. The correct boundary is OscillaIR → Rust → NagaIR → WGSL.
 * Until then, COMPUTE_PREAMBLE must mirror memory.rs::FrameHeader.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RustRendererGpuPass } from '../worker-protocol';
import { RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS } from '../worker-protocol';
import type {
  InstallPipelineBoundaryPayloadV1,
  PublishFrameInputBoundaryPayloadV1,
} from '../boundary-contract';
import type { MemoryManifestIR } from '../../../compiler/ir/program';
import { canonicalScalar, canonicalMany, FLOAT, VEC2, VEC4, UNBOUND_INSTANCE } from '../../../core/canonical-types';

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

// ─── Boundary-contract fixture helpers ───────────────────────────────────────

function float32ToUint32Bits(value: number): number {
  const floatWords = new Float32Array(1);
  const uintWords = new Uint32Array(floatWords.buffer);
  floatWords[0] = value;
  return uintWords[0] >>> 0;
}

const TRIANGLE_MEMORY_MANIFEST: MemoryManifestIR = {
  resources: [
    { id: 'arena:slot:1', type: canonicalScalar(VEC2), cardinality: 1, packing: 'soa', updateClass: 'FrameTime' },
    { id: 'arena:slot:2', type: canonicalScalar(VEC4), cardinality: 1, packing: 'soa', updateClass: 'FrameTime' },
    { id: 'arena:slot:3', type: canonicalScalar(FLOAT), cardinality: 1, packing: 'soa', updateClass: 'FrameTime' },
    { id: 'arena:slot:4', type: canonicalScalar(FLOAT), cardinality: 1, packing: 'soa', updateClass: 'FrameTime' },
    { id: 'arena:slot:10', type: canonicalMany(VEC2, undefined, UNBOUND_INSTANCE), cardinality: 3, packing: 'soa', updateClass: 'FrameTime' },
  ],
};

const TRIANGLE_SINK_POINTER_MAP = {
  '0:position': 'arena:slot:1',
  '0:color': 'arena:slot:2',
  '0:scale': 'arena:slot:3',
  '0:shape': 'arena:slot:4',
} as const;

const BASE_SHAPE_BANK_WORDS: readonly number[] = [
  1, // Kind: Type1Rigid
  1, // TopologyMode: Path
  0, // Flags
  0, // MaterialClass
  0, // IndexCount (non-indexed draw)
  0, // FirstIndex (worker-derived)
  0, // BaseVertex (worker-derived)
  3, // VertexCount
  0, // FirstVertex
  0, // ParamBlockOffset
  0, // ParamBlockWords
  10, // CpArenaBaseOffset symbolic slot id (arena:slot:10)
  0, // BoundsMinPacked
  0, // BoundsMaxPacked
  0, // CpArenaLaneStride (worker-resolved)
  0, // CpArenaComponentStride (worker-resolved)
];

const BASE_TOPOLOGY_ID_BY_HANDLE = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const;

// materialId is always 0: the canonical packer treats it as a GPU draw-prep–
// owned dynamic field (see DrawPrepSinkTablePacker.ts).
// Descriptor uses the canonical 31-word layout (RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS)
// including PositionZ fields at words 26-30.
function createSinkTableWords(staticInstanceCount: number): number[] {
  // Validate descriptor size matches canonical constant at build time
  const EXPECTED_DESCRIPTOR_WORDS = RUST_RENDERER_SINK_TABLE_DESCRIPTOR_WORDS; // 31
  const descriptor: number[] = [
    // DrawPrepSinkDescriptorWord enum (0..30)
    0, // 0: PositionBaseOffset (worker-resolved)
    0, // 1: PositionLaneStride (worker-resolved)
    0, // 2: PositionComponentStride (worker-resolved)
    0, // 3: ColorBaseOffset (worker-resolved)
    0, // 4: ColorLaneStride (worker-resolved)
    0, // 5: ColorComponentStride (worker-resolved)
    0, // 6: ScaleBaseOffset (worker-resolved)
    0, // 7: ScaleLaneStride (worker-resolved)
    0, // 8: ScaleComponentStride (worker-resolved)
    0, // 9: RotationMode (constant)
    0, // 10: RotationBaseOffset
    0, // 11: RotationLaneStride
    0, // 12: RotationComponentStride
    float32ToUint32Bits(0.0), // 13: RotationDefaultBits
    0, // 14: Scale2Mode (constant)
    0, // 15: Scale2BaseOffset
    0, // 16: Scale2LaneStride
    0, // 17: Scale2ComponentStride
    float32ToUint32Bits(1.0), // 18: Scale2DefaultXBits
    float32ToUint32Bits(1.0), // 19: Scale2DefaultYBits
    0, // 20: ShapeSlotBaseOffset (worker-resolved)
    0, // 21: ShapeSlotLaneStride (worker-resolved)
    0, // 22: ShapeSlotComponentStride (worker-resolved)
    0, // 23: InstanceCountMode (static)
    staticInstanceCount, // 24: StaticInstanceCount
    0, // 25: ShapeWordOffset -> first shape record
    0, // 26: PositionZMode (constant)
    0, // 27: PositionZBaseOffset
    0, // 28: PositionZLaneStride
    0, // 29: PositionZComponentStride
    float32ToUint32Bits(0.0), // 30: PositionZDefaultBits
  ];
  if (descriptor.length !== EXPECTED_DESCRIPTOR_WORDS) {
    throw new Error(`Descriptor length ${descriptor.length} !== canonical ${EXPECTED_DESCRIPTOR_WORDS}`);
  }

  return [
    // Header (8 words)
    1, // version
    1, // totalRecordCount
    0, // indexedRecordCount
    1, // nonIndexedRecordCount
    0, // indexedRegionBaseWords
    0, // nonIndexedRegionBaseWords
    5, // indexedStrideWords
    4, // nonIndexedStrideWords
    // Record (8 words)
    1, // drawMode: nonIndexed
    0, // count (GPU draw-prep writes)
    0, // instanceCount (GPU draw-prep writes)
    0, // first (GPU draw-prep writes)
    0, // baseVertex (GPU draw-prep writes)
    0, // firstInstance (GPU draw-prep writes)
    0, // shapeWordOffset (descriptor owns canonical value)
    0, // materialId (GPU draw-prep writes; fixtures keep this 0)
    // Descriptor (31 words)
    ...descriptor,
  ];
}

interface FixtureComputePass {
  readonly passId: string;
  readonly entryPoint: string;
  readonly wgsl: string;
}

function createTriangleInstall(
  passes: readonly FixtureComputePass[],
  options: {
    readonly materialClass?: number;
    readonly staticInstanceCount?: number;
  } = {},
): InstallPipelineBoundaryPayloadV1 {
  // [LAW:one-source-of-truth] Fixture install payloads share one canonical
  // builder so sink-table/shape-bank plane structure cannot drift per fixture.
  const materialClass = options.materialClass ?? 0;
  const staticInstanceCount = options.staticInstanceCount ?? 1;
  const shapeBankWords = [...BASE_SHAPE_BANK_WORDS];
  shapeBankWords[3] = materialClass;
  const sinkTableWords = createSinkTableWords(staticInstanceCount);
  return {
    type: 'INSTALL_PIPELINE_V1',
    pipeline: {
      passes: passes.map((pass) => ({
        passId: pass.passId,
        stage: 'compute',
        entryPoint: pass.entryPoint,
        wgsl: pass.wgsl,
        memoryManifest: TRIANGLE_MEMORY_MANIFEST,
      })),
      sinkPointerMap: TRIANGLE_SINK_POINTER_MAP,
      shapeBankWords,
      shapeBankWordCount: shapeBankWords.length,
      topologyIdByHandle: [...BASE_TOPOLOGY_ID_BY_HANDLE],
      sinkTableWords,
      sinkTableWordCount: sinkTableWords.length,
    },
  };
}

function createFramePayload(
  frame: Partial<PublishFrameInputBoundaryPayloadV1['frame']> = {},
): PublishFrameInputBoundaryPayloadV1 {
  return {
    type: 'PUBLISH_FRAME_INPUT_V1',
    frame: {
      width: 960,
      height: 540,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
      inputMouseX: 0,
      inputMouseY: 0,
      inputMouseButtons: 0,
      inputAudioLow: 0,
      inputAudioMid: 0,
      inputAudioHigh: 0,
      inputGaugeActive: 0,
      // Camera defaults (orthographic, centered, standard near/far)
      cameraProjection: 0,
      cameraCenterX: 0,
      cameraCenterY: 0,
      cameraDistance: 5,
      cameraTiltRad: 0,
      cameraYawRad: 0,
      cameraFovYRad: Math.PI / 4,
      cameraNear: 0.1,
      cameraFar: 100,
      ...frame,
    },
  };
}

// ─── Boundary-contract WGSL shaders ──────────────────────────────────────────
// These fixtures exercise the install/frame payload shapes, not WGSL correctness.
// The FrameHeader definition here must mirror memory.rs::FrameHeader and match
// what the Rust renderer actually packs into the uniform buffer.

const BOUNDARY_PREAMBLE = `
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

// Helper: writes all required sink lanes for a single-instance triangle.
// Position (0-1), color (4-7), scale (8), shape (9), control points (10-15).
const WRITE_FULL_TRIANGLE_LANES = `
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
`;

const TRIANGLE_RENDER_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }
${WRITE_FULL_TRIANGLE_LANES}
}
`.trim();

const TRIANGLE_PULSE_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }

  let pulse = 0.70 + 0.30 * (0.5 + 0.5 * sin(uniforms.time_seconds * 2.0));

  arena_out[0u] = 0.0;
  arena_out[1u] = 0.0;

  arena_out[4u] = 0.03;
  arena_out[5u] = 0.16;
  arena_out[6u] = 0.92;
  arena_out[7u] = 1.0;

  arena_out[8u] = pulse;
  arena_out[9u] = 0.0;

  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

const TRIANGLE_MOUSE_TRACK_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }

  arena_out[0u] = 0.0;
  arena_out[1u] = 0.0;

  arena_out[4u] = 0.05;
  arena_out[5u] = 0.18;
  arena_out[6u] = 0.72;
  arena_out[7u] = 1.0;

  arena_out[8u] = 0.70;
  arena_out[9u] = 0.0;

  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

const TRIANGLE_ORBIT_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }

  let t = uniforms.time_seconds;
  let orbit = 0.35;

  arena_out[0u] = cos(t * 0.8) * orbit;
  arena_out[1u] = sin(t * 0.8) * orbit;

  arena_out[4u] = 0.04;
  arena_out[5u] = 0.20;
  arena_out[6u] = 0.84;
  arena_out[7u] = 1.0;

  arena_out[8u] = 0.85;
  arena_out[9u] = 0.0;

  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

// Geometry pass writes ALL required sink lanes so the color pass doesn't need to.
// Ping-pong buffers mean unwritten lanes contain stale data from the previous
// write buffer — writing them here ensures deterministic output.
const TRIANGLE_TWO_PASS_GEOMETRY_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_geometry(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }

  // Position
  arena_out[0u] = 0.0;
  arena_out[1u] = 0.0;

  // Color — will be overwritten by color pass; write defaults here so
  // the frame is valid even if only the geometry pass runs.
  arena_out[4u] = 0.04;
  arena_out[5u] = 0.20;
  arena_out[6u] = 0.70;
  arena_out[7u] = 1.0;

  // Scale + shape
  arena_out[8u] = 0.95;
  arena_out[9u] = 0.0;

  // Control points
  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

// Color pass: reads geometry from arena_in (written by geometry pass after
// ping-pong flip), copies non-color lanes to arena_out to preserve them,
// then overwrites color lanes with animated values.
const TRIANGLE_TWO_PASS_COLOR_WGSL = `${BOUNDARY_PREAMBLE}
@compute @workgroup_size(64, 1, 1)
fn compute_color(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) { return; }

  // Copy all non-color lanes from arena_in to preserve geometry pass output.
  // (Ping-pong means arena_out is a different buffer than what geometry wrote.)
  arena_out[0u] = arena_in[0u];   // position.x
  arena_out[1u] = arena_in[1u];   // position.y
  arena_out[8u] = arena_in[8u];   // scale
  arena_out[9u] = arena_in[9u];   // shape
  arena_out[10u] = arena_in[10u]; // cp0.x
  arena_out[11u] = arena_in[11u]; // cp1.x
  arena_out[12u] = arena_in[12u]; // cp2.x
  arena_out[13u] = arena_in[13u]; // cp0.y
  arena_out[14u] = arena_in[14u]; // cp1.y
  arena_out[15u] = arena_in[15u]; // cp2.y

  // Animate color
  let wobble = 0.5 + 0.5 * sin(uniforms.time_seconds * 1.4);
  arena_out[4u] = 0.04 + 0.02 * wobble;
  arena_out[5u] = 0.20;
  arena_out[6u] = 0.55 + 0.30 * wobble;
  arena_out[7u] = 1.0;
}
`.trim();

// ─── Pre-built install payloads ──────────────────────────────────────────────

const TRIANGLE_INSTALL = createTriangleInstall([
  { passId: 'triangle_writer', entryPoint: 'compute_main', wgsl: TRIANGLE_RENDER_WGSL },
]);

const TRIANGLE_PULSE_INSTALL = createTriangleInstall([
  { passId: 'triangle_pulse_writer', entryPoint: 'compute_main', wgsl: TRIANGLE_PULSE_WGSL },
]);

const TRIANGLE_MOUSE_TRACK_INSTALL = createTriangleInstall([
  { passId: 'triangle_mouse_track_writer', entryPoint: 'compute_main', wgsl: TRIANGLE_MOUSE_TRACK_WGSL },
]);

const TRIANGLE_ORBIT_INSTALL = createTriangleInstall([
  { passId: 'triangle_orbit_writer', entryPoint: 'compute_main', wgsl: TRIANGLE_ORBIT_WGSL },
]);

const TRIANGLE_TWO_PASS_INSTALL = createTriangleInstall([
  { passId: 'triangle_geometry_writer', entryPoint: 'compute_geometry', wgsl: TRIANGLE_TWO_PASS_GEOMETRY_WGSL },
  { passId: 'triangle_color_writer', entryPoint: 'compute_color', wgsl: TRIANGLE_TWO_PASS_COLOR_WGSL },
]);

// ─── Frame payloads ──────────────────────────────────────────────────────────

const DEFAULT_FRAME = createFramePayload();
const ZOOMED_FRAME = createFramePayload({ zoom: 1.2, panX: 0.08, panY: -0.06 });
const MOUSE_TOP_RIGHT_FRAME = createFramePayload({ inputMouseX: 760, inputMouseY: 120, inputMouseButtons: 1 });

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
  // Boundary-contract fixtures (exercise INSTALL_PIPELINE_V1 + PUBLISH_FRAME_INPUT_V1)
  {
    id: 'static-triangle-v1',
    name: 'Static Triangle',
    description: 'Simplest full-path fixture: single compute pass writes static triangle data.',
    install: TRIANGLE_INSTALL,
    frame: DEFAULT_FRAME,
  },
  {
    id: 'pulse-scale-triangle-v1',
    name: 'Pulse Scale Triangle',
    description: 'Animates triangle scale via time_seconds. Validates per-frame uniform transport.',
    install: TRIANGLE_PULSE_INSTALL,
    frame: DEFAULT_FRAME,
  },
  {
    id: 'mouse-track-triangle-v1',
    name: 'Mouse Track Triangle',
    description: 'Reads resolution uniforms. Validates frame input publication.',
    install: TRIANGLE_MOUSE_TRACK_INSTALL,
    frame: MOUSE_TOP_RIGHT_FRAME,
  },
  {
    id: 'orbit-triangle-v1',
    name: 'Orbit Triangle',
    description: 'Animates triangle center in a circular orbit using time_seconds.',
    install: TRIANGLE_ORBIT_INSTALL,
    frame: ZOOMED_FRAME,
  },
  {
    id: 'two-pass-triangle-v1',
    name: 'Two Pass Triangle',
    description: 'Geometry + color in separate compute passes. Validates multi-pass install with ping-pong copy.',
    install: TRIANGLE_TWO_PASS_INSTALL,
    frame: DEFAULT_FRAME,
  },
];
