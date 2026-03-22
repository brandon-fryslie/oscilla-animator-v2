// [LAW:one-source-of-truth] Canonical default WGSL payloads are centralized
// in one module so engine boot/rebuild callsites cannot drift by copy.
pub const DEFAULT_SIMULATION_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_read: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_write: array<u32>;
@group(0) @binding(2) var<storage, read> state_read: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_write: array<u32>;
@group(0) @binding(4) var<uniform> frame_header_transport: array<vec4<f32>, 5>;

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&state_write)) {
    return;
  }
  let base = state_read[index] + arena_read[index];
  let dt_bits = bitcast<u32>(frame_header_transport[4].y);
  state_write[index] = base + dt_bits + 1u;
  arena_write[index] = state_write[index];
}
"#;

pub const DEFAULT_ASSEMBLY_WGSL: &str = r#"
@group(0) @binding(0) var<uniform> frame_header_transport: array<vec4<f32>, 5>;
@group(1) @binding(0) var<storage, read> arena_words: array<u32>;
@group(2) @binding(0) var<storage, read_write> instance_words: array<f32>;
@group(2) @binding(1) var<storage, read> sink_table_words: array<u32>;

const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 8u;
const SINK_TABLE_DESCRIPTOR_WORDS: u32 = 26u;

const DESCRIPTOR_WORD_POSITION_BASE_OFFSET: u32 = 0u;
const DESCRIPTOR_WORD_POSITION_LANE_STRIDE: u32 = 1u;
const DESCRIPTOR_WORD_POSITION_COMPONENT_STRIDE: u32 = 2u;
const DESCRIPTOR_WORD_COLOR_BASE_OFFSET: u32 = 3u;
const DESCRIPTOR_WORD_COLOR_LANE_STRIDE: u32 = 4u;
const DESCRIPTOR_WORD_COLOR_COMPONENT_STRIDE: u32 = 5u;
const DESCRIPTOR_WORD_SCALE_BASE_OFFSET: u32 = 6u;
const DESCRIPTOR_WORD_SCALE_LANE_STRIDE: u32 = 7u;
const DESCRIPTOR_WORD_SCALE_COMPONENT_STRIDE: u32 = 8u;
const DESCRIPTOR_WORD_ROTATION_MODE: u32 = 9u;
const DESCRIPTOR_WORD_ROTATION_BASE_OFFSET: u32 = 10u;
const DESCRIPTOR_WORD_ROTATION_LANE_STRIDE: u32 = 11u;
const DESCRIPTOR_WORD_ROTATION_COMPONENT_STRIDE: u32 = 12u;
const DESCRIPTOR_WORD_ROTATION_DEFAULT_BITS: u32 = 13u;
const DESCRIPTOR_WORD_SCALE2_MODE: u32 = 14u;
const DESCRIPTOR_WORD_SCALE2_BASE_OFFSET: u32 = 15u;
const DESCRIPTOR_WORD_SCALE2_LANE_STRIDE: u32 = 16u;
const DESCRIPTOR_WORD_SCALE2_COMPONENT_STRIDE: u32 = 17u;
const DESCRIPTOR_WORD_SCALE2_DEFAULT_X_BITS: u32 = 18u;
const DESCRIPTOR_WORD_SCALE2_DEFAULT_Y_BITS: u32 = 19u;
// [RECOVER-06] Instance-count and shape-word-offset metadata
const DESCRIPTOR_WORD_INSTANCE_COUNT_MODE: u32 = 23u;
const DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT: u32 = 24u;
const DESCRIPTOR_WORD_SHAPE_WORD_OFFSET: u32 = 25u;
const INSTANCE_COUNT_MODE_STATIC: u32 = 0u;

const OPTIONAL_MODE_CONSTANT: u32 = 0u;
const OPTIONAL_MODE_SLOT: u32 = 1u;

fn read_sink_word(index: u32) -> u32 {
  if (index >= arrayLength(&sink_table_words)) {
    return 0u;
  }
  return sink_table_words[index];
}

fn read_arena_f32(
  base_offset: u32,
  lane_stride: u32,
  component_stride: u32,
  lane: u32,
  component: u32,
  default_value: f32,
) -> f32 {
  let index = base_offset + lane * lane_stride + component * component_stride;
  if (index >= arrayLength(&arena_words)) {
    return default_value;
  }
  let raw = bitcast<f32>(arena_words[index]);
  return select(default_value, raw, raw == raw);
}

