/**
 * Payload Tester Fixtures
 *
 * Hand-authored NagaModuleIR payloads for testing the JS→Rust boundary.
 * Each fixture is a complete NagaModuleIR + MemoryManifestIR that the
 * Naga shim compiles to WGSL, which then gets sent to the renderer.
 *
 * The NagaModuleIR type indices reference the types array positionally:
 *   0: f32 (scalar)
 *   1: u32 (scalar)
 *   2: vec3<u32> (vector)
 *   3: array<f32> (dynamic storage)
 *   4: FrameHeader (struct)
 *
 * Global variables match the renderer's bind group layout:
 *   @group(0) @binding(0) arena_in   : array<f32>  (storage, read)
 *   @group(0) @binding(1) arena_out  : array<f32>  (storage, read_write)
 *   @group(0) @binding(2) state_in   : array<f32>  (storage, read)
 *   @group(0) @binding(3) state_out  : array<f32>  (storage, read_write)
 *   @group(0) @binding(4) uniforms   : FrameHeader (uniform)
 */

import type { NagaModuleIR } from '../../../compiler/ir/naga-emitter/ScheduleNagaLowering';
import type { MemoryManifestIR } from '../../../compiler/ir/program';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly module: NagaModuleIR;
  readonly manifest: MemoryManifestIR;
}

// ─── Shared type/global definitions ───────────────────────────────────────────

const STANDARD_TYPES = [
  // 0: f32
  { kind: 'scalar' as const, scalar: 'f32' as const, width: 4 as const },
  // 1: u32
  { kind: 'scalar' as const, scalar: 'u32' as const, width: 4 as const },
  // 2: vec3<u32>
  { kind: 'vector' as const, size: 3 as const, scalar: 'u32' as const, width: 4 as const },
  // 3: array<f32> (dynamic)
  { kind: 'array' as const, base: 0, size: 'dynamic' as const },
  // 4: FrameHeader struct
  {
    kind: 'struct' as const,
    name: 'FrameHeader',
    fields: [
      { name: 'viewport_width', type: 0 },
      { name: 'viewport_height', type: 0 },
      { name: 'time_seconds', type: 0 },
      { name: 'delta_time', type: 0 },
      { name: 'mouse_x', type: 0 },
      { name: 'mouse_y', type: 0 },
      { name: 'mouse_buttons', type: 1 },
      { name: 'active_lanes', type: 1 },
    ],
  },
] as const;

const STANDARD_GLOBALS = [
  { name: 'arena_in' as const, storageClass: 'storage' as const, access: 'read' as const, binding: { group: 0, binding: 0 }, type: 3 },
  { name: 'arena_out' as const, storageClass: 'storage' as const, access: 'read_write' as const, binding: { group: 0, binding: 1 }, type: 3 },
  { name: 'state_in' as const, storageClass: 'storage' as const, access: 'read' as const, binding: { group: 0, binding: 2 }, type: 3 },
  { name: 'state_out' as const, storageClass: 'storage' as const, access: 'read_write' as const, binding: { group: 0, binding: 3 }, type: 3 },
  { name: 'uniforms' as const, storageClass: 'uniform' as const, access: 'read' as const, binding: { group: 0, binding: 4 }, type: 4 },
] as const;

const STANDARD_ENTRY_POINT = {
  stage: 'compute' as const,
  function: 'compute_main',
  workgroupSize: [64, 1, 1] as const,
};

// Helper: standard function arg for global_invocation_id
const GID_ARG = { name: 'global_id', type: 2, builtin: 'global_invocation_id' as const };

// A minimal CanonicalType for a scalar float — only the fields the Rust
// symbol resolver actually reads (payload.kind for component width).
// We use 'as any' because CanonicalType has a complex shape but the Rust
// serde only inspects a few string fields.
const FLOAT_TYPE = { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: { cardinality: { kind: 'inst', value: { kind: 'one' } } } } as any;

/** Manifest with one arena slot: arena:slot:0 (1 f32 per lane, 256 lanes). */
const SINGLE_SLOT_MANIFEST: MemoryManifestIR = {
  resources: [
    {
      id: 'arena:slot:0',
      type: FLOAT_TYPE,
      cardinality: 256,
      packing: 'soa',
      updateClass: 'FrameTime' as any,
    },
  ],
};

// ─── Tier 0: Identity copy ────────────────────────────────────────────────────
// arena_out[lane] = arena_in[lane]

