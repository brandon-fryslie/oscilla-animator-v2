import type {
  InstallPipelineBoundaryPayloadV1,
  MemoryManifestIR,
  PublishFrameInputBoundaryPayloadV1,
} from '../boundary-contract';

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly install: InstallPipelineBoundaryPayloadV1;
  readonly frame: PublishFrameInputBoundaryPayloadV1;
}

function float32ToUint32Bits(value: number): number {
  const floatWords = new Float32Array(1);
  const uintWords = new Uint32Array(floatWords.buffer);
  floatWords[0] = value;
  return uintWords[0] >>> 0;
}

const TRIANGLE_MEMORY_MANIFEST = {
  resources: [
    { id: 'arena:slot:1', type: 'vec2', cardinality: 1, packing: 'soa', updateClass: '' },
    { id: 'arena:slot:2', type: 'vec4', cardinality: 1, packing: 'soa', updateClass: '' },
    { id: 'arena:slot:3', type: 'f32', cardinality: 1, packing: 'soa', updateClass: '' },
    { id: 'arena:slot:4', type: 'shape', cardinality: 1, packing: 'soa', updateClass: '' },
    { id: 'arena:slot:10', type: 'vec2', cardinality: 3, packing: 'soa', updateClass: '' },
  ],
} as unknown as MemoryManifestIR;

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

function createSinkTableWords(staticInstanceCount: number, materialId: number): number[] {
  return [
    1, // version
    1, // totalRecordCount
    0, // indexedRecordCount
    1, // nonIndexedRecordCount
    0, // indexedRegionBaseWords
    0, // nonIndexedRegionBaseWords
    5, // indexedStrideWords
    4, // nonIndexedStrideWords
    // record[0]
    1, // drawMode: nonIndexed
    0, // count (GPU draw-prep writes)
    0, // instanceCount (GPU draw-prep writes)
    0, // first (GPU draw-prep writes)
    0, // baseVertex (GPU draw-prep writes)
    0, // firstInstance (GPU draw-prep writes)
    0, // shapeWordOffset (unused in record, descriptor owns canonical value)
    materialId, // materialId
    // descriptor[0] (26 words)
    0, // position base (worker-resolved)
    0, // position lane stride (worker-resolved)
    0, // position component stride (worker-resolved)
    0, // color base (worker-resolved)
    0, // color lane stride (worker-resolved)
    0, // color component stride (worker-resolved)
    0, // scale base (worker-resolved)
    0, // scale lane stride (worker-resolved)
    0, // scale component stride (worker-resolved)
    0, // rotation mode (constant)
    0, // rotation base
    0, // rotation lane stride
    0, // rotation component stride
    float32ToUint32Bits(0.0), // rotation default
    0, // scale2 mode (constant)
    0, // scale2 base
    0, // scale2 lane stride
    0, // scale2 component stride
    float32ToUint32Bits(1.0), // scale2 default x
    float32ToUint32Bits(1.0), // scale2 default y
    0, // shape slot base (worker-resolved)
    0, // shape slot lane stride (worker-resolved)
    0, // shape slot component stride (worker-resolved)
    0, // instanceCountMode: static
    staticInstanceCount, // staticInstanceCount
    0, // shapeWordOffset -> first shape record
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
  const sinkTableWords = createSinkTableWords(staticInstanceCount, materialClass);
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
      ...frame,
    },
  };
}

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
`.trim();

const TRIANGLE_PULSE_WGSL = `
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

const TRIANGLE_MOUSE_TRACK_WGSL = `
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

  let view_w = max(uniforms.viewport_width, 1.0);
  let view_h = max(uniforms.viewport_height, 1.0);
  let mouse_x = (uniforms.mouse_x / view_w - 0.5) * 1.4;
  let mouse_y = (0.5 - uniforms.mouse_y / view_h) * 1.4;
  let pressed = select(0.0, 1.0, uniforms.mouse_buttons != 0u);

  arena_out[0u] = mouse_x;
  arena_out[1u] = mouse_y;

  arena_out[4u] = 0.05;
  arena_out[5u] = 0.18;
  arena_out[6u] = 0.72;
  arena_out[7u] = 1.0;

  arena_out[8u] = 0.70 + pressed * 0.35;
  arena_out[9u] = 0.0;

  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

const TRIANGLE_ORBIT_WGSL = `
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