fn read_sink_f32(index: u32, default_value: f32) -> f32 {
  if (index >= arrayLength(&sink_table_words)) {
    return default_value;
  }
  let raw = bitcast<f32>(sink_table_words[index]);
  return select(default_value, raw, raw == raw);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let max_instance_words = arrayLength(&instance_words);
  let max_instances = max_instance_words / 12u;
  if (gid.x >= max_instances) {
    return;
  }

  let base = gid.x * 12u;
  var pos_x = 0.0;
  var pos_y = 0.0;
  var scale = 1.0;
  var rotation = 0.0;
  var scale2_x = 1.0;
  var scale2_y = 1.0;
  var shape_word_offset = 0u;
  var color_r = 1.0;
  var color_g = 1.0;
  var color_b = 1.0;
  var color_a = 1.0;

  let sink_table_word_count = arrayLength(&sink_table_words);
  if (sink_table_word_count >= SINK_TABLE_HEADER_WORDS) {
    let sink_count = read_sink_word(1u);
    let records_base = SINK_TABLE_HEADER_WORDS;
    let descriptors_base = records_base + sink_count * SINK_TABLE_RECORD_WORDS;
    // [RECOVER-06] Derive instanceCount and firstInstance from descriptors
    // instead of reading zeroed record fields. Running prefix sum of
    // instance counts determines the instance-to-sink mapping.
    var sink_index = 0u;
    var sink_found = false;
    var sink_lane = 0u;
    var running_first_instance = 0u;

    loop {
      if (sink_index >= sink_count) {
        break;
      }
      let desc_base = descriptors_base + sink_index * SINK_TABLE_DESCRIPTOR_WORDS;
      let ic_mode = read_sink_word(desc_base + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE);
      let instance_count = select(0u, read_sink_word(desc_base + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT), ic_mode == INSTANCE_COUNT_MODE_STATIC);
      let instance_end = running_first_instance + instance_count;
      if (gid.x >= running_first_instance && gid.x < instance_end) {
        sink_lane = gid.x - running_first_instance;
        sink_found = true;
        break;
      }
      running_first_instance = instance_end;
      sink_index = sink_index + 1u;
    }

    if (sink_found) {
      let descriptor_base = descriptors_base + sink_index * SINK_TABLE_DESCRIPTOR_WORDS;
      let position_base_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_POSITION_BASE_OFFSET);
      let position_lane_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_POSITION_LANE_STRIDE);
      let position_component_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_POSITION_COMPONENT_STRIDE);
      let color_base_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_COLOR_BASE_OFFSET);
      let color_lane_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_COLOR_LANE_STRIDE);
      let color_component_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_COLOR_COMPONENT_STRIDE);
      let scale_base_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE_BASE_OFFSET);
      let scale_lane_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE_LANE_STRIDE);
      let scale_component_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE_COMPONENT_STRIDE);

      pos_x = read_arena_f32(
        position_base_offset,
        position_lane_stride,
        position_component_stride,
        sink_lane,
        0u,
        0.0,
      );
      pos_y = read_arena_f32(
        position_base_offset,
        position_lane_stride,
        position_component_stride,
        sink_lane,
        1u,
        0.0,
      );
      color_r = read_arena_f32(
        color_base_offset,
        color_lane_stride,
        color_component_stride,
        sink_lane,
        0u,
        1.0,
      );
      color_g = read_arena_f32(
        color_base_offset,
        color_lane_stride,
        color_component_stride,
        sink_lane,
        1u,
        1.0,
      );
      color_b = read_arena_f32(
        color_base_offset,
        color_lane_stride,
        color_component_stride,
        sink_lane,
        2u,
        1.0,
      );
      color_a = read_arena_f32(
        color_base_offset,
        color_lane_stride,
        color_component_stride,
        sink_lane,
        3u,
        1.0,
      );
      scale = read_arena_f32(
        scale_base_offset,
        scale_lane_stride,
        scale_component_stride,
        sink_lane,
        0u,
        1.0,
      );

      let rotation_mode = read_sink_word(descriptor_base + DESCRIPTOR_WORD_ROTATION_MODE);
      let rotation_default = read_sink_f32(descriptor_base + DESCRIPTOR_WORD_ROTATION_DEFAULT_BITS, 0.0);
      let rotation_base_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_ROTATION_BASE_OFFSET);
      let rotation_lane_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_ROTATION_LANE_STRIDE);
      let rotation_component_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_ROTATION_COMPONENT_STRIDE);
      let rotation_from_slot = read_arena_f32(
        rotation_base_offset,
        rotation_lane_stride,
        rotation_component_stride,
        sink_lane,
        0u,
        rotation_default,
      );
      rotation = select(rotation_default, rotation_from_slot, rotation_mode == OPTIONAL_MODE_SLOT);

      let scale2_mode = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE2_MODE);
      let scale2_default_x = read_sink_f32(descriptor_base + DESCRIPTOR_WORD_SCALE2_DEFAULT_X_BITS, 1.0);
      let scale2_default_y = read_sink_f32(descriptor_base + DESCRIPTOR_WORD_SCALE2_DEFAULT_Y_BITS, 1.0);
      let scale2_base_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE2_BASE_OFFSET);
      let scale2_lane_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE2_LANE_STRIDE);
      let scale2_component_stride = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SCALE2_COMPONENT_STRIDE);
      let scale2_x_from_slot = read_arena_f32(
        scale2_base_offset,
        scale2_lane_stride,
        scale2_component_stride,
        sink_lane,
        0u,
        scale2_default_x,
      );
      let scale2_y_from_slot = read_arena_f32(
        scale2_base_offset,
        scale2_lane_stride,
        scale2_component_stride,
        sink_lane,
        1u,
        scale2_default_y,
      );
      scale2_x = select(scale2_default_x, scale2_x_from_slot, scale2_mode == OPTIONAL_MODE_SLOT);
      scale2_y = select(scale2_default_y, scale2_y_from_slot, scale2_mode == OPTIONAL_MODE_SLOT);
      // [RECOVER-06] Shape word offset from descriptor (resolved at pack time)
      shape_word_offset = read_sink_word(descriptor_base + DESCRIPTOR_WORD_SHAPE_WORD_OFFSET);
    }
  }

  instance_words[base + 0u] = pos_x;
  instance_words[base + 1u] = pos_y;
  instance_words[base + 2u] = scale;
  instance_words[base + 3u] = rotation;
  instance_words[base + 4u] = scale2_x;
  instance_words[base + 5u] = scale2_y;
  instance_words[base + 6u] = bitcast<f32>(shape_word_offset);
  instance_words[base + 7u] = 0.0;
  instance_words[base + 8u] = color_r;
  instance_words[base + 9u] = color_g;
  instance_words[base + 10u] = color_b;
  instance_words[base + 11u] = color_a;
}
"#;

