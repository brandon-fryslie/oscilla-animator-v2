// [LAW:one-source-of-truth] Canonical default WGSL payloads are centralized
// in one module so engine boot/rebuild callsites cannot drift by copy.
pub const DEFAULT_SIMULATION_WGSL: &str = r#"
@group(0) @binding(0) var<storage, read> arena_read: array<u32>;
@group(0) @binding(1) var<storage, read_write> arena_write: array<u32>;
@group(0) @binding(2) var<storage, read> state_read: array<u32>;
@group(0) @binding(3) var<storage, read_write> state_write: array<u32>;
@group(0) @binding(4) var<uniform> global_uniforms: array<vec4<f32>, 5>;

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&state_write)) {
    return;
  }
  let base = state_read[index] + arena_read[index];
  let dt_bits = bitcast<u32>(global_uniforms[4].y);
  state_write[index] = base + dt_bits + 1u;
  arena_write[index] = state_write[index];
}
"#;

pub const DEFAULT_ASSEMBLY_WGSL: &str = r#"
@group(0) @binding(0) var<uniform> global_uniforms: array<vec4<f32>, 5>;
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
pub const DEFAULT_UBER_SHADER_WGSL: &str = r#"
struct GlobalUniforms {
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

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(2) @binding(0) var<storage, read> topologyBank: array<u32>;

// ShapeBankHeaderWord offsets (must match TypeScript ShapeBankHeaderWord enum)
const SHAPE_WORD_FLAGS: u32 = 2u;
const SHAPE_WORD_PARAM_BLOCK_OFFSET: u32 = 9u;
const SHAPE_FLAG_CLOSED: u32 = 1u;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
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

// [RECOVER-04] Vertex pulling: positions are read from topologyBank at
// the shape's paramBlockOffset. Triangle fan is generated from vertex_index.
// No vertex buffer is bound.
@vertex fn vs_main(
  @builtin(instance_index) instanceIndex: u32,
  @builtin(vertex_index) vertexIndex: u32,
) -> VertexOutput {
  let inst = instances[instanceIndex];
  let topologyWordOffset = u32(max(inst.transform1.z, 0.0));
  let flags = topologyBank[topologyWordOffset + SHAPE_WORD_FLAGS];
  let isClosed = (flags & SHAPE_FLAG_CLOSED) != 0u;
  let paramBlockOffset = topologyBank[topologyWordOffset + SHAPE_WORD_PARAM_BLOCK_OFFSET];

  // [LAW:dataflow-not-control-flow] Both fan and sequential control-point
  // indices are computed; the flags data selects which one is used.
  let tri = vertexIndex / 3u;
  let loc = vertexIndex % 3u;
  let fanCpIndex = select(tri + loc, 0u, loc == 0u);
  let cpIndex = select(vertexIndex, fanCpIndex, isClosed);

  let xBits = topologyBank[paramBlockOffset + cpIndex * 2u];
  let yBits = topologyBank[paramBlockOffset + cpIndex * 2u + 1u];
  let pulledX = bitcast<f32>(xBits);
  let pulledY = bitcast<f32>(yBits);

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
  out.position = global.view_proj * worldPos;

  let rawH = inst.color.x;
  let rawC = inst.color.y;
  let rawL = inst.color.z;
  let rawA = inst.color.w;
  let safeH = select(0.0, rawH, rawH == rawH);
  let safeC = max(0.0, select(0.0, rawC, rawC == rawC));
  let safeL = clamp(select(0.0, rawL, rawL == rawL), 0.0, 1.0);
  let safeA = clamp(select(1.0, rawA, rawA == rawA), 0.0, 1.0);
  let safeRgb = clamp(oklch_to_linear_srgb(safeH, safeC, safeL), vec3<f32>(0.0), vec3<f32>(1.0));
  out.color = vec4<f32>(safeRgb, safeA);
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // [LAW:single-enforcer] Fragment stage outputs premultiplied alpha so browser
  // compositing and pipeline blending share one canonical alpha contract.
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
"#;