const TRIANGLE_TWO_PASS_GEOMETRY_WGSL = `
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
fn compute_geometry(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) {
    return;
  }

  arena_out[0u] = 0.0;
  arena_out[1u] = 0.0;
  arena_out[8u] = 0.95;
  arena_out[9u] = 0.0;

  arena_out[10u] = 0.20;
  arena_out[13u] = 0.20;
  arena_out[11u] = 0.80;
  arena_out[14u] = 0.20;
  arena_out[12u] = 0.50;
  arena_out[15u] = 0.80;
}
`.trim();

const TRIANGLE_TWO_PASS_COLOR_WGSL = `
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
fn compute_color(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let lane = global_id.x;
  if (lane != 0u) {
    return;
  }

  let wobble = 0.5 + 0.5 * sin(uniforms.time_seconds * 1.4);
  arena_out[4u] = 0.04 + 0.02 * wobble;
  arena_out[5u] = 0.20;
  arena_out[6u] = 0.55 + 0.30 * wobble;
  arena_out[7u] = 1.0;
}
`.trim();

const TRIANGLE_INSTALL = createTriangleInstall([
  {
    passId: 'triangle_writer',
    entryPoint: 'compute_main',
    wgsl: TRIANGLE_RENDER_WGSL,
  },
]);

const TRIANGLE_PULSE_INSTALL = createTriangleInstall([
  {
    passId: 'triangle_pulse_writer',
    entryPoint: 'compute_main',
    wgsl: TRIANGLE_PULSE_WGSL,
  },
], { materialClass: 1 });

const TRIANGLE_MOUSE_TRACK_INSTALL = createTriangleInstall([
  {
    passId: 'triangle_mouse_track_writer',
    entryPoint: 'compute_main',
    wgsl: TRIANGLE_MOUSE_TRACK_WGSL,
  },
], { materialClass: 2 });

const TRIANGLE_ORBIT_INSTALL = createTriangleInstall([
  {
    passId: 'triangle_orbit_writer',
    entryPoint: 'compute_main',
    wgsl: TRIANGLE_ORBIT_WGSL,
  },
], { materialClass: 3 });

const TRIANGLE_TWO_PASS_INSTALL = createTriangleInstall([
  {
    passId: 'triangle_geometry_writer',
    entryPoint: 'compute_geometry',
    wgsl: TRIANGLE_TWO_PASS_GEOMETRY_WGSL,
  },
  {
    passId: 'triangle_color_writer',
    entryPoint: 'compute_color',
    wgsl: TRIANGLE_TWO_PASS_COLOR_WGSL,
  },
], { materialClass: 4 });

const DEFAULT_FRAME = createFramePayload();
const ZOOMED_FRAME = createFramePayload({
  zoom: 1.2,
  panX: 0.08,
  panY: -0.06,
});
const MOUSE_TOP_RIGHT_FRAME = createFramePayload({
  inputMouseX: 760,
  inputMouseY: 120,
  inputMouseButtons: 1,
});

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  {
    id: 'visible-triangle-v1',
    name: 'Visible Triangle',
    description: 'Canonical INSTALL_PIPELINE_V1 + PUBLISH_FRAME_INPUT_V1 payloads that render one triangle.',
    install: TRIANGLE_INSTALL,
    frame: DEFAULT_FRAME,
  },
  {
    id: 'pulse-scale-triangle-v1',
    name: 'Pulse Scale Triangle',
    description: 'Uses frame time to animate triangle scale and verify per-frame input publication.',
    install: TRIANGLE_PULSE_INSTALL,
    frame: DEFAULT_FRAME,
  },
  {
    id: 'mouse-track-triangle-v1',
    name: 'Mouse Track Triangle',
    description: 'Maps frame mouse coordinates/buttons into triangle position and scale.',
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
    description: 'Runs geometry and color in separate compute passes to exercise multi-pass install payloads.',
    install: TRIANGLE_TWO_PASS_INSTALL,
    frame: DEFAULT_FRAME,
  },
];