// [RECOVER-04] Vertex-pulling uber shader. Reads control-point positions
// directly from topologyBank (canonical ShapeBank data) instead of a
// CPU-realized vertex buffer. Triangle fan geometry is generated
// algorithmically from @builtin(vertex_index).
// [RECOVER-11] Extended with Type5 text/glyph dispatch: unit-quad vertices
// with per-glyph UV from ShapeBank, MSDF fragment evaluation from atlas.
pub const DEFAULT_UBER_SHADER_WGSL: &str = r#"
// [LAW:one-source-of-truth] FrameHeader mirrors the Rust FrameHeader struct.
// The uniform binding is derived transport; the canonical source is the arena
// header zone (offset 0..ARENA_HEADER_FLOATS of the compiler arena buffer).
struct FrameHeader {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
};

struct InstanceData {
  transform0: vec4<f32>,
  transform1: vec4<f32>,
  color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame_header: FrameHeader;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(2) @binding(0) var<storage, read> topologyBank: array<u32>;
// [RECOVER-11] Atlas data storage buffer for Type5 text MSDF evaluation.
@group(2) @binding(1) var<storage, read> atlasData: array<u32>;
// [RECOVER-07] Compiler arena buffer for vertex-stage control-point reads.
@group(3) @binding(0) var<storage, read> arenaWords: array<u32>;

// ShapeBankHeaderWord offsets (must match TypeScript ShapeBankHeaderWord enum)
const SHAPE_WORD_KIND: u32 = 0u;
const SHAPE_WORD_FLAGS: u32 = 2u;
// [RECOVER-07] CP arena addressing stored in header words 11, 14, 15.
const SHAPE_WORD_CP_ARENA_BASE_OFFSET: u32 = 11u;
const SHAPE_WORD_CP_ARENA_LANE_STRIDE: u32 = 14u;
const SHAPE_WORD_CP_ARENA_COMPONENT_STRIDE: u32 = 15u;
const SHAPE_FLAG_CLOSED: u32 = 1u;

// [RECOVER-11] Type5 ShapeBank header word offsets for glyph UV and atlas data.
const TYPE5_WORD_UV_MIN_X: u32 = 4u;
const TYPE5_WORD_UV_MIN_Y: u32 = 5u;
const TYPE5_WORD_UV_MAX_X: u32 = 6u;
const TYPE5_WORD_UV_MAX_Y: u32 = 7u;
const TYPE5_WORD_QUAD_WIDTH: u32 = 8u;
const TYPE5_WORD_QUAD_HEIGHT: u32 = 9u;
const TYPE5_WORD_ATLAS_WIDTH: u32 = 10u;
const TYPE5_WORD_ATLAS_HEIGHT: u32 = 11u;
const TYPE5_WORD_DISTANCE_RANGE: u32 = 12u;

// [LAW:one-type-per-behavior] ShapeClass discriminant values.
const SHAPE_CLASS_TYPE1_RIGID: u32 = 1u;
const SHAPE_CLASS_TYPE2_PARAMETRIC: u32 = 2u;
const SHAPE_CLASS_TYPE5_TEXT: u32 = 5u;

// Type2 Parametric ShapeBank header word offsets (must match parametric-templates.ts ABI).
const SHAPE_WORD_TOPOLOGY_TYPE: u32 = 1u;
const SHAPE_WORD_FIRST_VERTEX: u32 = 8u;
const SHAPE_WORD_PARAM_STRIDE: u32 = 9u;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  // [RECOVER-11] UV coordinates for Type5 MSDF glyph evaluation.
  @location(1) uv: vec2<f32>,
  // [RECOVER-11] Shape class discriminant for fragment shader dispatch.
  @location(2) @interpolate(flat) shape_class: u32,
};