const TIER_0_IDENTITY: NagaModuleIR = {
  types: [...STANDARD_TYPES],
  constants: [],
  global_variables: [...STANDARD_GLOBALS],
  functions: [
    {
      name: 'compute_main',
      arguments: [GID_ARG],
      expressions: [
        // 0: argument(0) → global_id : vec3<u32>
        { kind: 'argument', argument: 0 },
        // 1: access_index(0, 0) → global_id.x : u32
        { kind: 'access_index', base: 0, index: 0 },
        // 2: load_symbolic arena_in[lane] → f32
        { kind: 'load_symbolic', resourceId: 'arena:slot:0', lane: 1, component: 1 },
      ],
      statements: [
        // 0: store_symbolic arena_out[lane] = expr[2]
        { kind: 'store_symbolic', resourceId: 'arena:slot:0', lane: 1, component: 1, value: 2 },
      ],
      body: [0],
    },
  ],
  entry_points: [STANDARD_ENTRY_POINT],
};

// ─── Tier 0b: Time-driven sine ────────────────────────────────────────────────
// arena_out[lane] = sin(time_seconds + f32(lane) * 0.1)

const TIER_0B_SINE: NagaModuleIR = {
  types: [...STANDARD_TYPES],
  constants: [
    { type: 0, value: 0.1 },
  ],
  global_variables: [...STANDARD_GLOBALS],
  functions: [
    {
      name: 'compute_main',
      arguments: [GID_ARG],
      expressions: [
        // 0: argument(0) → global_id
        { kind: 'argument', argument: 0 },
        // 1: global_id.x → u32
        { kind: 'access_index', base: 0, index: 0 },
        // 2: f32(global_id.x)
        { kind: 'as', to: 'f32', expr: 1 },
        // 3: constant 0.1
        { kind: 'constant', constant: 0 },
        // 4: f32(lane) * 0.1
        { kind: 'binary', op: 'mul', left: 2, right: 3 },
        // 5: load uniforms.time_seconds
        { kind: 'load_uniform', resourceId: 'uniforms:time_seconds', index: 2 },
        // 6: time_seconds + (lane * 0.1)
        { kind: 'binary', op: 'add', left: 5, right: 4 },
        // 7: sin(...)
        { kind: 'call', function: 'sin', args: [6] },
      ],
      statements: [
        { kind: 'store_symbolic', resourceId: 'arena:slot:0', lane: 1, component: 1, value: 7 },
      ],
      body: [0],
    },
  ],
  entry_points: [STANDARD_ENTRY_POINT],
};

// ─── Tier 0c: Two-module chain ────────────────────────────────────────────────
// Module B: arena_out[lane] = arena_in[lane] * 2.0

const TIER_0C_PASS_B: NagaModuleIR = {
  types: [...STANDARD_TYPES],
  constants: [
    { type: 0, value: 2.0 },
  ],
  global_variables: [...STANDARD_GLOBALS],
  functions: [
    {
      name: 'compute_main',
      arguments: [GID_ARG],
      expressions: [
        // 0: argument(0)
        { kind: 'argument', argument: 0 },
        // 1: global_id.x
        { kind: 'access_index', base: 0, index: 0 },
        // 2: arena_in[lane]
        { kind: 'load_symbolic', resourceId: 'arena:slot:0', lane: 1, component: 1 },
        // 3: constant 2.0
        { kind: 'constant', constant: 0 },
        // 4: arena_in[lane] * 2.0
        { kind: 'binary', op: 'mul', left: 2, right: 3 },
      ],
      statements: [
        { kind: 'store_symbolic', resourceId: 'arena:slot:0', lane: 1, component: 1, value: 4 },
      ],
      body: [0],
    },
  ],
  entry_points: [STANDARD_ENTRY_POINT],
};

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'tier-0-identity',
    name: 'Tier 0: Identity Copy',
    description: 'Copies arena_in[lane] to arena_out[lane]. Simplest valid module.',
    module: TIER_0_IDENTITY,
    manifest: SINGLE_SLOT_MANIFEST,
  },
  {
    id: 'tier-0b-sine',
    name: 'Tier 0b: Time-Driven Sine',
    description: 'Writes sin(time + lane * 0.1) to arena. Validates uniform reads + math.',
    module: TIER_0B_SINE,
    manifest: SINGLE_SLOT_MANIFEST,
  },
  {
    id: 'tier-0c-two-pass',
    name: 'Tier 0c: Two-Pass Chain',
    description: 'Module A writes sine, Module B doubles it. Validates multi-pass ping-pong.',
    module: TIER_0C_PASS_B,
    manifest: SINGLE_SLOT_MANIFEST,
  },
];

/** For the two-pass fixture, module A is the sine generator. */
export const TIER_0C_MODULE_A = TIER_0B_SINE;
export const TIER_0C_MODULE_B = TIER_0C_PASS_B;