fn oklch_to_linear_srgb(h: f32, c: f32, l: f32) -> vec3<f32> {
  let hue = fract(h) * 6.283185307179586;
  let a = c * cos(hue);
  let b = c * sin(hue);

  let l_prime = l + 0.3963377774 * a + 0.2158037573 * b;
  let m_prime = l - 0.1055613458 * a - 0.0638541728 * b;
  let s_prime = l - 0.0894841775 * a - 1.2914855480 * b;

  let l3 = l_prime * l_prime * l_prime;
  let m3 = m_prime * m_prime * m_prime;
  let s3 = s_prime * s_prime * s_prime;

  let x = 1.2270138511035211 * l3 - 0.5577999806518222 * m3 + 0.2812561489664678 * s3;
  let y = -0.0405801784232806 * l3 + 1.11225686961683 * m3 - 0.0716766786656012 * s3;
  let z = -0.0763812845057069 * l3 - 0.4214819784180127 * m3 + 1.5861632204407947 * s3;

  return vec3<f32>(
    3.240969941904521 * x - 1.537383177570093 * y - 0.498610760293 * z,
    -0.96924363628087 * x + 1.87596750150772 * y + 0.041555057407175 * z,
    0.055630079696993 * x - 0.20397695888897 * y + 1.056971514242878 * z
  );
}

fn safe_color_from_instance(inst: InstanceData) -> vec4<f32> {
  let rawH = inst.color.x;
  let rawC = inst.color.y;
  let rawL = inst.color.z;
  let rawA = inst.color.w;
  let safeH = select(0.0, rawH, rawH == rawH);
  let safeC = max(0.0, select(0.0, rawC, rawC == rawC));
  let safeL = clamp(select(0.0, rawL, rawL == rawL), 0.0, 1.0);
  let safeA = clamp(select(1.0, rawA, rawA == rawA), 0.0, 1.0);
  let safeRgb = clamp(oklch_to_linear_srgb(safeH, safeC, safeL), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(safeRgb, safeA);
}

// [LAW:one-source-of-truth] Canonical hardened Bezier evaluation for all
// ParametricTemplates families (ribbon, closed-loop). Central-difference
// fallback replaces the old epsilon-skew tangent hack.
// Returns vec3<f32>(pos.x, pos.y, tangent_angle).
fn get_hardened_bezier_data(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t: f32) -> vec3<f32> {
    let u = 1.0 - t;
    let u2 = u * u;
    let t2 = t * t;

    let pos = (u2*u)*p0 + (3.0*u2*t)*p1 + (3.0*u*t2)*p2 + (t2*t)*p3;
    let analytical_tan = (3.0*u2)*(p1 - p0) + (6.0*u*t)*(p2 - p1) + (3.0*t2)*(p3 - p2);
    let tan_len = length(analytical_tan);

    var final_tangent: vec2<f32>;

    if (tan_len > 1e-5) {
        final_tangent = analytical_tan / tan_len;
    } else {
        // Fallback: Central Difference
        let t_a = clamp(t + 0.001, 0.0, 1.0);
        let t_b = clamp(t - 0.001, 0.0, 1.0);

        let u_a = 1.0 - t_a;
        let pos_a = (u_a*u_a*u_a)*p0 + (3.0*u_a*u_a*t_a)*p1 + (3.0*u_a*t_a*t_a)*p2 + (t_a*t_a*t_a)*p3;

        let u_b = 1.0 - t_b;
        let pos_b = (u_b*u_b*u_b)*p0 + (3.0*u_b*u_b*t_b)*p1 + (3.0*u_b*t_b*t_b)*p2 + (t_b*t_b*t_b)*p3;

        let secant = pos_a - pos_b;
        let secant_len = length(secant);

        if (secant_len > 1e-5) {
            final_tangent = secant / secant_len;
        } else {
            final_tangent = vec2<f32>(1.0, 0.0); // Absolute collapse guard
        }
    }

    return vec3<f32>(pos.x, pos.y, atan2(final_tangent.y, final_tangent.x));
}

// [LAW:one-source-of-truth] Ribbon half-width constant (local-space units).
// Ribbon quads are expanded ± this distance along the surface normal.
const RIBBON_HALF_WIDTH: f32 = 0.005;

// TopologyType discriminant values (must match TypeScript TopologyType enum).
const TOPOLOGY_TYPE_NON_INDEXED: u32 = 0u;
const TOPOLOGY_TYPE_INDEXED: u32 = 1u;

// Type2 Parametric vertex shader: reads template t-values from topologyBank
// and control-point data from arenaWords, evaluates cubic Bezier via the
// shared get_hardened_bezier_data function.
// [LAW:one-source-of-truth] instanceIndex selects the per-instance lane for
// control-point reads. Without it every instance reads Lane 0.
fn vs_type2(
  inst: InstanceData,
  topologyWordOffset: u32,
  vertexIndex: u32,
  instanceIndex: u32,
) -> VertexOutput {
  // Read CP arena addressing from header.
  let cpArenaBase = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_BASE_OFFSET];
  let cpArenaLaneStride = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_LANE_STRIDE];
  let cpArenaComponentStride = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_COMPONENT_STRIDE];

  // Per-instance lane offset into the arena for control-point data.
  // [LAW:one-source-of-truth] Each instance has its OWN control points at:
  //   arenaWords[cpArenaBase + instanceIndex * cpArenaLaneStride + component * cpArenaComponentStride]
  let laneBase = cpArenaBase + instanceIndex * cpArenaLaneStride;

  // Read topology type (ribbon vs closed-blob) from header.
  let topologyType = topologyBank[topologyWordOffset + SHAPE_WORD_TOPOLOGY_TYPE];

  // Read relative firstVertex offset from header (word offset where t-values begin).
  let firstVertex = topologyBank[topologyWordOffset + SHAPE_WORD_FIRST_VERTEX];

  // Read cubic Bezier control points (p0..p3) from arena, per-instance.
  // ParamStride layout: [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y] per lane.
  let p0 = vec2<f32>(
    bitcast<f32>(arenaWords[laneBase + 0u * cpArenaComponentStride]),
    bitcast<f32>(arenaWords[laneBase + 1u * cpArenaComponentStride]),
  );
  let p1 = vec2<f32>(
    bitcast<f32>(arenaWords[laneBase + 2u * cpArenaComponentStride]),
    bitcast<f32>(arenaWords[laneBase + 3u * cpArenaComponentStride]),
  );
  let p2 = vec2<f32>(
    bitcast<f32>(arenaWords[laneBase + 4u * cpArenaComponentStride]),
    bitcast<f32>(arenaWords[laneBase + 5u * cpArenaComponentStride]),
  );
  let p3 = vec2<f32>(
    bitcast<f32>(arenaWords[laneBase + 6u * cpArenaComponentStride]),
    bitcast<f32>(arenaWords[laneBase + 7u * cpArenaComponentStride]),
  );

  // --- Ribbon path (NonIndexed): 6 vertices per segment, quad expansion ---
  // Lookup tables for the 6 vertices of each quad (two triangles: 0-2-1, 1-2-3).
  // t_offset_lut: which segment endpoint (0 = start, 1 = end).
  // side_lut: which side of the ribbon normal (-1 = left, +1 = right).
  let t_offset_lut = array<u32, 6>(0u, 0u, 1u, 1u, 0u, 1u);
  let side_lut = array<f32, 6>(-1.0, 1.0, -1.0, 1.0, 1.0, -1.0);

  // --- Indexed path (ClosedBlob): centroid + perimeter fan ---
  // [LAW:dataflow-not-control-flow] Both ribbon and blob data are computed;
  // topologyType selects which result to use.
  let isRibbon = topologyType == TOPOLOGY_TYPE_NON_INDEXED;

  // Ribbon: derive segment and local vertex from vertexIndex.
  // For non-indexed draws, vertexIndex = absoluteFirstVertex + localDrawVertex.
  let absoluteFirstVertex = topologyWordOffset + firstVertex;
  let localDrawVertex = vertexIndex - absoluteFirstVertex;
  let seg = localDrawVertex / 6u;
  let vi = localDrawVertex % 6u;
  let ribbonTIndex = seg + t_offset_lut[vi];
  let ribbonTBits = topologyBank[absoluteFirstVertex + ribbonTIndex];
  let ribbonT = clamp(bitcast<f32>(ribbonTBits), 0.0, 1.0);
  let ribbonBezier = get_hardened_bezier_data(p0, p1, p2, p3, ribbonT);
  // Normal from tangent_angle: rotate tangent 90° CCW.
  let tangentAngle = ribbonBezier.z;
  let normalX = -sin(tangentAngle);
  let normalY = cos(tangentAngle);
  let ribbonLocalX = ribbonBezier.x + normalX * RIBBON_HALF_WIDTH * side_lut[vi];
  let ribbonLocalY = ribbonBezier.y + normalY * RIBBON_HALF_WIDTH * side_lut[vi];

  // Blob: read t-value directly (indexed draw, vertexIndex = baseVertex + local_index).
  let blobTBits = topologyBank[topologyWordOffset + firstVertex + vertexIndex];
  let blobT = bitcast<f32>(blobTBits);
  let isCentroid = blobT < -0.5;
  let safeBlobT = clamp(blobT, 0.0, 1.0);
  let blobBezier = get_hardened_bezier_data(p0, p1, p2, p3, safeBlobT);
  let centroid = (p0 + p1 + p2 + p3) * 0.25;
  let blobLocalX = select(blobBezier.x, centroid.x, isCentroid);
  let blobLocalY = select(blobBezier.y, centroid.y, isCentroid);

  // [LAW:dataflow-not-control-flow] Select result based on topology type.
  let localX = select(blobLocalX, ribbonLocalX, isRibbon);
  let localY = select(blobLocalY, ribbonLocalY, isRibbon);

  // Instance transform (same as Type1Rigid).
  let rawCenterX = inst.transform0.x;
  let rawCenterY = inst.transform0.y;
  let centerX = select(0.0, rawCenterX, rawCenterX == rawCenterX);
  let centerY = select(0.0, rawCenterY, rawCenterY == rawCenterY);
  let rawScaleX = inst.transform0.z * inst.transform1.x;
  let rawScaleY = inst.transform0.z * inst.transform1.y;
  let scaleX = clamp(abs(select(1.0, rawScaleX, rawScaleX == rawScaleX)), 0.001, 1024.0);
  let scaleY = clamp(abs(select(1.0, rawScaleY, rawScaleY == rawScaleY)), 0.001, 1024.0);
  let rawRotation = inst.transform0.w;
  let safeRotation = select(0.0, rawRotation, rawRotation == rawRotation);

  let c = cos(safeRotation);
  let s = sin(safeRotation);
  let model = mat4x4<f32>(
    vec4<f32>(c * scaleX, s * scaleX, 0.0, 0.0),
    vec4<f32>(-s * scaleY, c * scaleY, 0.0, 0.0),
    vec4<f32>(0.0, 0.0, 1.0, 0.0),
    vec4<f32>(centerX, centerY, 0.0, 1.0),
  );

  let worldPos = model * vec4<f32>(localX, localY, 0.0, 1.0);

  var out: VertexOutput;
  out.position = frame_header.view_proj * worldPos;
  out.color = safe_color_from_instance(inst);
  out.uv = vec2<f32>(0.0, 0.0);
  out.shape_class = SHAPE_CLASS_TYPE2_PARAMETRIC;
  return out;
}

// [RECOVER-11] Type5 text vertex shader: generates a unit quad (6 vertices)
// and reads per-glyph UV rect and dimensions from the ShapeBank header.
fn vs_type5(
  inst: InstanceData,
  topologyWordOffset: u32,
  vertexIndex: u32,
) -> VertexOutput {
  // Unit quad vertices (two triangles: 0-1-2, 1-3-2)
  let quadX = array<f32, 6>(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  let quadY = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  let vi = vertexIndex % 6u;
  let localX = quadX[vi];
  let localY = quadY[vi];

  // Read glyph quad dimensions from ShapeBank header
  let quadWidth = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_QUAD_WIDTH]);
  let quadHeight = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_QUAD_HEIGHT]);

  // Read UV rect from ShapeBank header
  let uvMinX = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_UV_MIN_X]);
  let uvMinY = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_UV_MIN_Y]);
  let uvMaxX = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_UV_MAX_X]);
  let uvMaxY = bitcast<f32>(topologyBank[topologyWordOffset + TYPE5_WORD_UV_MAX_Y]);

  // Interpolate UV across the quad
  let uv = vec2<f32>(
    mix(uvMinX, uvMaxX, localX),
    mix(uvMinY, uvMaxY, localY),
  );

  // Position: instance center + scaled local quad position
  let rawCenterX = inst.transform0.x;
  let rawCenterY = inst.transform0.y;
  let centerX = select(0.0, rawCenterX, rawCenterX == rawCenterX);
  let centerY = select(0.0, rawCenterY, rawCenterY == rawCenterY);
  let rawScale = inst.transform0.z;
  let scale = clamp(abs(select(1.0, rawScale, rawScale == rawScale)), 0.001, 1024.0);

  let worldX = centerX + localX * quadWidth * scale;
  let worldY = centerY + localY * quadHeight * scale;
  let worldPos = vec4<f32>(worldX, worldY, 0.0, 1.0);

  var out: VertexOutput;
  out.position = frame_header.view_proj * worldPos;
  out.color = safe_color_from_instance(inst);
  out.uv = uv;
  out.shape_class = SHAPE_CLASS_TYPE5_TEXT;
  return out;
}

// [RECOVER-07] Vertex pulling: control-point positions are read from the
// compiler arena buffer (GPU-computed). Arena addressing is stored in the
// topology header (words 11, 14, 15). Triangle fan generated from vertex_index.
@vertex fn vs_main(
  @builtin(instance_index) instanceIndex: u32,
  @builtin(vertex_index) vertexIndex: u32,
) -> VertexOutput {
  let inst = instances[instanceIndex];
  // [RECOVER-04] Assembly shader stores shape_word_offset via bitcast<f32>(u32).
  // Recover the original u32 bit pattern — numeric f32→u32 truncates denorms to 0.
  let topologyWordOffset = bitcast<u32>(inst.transform1.z);

  // [RECOVER-11] Dispatch on ShapeClass from the topology header Kind word.
  let shapeClass = topologyBank[topologyWordOffset + SHAPE_WORD_KIND];
  if (shapeClass == SHAPE_CLASS_TYPE5_TEXT) {
    return vs_type5(inst, topologyWordOffset, vertexIndex);
  }
  if (shapeClass == SHAPE_CLASS_TYPE2_PARAMETRIC) {
    return vs_type2(inst, topologyWordOffset, vertexIndex, instanceIndex);
  }

  // --- Type1Rigid path (existing behavior) ---
  let flags = topologyBank[topologyWordOffset + SHAPE_WORD_FLAGS];
  let isClosed = (flags & SHAPE_FLAG_CLOSED) != 0u;

  // [RECOVER-07] CP arena addressing from topology header reserved words.
  let cpArenaBase = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_BASE_OFFSET];
  let cpArenaLaneStride = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_LANE_STRIDE];
  let cpArenaComponentStride = topologyBank[topologyWordOffset + SHAPE_WORD_CP_ARENA_COMPONENT_STRIDE];

  // [LAW:dataflow-not-control-flow] Both fan and sequential control-point
  // indices are computed; the flags data selects which one is used.
  let tri = vertexIndex / 3u;
  let loc = vertexIndex % 3u;
  let fanCpIndex = select(tri + loc, 0u, loc == 0u);
  let cpIndex = select(vertexIndex, fanCpIndex, isClosed);

  // [RECOVER-07] Read CP positions from compiler arena (GPU-computed data).
  let xAddr = cpArenaBase + cpIndex * cpArenaLaneStride;
  let yAddr = cpArenaBase + cpIndex * cpArenaLaneStride + cpArenaComponentStride;
  let pulledX = bitcast<f32>(arenaWords[xAddr]);
  let pulledY = bitcast<f32>(arenaWords[yAddr]);

  let rawCenterX = inst.transform0.x;
  let rawCenterY = inst.transform0.y;
  let centerX = select(0.0, rawCenterX, rawCenterX == rawCenterX);
  let centerY = select(0.0, rawCenterY, rawCenterY == rawCenterY);
  let rawScaleX = inst.transform0.z * inst.transform1.x;
  let rawScaleY = inst.transform0.z * inst.transform1.y;
  let scaleX = clamp(abs(select(1.0, rawScaleX, rawScaleX == rawScaleX)), 0.001, 1024.0);
  let scaleY = clamp(abs(select(1.0, rawScaleY, rawScaleY == rawScaleY)), 0.001, 1024.0);
  let rawRotation = inst.transform0.w;
  let safeRotation = select(0.0, rawRotation, rawRotation == rawRotation);

  let c = cos(safeRotation);
  let s = sin(safeRotation);
  let model = mat4x4<f32>(
    vec4<f32>(c * scaleX, s * scaleX, 0.0, 0.0),
    vec4<f32>(-s * scaleY, c * scaleY, 0.0, 0.0),
    vec4<f32>(0.0, 0.0, 1.0, 0.0),
    vec4<f32>(centerX, centerY, 0.0, 1.0),
  );

  let worldPos = model * vec4<f32>(pulledX, pulledY, 0.0, 1.0);

  var out: VertexOutput;
  out.position = frame_header.view_proj * worldPos;
  out.color = safe_color_from_instance(inst);
  out.uv = vec2<f32>(0.0, 0.0);
  out.shape_class = SHAPE_CLASS_TYPE1_RIGID;
  return out;
}

// [RECOVER-11] MSDF median function: takes the median of three channels
// to reconstruct the true distance from multi-channel signed distance data.
fn msdf_median(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // [RECOVER-04] Compute UV derivatives unconditionally in uniform control flow.
  // dpdx/dpdy are illegal inside non-uniform branches (shape_class is @interpolate(flat),
  // so Chrome/Tint's uniformity analysis rejects derivatives guarded by it).
  let uv_dpdx = dpdx(input.uv.x);
  let uv_dpdy = dpdy(input.uv.y);

  // [RECOVER-11] Dispatch on shape class for fragment evaluation.
  if (input.shape_class == SHAPE_CLASS_TYPE5_TEXT) {
    // MSDF text fragment evaluation.
    // Sample atlas data at the interpolated UV coordinates.
    let atlasLen = arrayLength(&atlasData);
    if (atlasLen == 0u) {
      discard;
    }
    // Read atlas dimensions from the first two words of atlasData.
    // Layout: [0]=width, [1]=height, [2..]=RGBA pixel data packed as u32.
    let atlasWidth = atlasData[0u];
    let atlasHeight = atlasData[1u];
    let atlasWidthF = f32(atlasWidth);
    let atlasHeightF = f32(atlasHeight);

    // Compute texel coordinates from UV
    let texX = clamp(input.uv.x * atlasWidthF, 0.0, atlasWidthF - 1.0);
    let texY = clamp(input.uv.y * atlasHeightF, 0.0, atlasHeightF - 1.0);

    // Bilinear interpolation: sample 4 nearest texels
    let x0 = u32(floor(texX));
    let y0 = u32(floor(texY));
    let x1 = min(x0 + 1u, atlasWidth - 1u);
    let y1 = min(y0 + 1u, atlasHeight - 1u);
    let fx = fract(texX);
    let fy = fract(texY);

    // Read RGBA from packed u32 (each pixel = 1 u32: R|G|B|A bytes)
    let p00_raw = atlasData[2u + y0 * atlasWidth + x0];
    let p10_raw = atlasData[2u + y0 * atlasWidth + x1];
    let p01_raw = atlasData[2u + y1 * atlasWidth + x0];
    let p11_raw = atlasData[2u + y1 * atlasWidth + x1];

    let p00 = vec3<f32>(f32(p00_raw & 0xFFu), f32((p00_raw >> 8u) & 0xFFu), f32((p00_raw >> 16u) & 0xFFu)) / 255.0;
    let p10 = vec3<f32>(f32(p10_raw & 0xFFu), f32((p10_raw >> 8u) & 0xFFu), f32((p10_raw >> 16u) & 0xFFu)) / 255.0;
    let p01 = vec3<f32>(f32(p01_raw & 0xFFu), f32((p01_raw >> 8u) & 0xFFu), f32((p01_raw >> 16u) & 0xFFu)) / 255.0;
    let p11 = vec3<f32>(f32(p11_raw & 0xFFu), f32((p11_raw >> 8u) & 0xFFu), f32((p11_raw >> 16u) & 0xFFu)) / 255.0;

    // Bilinear blend
    let top = mix(p00, p10, fx);
    let bottom = mix(p01, p11, fx);
    let sample_rgb = mix(top, bottom, fy);

    // MSDF: take median of R, G, B channels
    let dist = msdf_median(sample_rgb.x, sample_rgb.y, sample_rgb.z);

    // Screen-space derivative for scale-independent threshold
    // (uses precomputed uv_dpdx/uv_dpdy from uniform control flow above)
    let dx = uv_dpdx * atlasWidthF;
    let dy = uv_dpdy * atlasHeightF;
    let screenPxRange = max(length(vec2<f32>(dx, dy)), 0.5);

    // Apply threshold: 0.5 is the edge, expand by screen pixel range
    let alpha = clamp((dist - 0.5) * screenPxRange + 0.5, 0.0, 1.0);

    if (alpha < 0.01) {
      discard;
    }

    let textColor = input.color;
    let finalAlpha = textColor.a * alpha;
    return vec4<f32>(textColor.rgb * finalAlpha, finalAlpha);
  }

  // [LAW:single-enforcer] Fragment stage outputs premultiplied alpha so browser
  // compositing and pipeline blending share one canonical alpha contract.
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
"#;
