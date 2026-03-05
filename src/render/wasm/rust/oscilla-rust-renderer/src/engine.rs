use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use js_sys::{Atomics, Float32Array, Int32Array, SharedArrayBuffer, Uint32Array};
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use web_sys::console;
use web_sys::OffscreenCanvas;

use crate::allocator::StrictAllocator;
use crate::compute::{CompilerComputePassSpec, ComputeDispatcher};
use crate::memory::{
    GpuMemoryArena, INDIRECT_INDEXED_STRIDE_WORDS, INDIRECT_NON_INDEXED_STRIDE_WORDS,
    SHAPE_BANK_HEADER_WORDS, SINK_TABLE_HEADER_WORDS, SINK_TABLE_RECORD_WORDS,
};
use crate::render::{DepthTarget, IndirectRegionPlan, RenderDispatcher};
use crate::scheduler::{
    DispatchCounters, ResourceStats, SchedulerState, SchedulerTelemetry, StageTimingsMs,
    WorkerObservabilityPacket, WorkerScheduler,
};

const INPUT_WORD_WIDTH: usize = 0;
const INPUT_WORD_HEIGHT: usize = 1;
const INPUT_WORD_ZOOM: usize = 2;
const INPUT_WORD_PAN_X: usize = 3;
const INPUT_WORD_PAN_Y: usize = 4;
const INPUT_WORD_TIME_MS: usize = 5;
const INPUT_WORD_MOUSE_X: usize = 6;
const INPUT_WORD_MOUSE_Y: usize = 7;
const INPUT_WORD_MOUSE_BUTTONS: usize = 8;
const INPUT_WORD_AUDIO_LOW: usize = 9;
const INPUT_WORD_AUDIO_MID: usize = 10;
const INPUT_WORD_AUDIO_HIGH: usize = 11;
const INPUT_WORD_GAUGE_ACTIVE: usize = 12;
const INPUT_WORD_SINK_TABLE_WORDS: usize = 13;
const INPUT_WORD_SHAPE_BANK_WORDS: usize = 14;
const INPUT_SIGNAL_WORDS: u32 = 4;
const INPUT_FLOAT_WORDS: u32 = 32;

const DEFAULT_SIMULATION_WGSL: &str = r#"
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

const DEFAULT_ASSEMBLY_WGSL: &str = r#"
@group(0) @binding(0) var<uniform> global_uniforms: array<vec4<f32>, 5>;
@group(1) @binding(0) var<storage, read> arena_words: array<u32>;
@group(2) @binding(0) var<storage, read_write> instance_words: array<f32>;
@group(2) @binding(1) var<storage, read> sink_table_words: array<u32>;

const SINK_TABLE_HEADER_WORDS: u32 = 8u;
const SINK_TABLE_RECORD_WORDS: u32 = 29u;
const RECORD_WORD_SHAPE_HANDLE_WORD_OFFSET: u32 = 2u;
const RECORD_WORD_INSTANCE_COUNT: u32 = 4u;
const RECORD_WORD_FIRST_INSTANCE: u32 = 5u;
const RECORD_WORD_SHAPE_SOURCE_CODE: u32 = 7u;
const RECORD_WORD_POSITION_BASE_OFFSET: u32 = 8u;
const RECORD_WORD_POSITION_LANE_STRIDE: u32 = 9u;
const RECORD_WORD_POSITION_COMPONENT_STRIDE: u32 = 10u;
const RECORD_WORD_COLOR_BASE_OFFSET: u32 = 11u;
const RECORD_WORD_COLOR_LANE_STRIDE: u32 = 12u;
const RECORD_WORD_COLOR_COMPONENT_STRIDE: u32 = 13u;
const RECORD_WORD_SCALE_MODE_CODE: u32 = 14u;
const RECORD_WORD_SCALE_VALUE_OR_BASE_OFFSET: u32 = 15u;
const RECORD_WORD_SCALE_LANE_STRIDE: u32 = 16u;
const RECORD_WORD_SCALE_COMPONENT_STRIDE: u32 = 17u;
const RECORD_WORD_ROTATION_MODE_CODE: u32 = 18u;
const RECORD_WORD_ROTATION_BASE_OFFSET: u32 = 19u;
const RECORD_WORD_ROTATION_LANE_STRIDE: u32 = 20u;
const RECORD_WORD_ROTATION_COMPONENT_STRIDE: u32 = 21u;
const RECORD_WORD_SCALE2_MODE_CODE: u32 = 22u;
const RECORD_WORD_SCALE2_BASE_OFFSET: u32 = 23u;
const RECORD_WORD_SCALE2_LANE_STRIDE: u32 = 24u;
const RECORD_WORD_SCALE2_COMPONENT_STRIDE: u32 = 25u;
const RECORD_WORD_SHAPE_SLOT_BASE_OFFSET: u32 = 26u;
const RECORD_WORD_SHAPE_SLOT_LANE_STRIDE: u32 = 27u;
const RECORD_WORD_SHAPE_SLOT_COMPONENT_STRIDE: u32 = 28u;

const SCALE_MODE_IDENTITY: u32 = 0u;
const SCALE_MODE_SCALAR_BITS: u32 = 1u;
const SCALE_MODE_SLOT: u32 = 2u;

const OPTIONAL_MODE_IDENTITY: u32 = 0u;
const OPTIONAL_MODE_SLOT: u32 = 1u;

const SHAPE_SOURCE_ONE_HANDLE: u32 = 0u;
const SHAPE_SOURCE_SLOT: u32 = 1u;

fn arena_index(base_offset: u32, lane: u32, component: u32, lane_stride: u32, component_stride: u32) -> u32 {
  return base_offset + lane * lane_stride + component * component_stride;
}

fn read_arena_f32(base_offset: u32, lane: u32, component: u32, lane_stride: u32, component_stride: u32) -> f32 {
  let index = arena_index(base_offset, lane, component, lane_stride, component_stride);
  if (index >= arrayLength(&arena_words)) {
    return 0.0;
  }
  let raw = bitcast<f32>(arena_words[index]);
  return select(0.0, raw, raw == raw);
}

fn read_arena_u32(base_offset: u32, lane: u32, component: u32, lane_stride: u32, component_stride: u32) -> u32 {
  let index = arena_index(base_offset, lane, component, lane_stride, component_stride);
  if (index >= arrayLength(&arena_words)) {
    return 0u;
  }
  return arena_words[index];
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
    let sink_count = sink_table_words[1u];
    var sink_index = 0u;
    var sink_found = false;
    var sink_base = 0u;
    var sink_lane = 0u;
    loop {
      if (sink_index >= sink_count) {
        break;
      }
      let candidate_sink_base = SINK_TABLE_HEADER_WORDS + sink_index * SINK_TABLE_RECORD_WORDS;
      if (candidate_sink_base + RECORD_WORD_SHAPE_SLOT_COMPONENT_STRIDE >= sink_table_word_count) {
        break;
      }
      let first_instance = sink_table_words[candidate_sink_base + RECORD_WORD_FIRST_INSTANCE];
      let instance_count = sink_table_words[candidate_sink_base + RECORD_WORD_INSTANCE_COUNT];
      let instance_end = first_instance + instance_count;
      if (gid.x >= first_instance && gid.x < instance_end) {
        sink_base = candidate_sink_base;
        sink_lane = gid.x - first_instance;
        sink_found = true;
        break;
      }
      sink_index = sink_index + 1u;
    }
    if (sink_found) {
      let pos_base_offset = sink_table_words[sink_base + RECORD_WORD_POSITION_BASE_OFFSET];
      let pos_lane_stride = sink_table_words[sink_base + RECORD_WORD_POSITION_LANE_STRIDE];
      let pos_component_stride = sink_table_words[sink_base + RECORD_WORD_POSITION_COMPONENT_STRIDE];
      pos_x = read_arena_f32(pos_base_offset, sink_lane, 0u, pos_lane_stride, pos_component_stride);
      pos_y = read_arena_f32(pos_base_offset, sink_lane, 1u, pos_lane_stride, pos_component_stride);

      let color_base_offset = sink_table_words[sink_base + RECORD_WORD_COLOR_BASE_OFFSET];
      let color_lane_stride = sink_table_words[sink_base + RECORD_WORD_COLOR_LANE_STRIDE];
      let color_component_stride = sink_table_words[sink_base + RECORD_WORD_COLOR_COMPONENT_STRIDE];
      color_r = read_arena_f32(color_base_offset, sink_lane, 0u, color_lane_stride, color_component_stride);
      color_g = read_arena_f32(color_base_offset, sink_lane, 1u, color_lane_stride, color_component_stride);
      color_b = read_arena_f32(color_base_offset, sink_lane, 2u, color_lane_stride, color_component_stride);
      color_a = read_arena_f32(color_base_offset, sink_lane, 3u, color_lane_stride, color_component_stride);

      let scale_mode = sink_table_words[sink_base + RECORD_WORD_SCALE_MODE_CODE];
      if (scale_mode == SCALE_MODE_SCALAR_BITS) {
        scale = bitcast<f32>(sink_table_words[sink_base + RECORD_WORD_SCALE_VALUE_OR_BASE_OFFSET]);
      } else if (scale_mode == SCALE_MODE_SLOT) {
        let scale_base_offset = sink_table_words[sink_base + RECORD_WORD_SCALE_VALUE_OR_BASE_OFFSET];
        let scale_lane_stride = sink_table_words[sink_base + RECORD_WORD_SCALE_LANE_STRIDE];
        let scale_component_stride = sink_table_words[sink_base + RECORD_WORD_SCALE_COMPONENT_STRIDE];
        scale = read_arena_f32(scale_base_offset, sink_lane, 0u, scale_lane_stride, scale_component_stride);
      }

      let rotation_mode = sink_table_words[sink_base + RECORD_WORD_ROTATION_MODE_CODE];
      if (rotation_mode == OPTIONAL_MODE_SLOT) {
        let rotation_base_offset = sink_table_words[sink_base + RECORD_WORD_ROTATION_BASE_OFFSET];
        let rotation_lane_stride = sink_table_words[sink_base + RECORD_WORD_ROTATION_LANE_STRIDE];
        let rotation_component_stride = sink_table_words[sink_base + RECORD_WORD_ROTATION_COMPONENT_STRIDE];
        rotation = read_arena_f32(rotation_base_offset, sink_lane, 0u, rotation_lane_stride, rotation_component_stride);
      }

      let scale2_mode = sink_table_words[sink_base + RECORD_WORD_SCALE2_MODE_CODE];
      if (scale2_mode == OPTIONAL_MODE_SLOT) {
        let scale2_base_offset = sink_table_words[sink_base + RECORD_WORD_SCALE2_BASE_OFFSET];
        let scale2_lane_stride = sink_table_words[sink_base + RECORD_WORD_SCALE2_LANE_STRIDE];
        let scale2_component_stride = sink_table_words[sink_base + RECORD_WORD_SCALE2_COMPONENT_STRIDE];
        scale2_x = read_arena_f32(scale2_base_offset, sink_lane, 0u, scale2_lane_stride, scale2_component_stride);
        scale2_y = read_arena_f32(scale2_base_offset, sink_lane, 1u, scale2_lane_stride, scale2_component_stride);
      }

      let shape_source = sink_table_words[sink_base + RECORD_WORD_SHAPE_SOURCE_CODE];
      if (shape_source == SHAPE_SOURCE_SLOT) {
        let shape_slot_base_offset = sink_table_words[sink_base + RECORD_WORD_SHAPE_SLOT_BASE_OFFSET];
        let shape_slot_lane_stride = sink_table_words[sink_base + RECORD_WORD_SHAPE_SLOT_LANE_STRIDE];
        let shape_slot_component_stride = sink_table_words[sink_base + RECORD_WORD_SHAPE_SLOT_COMPONENT_STRIDE];
        shape_word_offset = read_arena_u32(shape_slot_base_offset, sink_lane, 0u, shape_slot_lane_stride, shape_slot_component_stride);
      } else if (shape_source == SHAPE_SOURCE_ONE_HANDLE) {
        shape_word_offset = sink_table_words[sink_base + RECORD_WORD_SHAPE_HANDLE_WORD_OFFSET];
      }
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

const DEFAULT_UBER_SHADER_WGSL: &str = r#"
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

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex fn vs_main(
  @location(0) localPos: vec2<f32>,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  let inst = instances[instanceIndex];
  let topologyWordOffset = u32(max(inst.transform1.z, 0.0));
  let topologyFlags = topologyBank[topologyWordOffset + 3u];
  let closedMask = select(0.0, 1.0, (topologyFlags & 1u) != 0u);
  let viewportPx = global.resolution;
  let panPx = vec2<f32>(global.view_proj[0].y, global.view_proj[0].z);
  let zoom = global.view_proj[0].x;
  let viewportMinPx = min(viewportPx.x, viewportPx.y);
  let rawCenterX = inst.transform0.x;
  let rawCenterY = inst.transform0.y;
  let finiteCenterX = select(0.0, rawCenterX, rawCenterX == rawCenterX);
  let finiteCenterY = select(0.0, rawCenterY, rawCenterY == rawCenterY);
  // [LAW:one-source-of-truth] Canonical runtime payload provides unit-space
  // instance centers; render consumes them directly with no heuristic remap.
  let centerX = clamp(finiteCenterX, 0.0, 1.0);
  let centerY = clamp(finiteCenterY, 0.0, 1.0);
  let centerPx = vec2<f32>(centerX, centerY) * viewportPx;
  let centeredPx = (centerPx - (viewportPx * 0.5)) * zoom + (viewportPx * 0.5) + (panPx * zoom);
  let rawScaleX = inst.transform0.z * inst.transform1.x;
  let rawScaleY = inst.transform0.z * inst.transform1.y;
  let finiteScaleX = select(1.0, rawScaleX, rawScaleX == rawScaleX);
  let finiteScaleY = select(1.0, rawScaleY, rawScaleY == rawScaleY);
  let scaleX = clamp(abs(finiteScaleX), 0.01, 4.0);
  let scaleY = clamp(abs(finiteScaleY), 0.01, 4.0);
  let localScaled = vec2<f32>(localPos.x * scaleX, localPos.y * scaleY) * viewportMinPx * zoom;
  let rawRotation = inst.transform0.w;
  let safeRotation = select(0.0, rawRotation, rawRotation == rawRotation);
  let c = cos(safeRotation);
  let s = sin(safeRotation);
  let rotatedPx = vec2<f32>(
    localScaled.x * c - localScaled.y * s,
    localScaled.x * s + localScaled.y * c
  );
  let finalPx = centeredPx + rotatedPx;
  let safeViewportX = max(viewportPx.x, 1.0);
  let safeViewportY = max(viewportPx.y, 1.0);
  let ndc = vec2<f32>(
    (finalPx.x / safeViewportX) * 2.0 - 1.0,
    1.0 - (finalPx.y / safeViewportY) * 2.0
  );
  let safeNdc = vec2<f32>(
    clamp(select(0.0, ndc.x, ndc.x == ndc.x), -2.0, 2.0),
    clamp(select(0.0, ndc.y, ndc.y == ndc.y), -2.0, 2.0),
  );
  var out: VertexOutput;
  out.position = vec4<f32>(safeNdc, 0.0, 1.0);
  let rawR = inst.color.x;
  let rawG = inst.color.y;
  let rawB = inst.color.z;
  let rawA = inst.color.w;
  let safeR = clamp(select(0.0, rawR, rawR == rawR), 0.0, 1.0);
  let safeG = clamp(select(0.0, rawG, rawG == rawG), 0.0, 1.0);
  let safeB = clamp(select(0.0, rawB, rawB == rawB), 0.0, 1.0);
  let safeA = clamp(select(1.0, rawA, rawA == rawA), 0.0, 1.0);
  out.color = vec4<f32>(safeR, safeG, safeB, safeA) * (1.0 + closedMask * 0.0);
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // [LAW:single-enforcer] Fragment stage outputs premultiplied alpha so browser
  // compositing and pipeline blending share one canonical alpha contract.
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
"#;

pub struct EngineConfig {
    pub max_particles: usize,
    pub max_shapes: usize,
    pub debug_readback_hz: u32,
}

pub struct Engine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    surface_format: wgpu::TextureFormat,
    depth_target: DepthTarget,
    arena: GpuMemoryArena,
    compute: ComputeDispatcher,
    render: RenderDispatcher,
    shared_input_signals: Option<Int32Array>,
    shared_input: Option<Float32Array>,
    shared_shape_bank: Option<Uint32Array>,
    shared_sink_table: Option<Uint32Array>,
    scheduler: WorkerScheduler,
    frame_count: u64,
    debug_readback_interval_frames: u64,
    debug_readback_in_flight: Arc<AtomicBool>,
    max_particles: u32,
    max_shapes: u32,
    draw_regions: IndirectRegionPlan,
    last_shape_bank_words: u32,
    last_sink_table_words: u32,
}

#[cfg(target_arch = "wasm32")]
fn create_runtime_surface(
    instance: &wgpu::Instance,
    canvas: OffscreenCanvas,
) -> Result<wgpu::Surface<'static>, JsValue> {
    instance
        .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
        .map_err(|error| JsValue::from_str(&format!("create_surface failed: {error}")))
}

#[cfg(not(target_arch = "wasm32"))]
fn create_runtime_surface(
    _instance: &wgpu::Instance,
    _canvas: OffscreenCanvas,
) -> Result<wgpu::Surface<'static>, JsValue> {
    // [LAW:one-way-deps] exception: host-target checks compile this crate for
    // diagnostics only; runtime surface initialization is wasm-only.
    Err(JsValue::from_str(
        "oscilla_rust_renderer surface initialization is only supported on wasm32",
    ))
}

fn worker_monotonic_now_ms() -> f64 {
    js_sys::global()
        .dyn_into::<web_sys::DedicatedWorkerGlobalScope>()
        .ok()
        .and_then(|worker| worker.performance())
        .map(|performance| performance.now())
        .unwrap_or_else(js_sys::Date::now)
}

fn clamp_non_negative_u32(value: f32, max_value: u32) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    if value <= 0.0 {
        return 0;
    }
    let floored = value.floor();
    if floored >= max_value as f32 {
        return max_value;
    }
    floored as u32
}

const SHAPE_WORD_KIND: usize = 0;
const SHAPE_WORD_FLAGS: usize = 2;
const SHAPE_WORD_INDEX_COUNT: usize = 4;
const SHAPE_WORD_FIRST_INDEX: usize = 5;
const SHAPE_WORD_BASE_VERTEX: usize = 6;
const SHAPE_WORD_VERTEX_COUNT: usize = 7;
const SHAPE_WORD_FIRST_VERTEX: usize = 8;
const SHAPE_WORD_PARAM_BLOCK_OFFSET: usize = 9;
const SHAPE_WORD_PARAM_BLOCK_WORDS: usize = 10;
const SHAPE_FLAG_CLOSED: u32 = 1;

const DRAW_MODE_INDEXED: u32 = 0;
const DRAW_MODE_NON_INDEXED: u32 = 1;
const SINK_RECORD_WORD_DRAW_MODE: usize = 1;
const SINK_RECORD_WORD_SHAPE_HANDLE_WORD_OFFSET: usize = 2;
const SINK_RECORD_WORD_INDIRECT_RECORD_INDEX: usize = 3;
const SINK_RECORD_WORD_INSTANCE_COUNT: usize = 4;
const SINK_RECORD_WORD_FIRST_INSTANCE: usize = 5;

fn realize_shape_bank_geometry(shape_bank_words: &mut [u32]) -> (Vec<f32>, Vec<u32>) {
    let mut vertex_floats: Vec<f32> = Vec::new();
    let mut index_words: Vec<u32> = Vec::new();
    let mut cursor: usize = 0;
    while cursor < shape_bank_words.len() {
        if cursor + SHAPE_BANK_HEADER_WORDS > shape_bank_words.len() {
            panic!(
                "shape bank payload truncated (cursor={}, words={}, header_words={})",
                cursor,
                shape_bank_words.len(),
                SHAPE_BANK_HEADER_WORDS
            );
        }
        let base = cursor;
        let kind = shape_bank_words[base + SHAPE_WORD_KIND];
        if kind == 0 {
            panic!(
                "shape bank contains non-shape record at word offset {} (kind=0)",
                base
            );
        }
        let vertex_count = shape_bank_words[base + SHAPE_WORD_VERTEX_COUNT];
        let flags = shape_bank_words[base + SHAPE_WORD_FLAGS];
        let param_block_offset = shape_bank_words[base + SHAPE_WORD_PARAM_BLOCK_OFFSET] as usize;
        let param_block_words = shape_bank_words[base + SHAPE_WORD_PARAM_BLOCK_WORDS] as usize;
        let first_vertex = (vertex_floats.len() / 2) as u32;
        shape_bank_words[base + SHAPE_WORD_FIRST_VERTEX] = first_vertex;
        shape_bank_words[base + SHAPE_WORD_BASE_VERTEX] = 0;
        let first_index = index_words.len() as u32;
        shape_bank_words[base + SHAPE_WORD_FIRST_INDEX] = first_index;

        if vertex_count == 0 {
            shape_bank_words[base + SHAPE_WORD_INDEX_COUNT] = 0;
        } else {
            let expected_param_words = (vertex_count as usize).saturating_mul(2);
            if param_block_words < expected_param_words {
                panic!(
                    "shape bank control-point payload too small (handle={}, vertex_count={}, param_words={}, expected={})",
                    base,
                    vertex_count,
                    param_block_words,
                    expected_param_words
                );
            }
            let param_payload_end = param_block_offset.saturating_add(expected_param_words);
            if param_payload_end > shape_bank_words.len() {
                panic!(
                    "shape bank control-point payload out of range (handle={}, offset={}, end={}, words={})",
                    base,
                    param_block_offset,
                    param_payload_end,
                    shape_bank_words.len()
                );
            }
            // [LAW:one-source-of-truth] Geometry payload is realized directly from
            // canonical ShapeHeaderV1 param-block control points.
            for point in 0..vertex_count as usize {
                let param_index = param_block_offset + point * 2;
                let x = f32::from_bits(shape_bank_words[param_index]);
                let y = f32::from_bits(shape_bank_words[param_index + 1]);
                vertex_floats.push(x);
                vertex_floats.push(y);
            }

            if (flags & SHAPE_FLAG_CLOSED) != 0 && vertex_count >= 3 {
                for fan in 1..(vertex_count - 1) {
                    index_words.push(first_vertex);
                    index_words.push(first_vertex + fan);
                    index_words.push(first_vertex + fan + 1);
                }
            }

            let generated_index_count = (index_words.len() as u32).saturating_sub(first_index);
            shape_bank_words[base + SHAPE_WORD_INDEX_COUNT] = generated_index_count;
        }
        let next_cursor = if param_block_words == 0 {
            base + SHAPE_BANK_HEADER_WORDS
        } else {
            param_block_offset
                .saturating_add(param_block_words)
                .max(base + SHAPE_BANK_HEADER_WORDS)
        };
        if next_cursor <= cursor {
            panic!(
                "shape bank cursor did not advance (cursor={}, next_cursor={})",
                cursor, next_cursor
            );
        }
        cursor = next_cursor;
    }
    if cursor != shape_bank_words.len() {
        panic!(
            "shape bank parser ended at unexpected offset (cursor={}, words={})",
            cursor,
            shape_bank_words.len()
        );
    }
    (vertex_floats, index_words)
}

impl Engine {
    pub async fn new(canvas: OffscreenCanvas, config: EngineConfig) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..Default::default()
        });
        let surface = create_runtime_surface(&instance, canvas)?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| JsValue::from_str("request_adapter failed: no compatible adapter"))?;

        // [LAW:single-enforcer] Required limits are negotiated in one place
        // at device creation so runtime paths don't fork on capability checks.
        let mut required_limits = wgpu::Limits::downlevel_webgl2_defaults();
        required_limits.max_compute_invocations_per_workgroup = required_limits
            .max_compute_invocations_per_workgroup
            .max(256);
        required_limits.max_storage_buffer_binding_size = required_limits
            .max_storage_buffer_binding_size
            .max(128 * 1024 * 1024);

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("Oscilla.Render.Device"),
                    required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE,
                    required_limits,
                    memory_hints: wgpu::MemoryHints::Performance,
                },
                None,
            )
            .await
            .map_err(|error| JsValue::from_str(&format!("request_device failed: {error}")))?;

        let capabilities = surface.get_capabilities(&adapter);
        let surface_format = capabilities
            .formats
            .iter()
            .copied()
            .find(|format| format.is_srgb())
            .unwrap_or(capabilities.formats[0]);
        let present_mode = capabilities
            .present_modes
            .iter()
            .copied()
            .find(|mode| *mode == wgpu::PresentMode::Fifo)
            .unwrap_or(capabilities.present_modes[0]);
        let alpha_mode = capabilities.alpha_modes[0];
        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: 1,
            height: 1,
            present_mode,
            desired_maximum_frame_latency: 2,
            alpha_mode,
            view_formats: vec![],
        };
        surface.configure(&device, &surface_config);

        let compute = ComputeDispatcher::new(
            &device,
            DEFAULT_SIMULATION_WGSL,
            DEFAULT_ASSEMBLY_WGSL,
            config.max_particles as u32,
            config.max_shapes as u32,
        );
        let render = RenderDispatcher::new(
            &device,
            DEFAULT_UBER_SHADER_WGSL,
            surface_config.format,
            &compute.uniform_layout,
        );
        let arena = GpuMemoryArena::new(
            &device,
            &compute.uniform_layout,
            &compute.state_layout,
            compute.compiler_simulation_layout(),
            &compute.assembly_layout,
            &compute.draw_prep_layout,
            &render.instance_layout,
            &render.topology_layout,
            config.max_particles,
            config.max_shapes,
        );
        arena.clear_simulation_planes(&queue);
        let depth_target = DepthTarget::new(&device, surface_config.width, surface_config.height);
        let debug_readback_interval_frames = if config.debug_readback_hz == 0 {
            0
        } else {
            (60 / config.debug_readback_hz.max(1)).max(1) as u64
        };
        let scheduler = WorkerScheduler::new(worker_monotonic_now_ms());

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            surface_format,
            depth_target,
            arena,
            compute,
            render,
            shared_input_signals: None,
            shared_input: None,
            shared_shape_bank: None,
            shared_sink_table: None,
            scheduler,
            frame_count: 0,
            debug_readback_interval_frames,
            debug_readback_in_flight: Arc::new(AtomicBool::new(false)),
            max_particles: config.max_particles as u32,
            max_shapes: config.max_shapes as u32,
            draw_regions: IndirectRegionPlan::default(),
            last_shape_bank_words: 0,
            last_sink_table_words: 0,
        })
    }

    pub fn attach_shared_input(&mut self, shared_input: SharedArrayBuffer) {
        self.shared_input_signals = Some(Int32Array::new_with_byte_offset_and_length(
            &shared_input,
            0,
            INPUT_SIGNAL_WORDS,
        ));
        // [LAW:one-source-of-truth] Shared input ABI layout is owned by the
        // renderer input plane: first 4 i32 signal words, then 32 f32 words.
        self.shared_input = Some(Float32Array::new_with_byte_offset_and_length(
            &shared_input,
            INPUT_SIGNAL_WORDS * std::mem::size_of::<i32>() as u32,
            INPUT_FLOAT_WORDS,
        ));
    }

    pub fn attach_shared_shape_bank(&mut self, shared_shape_bank: SharedArrayBuffer) {
        self.shared_shape_bank = Some(Uint32Array::new(&shared_shape_bank));
    }

    pub fn attach_shared_sink_table(&mut self, shared_sink_table: SharedArrayBuffer) {
        self.shared_sink_table = Some(Uint32Array::new(&shared_sink_table));
    }

    pub fn resize_surface(&mut self, width: u32, height: u32) {
        let safe_width = width.max(1);
        let safe_height = height.max(1);
        if self.surface_config.width == safe_width && self.surface_config.height == safe_height {
            return;
        }
        self.surface_config.width = safe_width;
        self.surface_config.height = safe_height;
        self.surface.configure(&self.device, &self.surface_config);
        self.depth_target
            .resize(&self.device, safe_width, safe_height);
    }

    pub fn pause(&mut self) {
        self.scheduler.mark_paused(worker_monotonic_now_ms());
    }

    pub fn resume(&mut self) {
        self.scheduler.mark_running(worker_monotonic_now_ms());
    }

    pub fn rebuild_pipeline(
        &mut self,
        simulation_wgsl: &str,
        assembly_wgsl: &str,
        uber_shader_wgsl: &str,
        particle_count: u32,
        shape_count: u32,
    ) {
        // [LAW:one-source-of-truth] Pipeline compilation occurs only at rebuild
        // boundary; hot-path tick only executes precompiled pipeline objects.
        self.compute = ComputeDispatcher::new(
            &self.device,
            simulation_wgsl,
            assembly_wgsl,
            particle_count,
            shape_count,
        );
        self.render = RenderDispatcher::new(
            &self.device,
            uber_shader_wgsl,
            self.surface_format,
            &self.compute.uniform_layout,
        );
        let arena = GpuMemoryArena::new(
            &self.device,
            &self.compute.uniform_layout,
            &self.compute.state_layout,
            self.compute.compiler_simulation_layout(),
            &self.compute.assembly_layout,
            &self.compute.draw_prep_layout,
            &self.render.instance_layout,
            &self.render.topology_layout,
            particle_count as usize,
            shape_count as usize,
        );
        arena.clear_simulation_planes(&self.queue);
        self.arena = arena;
        self.draw_regions = IndirectRegionPlan::default();
        self.last_shape_bank_words = 0;
        self.last_sink_table_words = 0;
    }

    pub fn rebuild_gpu_pipelines(&mut self, pass_specs: &[CompilerComputePassSpec]) {
        // [LAW:single-enforcer] Compiler-owned GPU pass artifacts are published
        // at one engine boundary so runtime hot path never recompiles ad hoc.
        self.compute.rebuild_gpu_pipelines_with_compiler_wgsl(
            &self.device,
            pass_specs,
            self.max_particles,
        );
        self.arena.clear_simulation_planes(&self.queue);
    }

    pub fn tick(&mut self, timestamp_ms: f64) -> Result<(), JsValue> {
        // [LAW:single-enforcer] requestAnimationFrame timestamp is the timing
        // authority for scheduler loop accounting and tick duration math.
        let tick_start_ms = if timestamp_ms.is_finite() {
            timestamp_ms.max(0.0)
        } else {
            worker_monotonic_now_ms()
        };
        self.scheduler.begin_loop_iteration(tick_start_ms);
        let input_stage_start_ms = worker_monotonic_now_ms();
        self.input_marshal_phase(tick_start_ms);
        let input_stage_end_ms = worker_monotonic_now_ms();
        let mut stage_timings = StageTimingsMs {
            input_marshal_ms: (input_stage_end_ms - input_stage_start_ms).max(0.0),
            ..StageTimingsMs::default()
        };
        if self.scheduler.state() == SchedulerState::Paused {
            let now_ms = worker_monotonic_now_ms();
            let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
            let telemetry = self.build_scheduler_telemetry(stage_timings);
            self.scheduler
                .record_paused_tick(now_ms, tick_elapsed_ms, telemetry);
            return Ok(());
        }

        enum HotPathOutcome {
            Success {
                debug_tick: bool,
                frame_count: u64,
                stage_timings: StageTimingsMs,
            },
            SurfaceTimeout,
            SurfaceLost,
            FatalOutOfMemory,
            FatalOther,
        }

        // [LAW:single-enforcer] Allocation poison checks are enforced only via
        // inject_poison_alloc; frame ticks must allow wgpu internal allocations.
        let outcome = match self.surface.get_current_texture() {
            Ok(frame) => {
                let color_view = frame
                    .texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                let mut encoder =
                    self.device
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                            // [LAW:dataflow-not-control-flow] Hot-path labels
                            // are static to avoid per-frame heap allocations.
                            label: Some("HotPath.CommandEncoder"),
                        });

                let simulation_stage_start_ms = worker_monotonic_now_ms();
                self.compute.encode_passes(
                    &mut encoder,
                    &mut self.arena,
                    self.draw_regions.total_instance_count,
                    self.draw_regions
                        .indexed_record_count
                        .saturating_add(self.draw_regions.non_indexed_record_count),
                );
                let simulation_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.simulation_dispatch_ms =
                    (simulation_stage_end_ms - simulation_stage_start_ms).max(0.0);
                // [LAW:one-source-of-truth] exception: fluid and dedicated
                // draw-prep GPU stages are not emitted yet, so these timings
                // remain zero-valued placeholders in the canonical packet.
                stage_timings.fluid_pass_chain_ms = 0.0;
                stage_timings.draw_prep_ms = 0.0;

                let render_stage_start_ms = worker_monotonic_now_ms();
                self.render.encode_passes(
                    &mut encoder,
                    &self.arena,
                    &color_view,
                    self.depth_target.view(),
                    self.draw_regions,
                );
                let render_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.render_ms = (render_stage_end_ms - render_stage_start_ms).max(0.0);

                let is_debug_tick = self.debug_readback_interval_frames > 0
                    && self.frame_count % self.debug_readback_interval_frames == 0;
                if is_debug_tick {
                    let copy_bytes = self
                        .arena
                        .debug_staging_buffer()
                        .size()
                        .min(self.arena.instance_buffer.size());
                    encoder.copy_buffer_to_buffer(
                        &self.arena.instance_buffer,
                        0,
                        self.arena.debug_staging_buffer(),
                        0,
                        copy_bytes,
                    );
                }

                let swap_stage_start_ms = worker_monotonic_now_ms();
                self.queue.submit(std::iter::once(encoder.finish()));
                frame.present();
                let swap_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.swap_ms = (swap_stage_end_ms - swap_stage_start_ms).max(0.0);
                self.frame_count = self.frame_count.wrapping_add(1);

                HotPathOutcome::Success {
                    debug_tick: is_debug_tick,
                    frame_count: self.frame_count,
                    stage_timings,
                }
            }
            Err(wgpu::SurfaceError::Timeout) => HotPathOutcome::SurfaceTimeout,
            Err(wgpu::SurfaceError::Outdated | wgpu::SurfaceError::Lost) => {
                // [LAW:dataflow-not-control-flow] Surface reconfiguration is
                // handled by explicit resize/control messages outside the
                // hot path; tick only records the lost/outdated condition.
                HotPathOutcome::SurfaceLost
            }
            Err(wgpu::SurfaceError::OutOfMemory) => HotPathOutcome::FatalOutOfMemory,
            Err(wgpu::SurfaceError::Other) => HotPathOutcome::FatalOther,
        };

        match outcome {
            HotPathOutcome::Success {
                debug_tick,
                frame_count,
                stage_timings,
            } => {
                // [LAW:single-enforcer] Async map callbacks can allocate in
                // browser glue and therefore run only after lock scope exits.
                if debug_tick {
                    self.trigger_debug_readback();
                }
                let now_ms = worker_monotonic_now_ms();
                let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
                let telemetry = self.build_scheduler_telemetry(stage_timings);
                self.scheduler
                    .record_tick_success(now_ms, tick_elapsed_ms, frame_count, telemetry);
                Ok(())
            }
            HotPathOutcome::SurfaceTimeout => {
                let telemetry = self.build_scheduler_telemetry(stage_timings);
                self.finish_timeout(tick_start_ms, telemetry)
            }
            HotPathOutcome::SurfaceLost => {
                let telemetry = self.build_scheduler_telemetry(stage_timings);
                self.finish_surface_lost(tick_start_ms, telemetry)
            }
            HotPathOutcome::FatalOutOfMemory => self.finish_fatal(
                tick_start_ms,
                "surface_out_of_memory",
                "Fatal Surface Error: OutOfMemory",
                "swap",
                self.build_scheduler_telemetry(stage_timings),
            ),
            HotPathOutcome::FatalOther => self.finish_fatal(
                tick_start_ms,
                "surface_other",
                "Fatal Surface Error: Other",
                "swap",
                self.build_scheduler_telemetry(stage_timings),
            ),
        }
    }

    fn finish_timeout(
        &mut self,
        tick_start_ms: f64,
        telemetry: SchedulerTelemetry,
    ) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler
            .record_surface_timeout(now_ms, tick_elapsed_ms, telemetry);
        Ok(())
    }

    fn finish_surface_lost(
        &mut self,
        tick_start_ms: f64,
        telemetry: SchedulerTelemetry,
    ) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler.record_surface_lost(
            now_ms,
            tick_elapsed_ms,
            "Surface acquire failed with Lost/Outdated",
            telemetry,
        );
        Ok(())
    }

    fn finish_fatal(
        &mut self,
        tick_start_ms: f64,
        code: &'static str,
        message: &'static str,
        stage: &'static str,
        telemetry: SchedulerTelemetry,
    ) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler
            .record_fatal(now_ms, tick_elapsed_ms, code, message, stage, telemetry);
        Err(JsValue::from_str(message))
    }

    fn build_scheduler_telemetry(&self, stage_timings: StageTimingsMs) -> SchedulerTelemetry {
        let assembly_workgroup_count =
            ((self.draw_regions.total_instance_count.saturating_add(63)) / 64).max(1);
        let simulation_workgroup_count = self.compute.simulation_workgroup_count();
        let simulation_dispatch_count = self.compute.simulation_dispatch_count();
        let dispatch_counters = DispatchCounters {
            compute_dispatch_count: simulation_dispatch_count.saturating_add(1),
            compute_workgroup_count: simulation_workgroup_count
                .saturating_add(assembly_workgroup_count),
            active_lane_count: self.draw_regions.total_instance_count,
            guarded_lane_count: assembly_workgroup_count
                .saturating_mul(64)
                .saturating_sub(self.draw_regions.total_instance_count),
        };
        let resource_stats = ResourceStats {
            shape_bank_word_count: self.last_shape_bank_words,
            sink_table_word_count: self.last_sink_table_words,
            indexed_record_count: self.draw_regions.indexed_record_count,
            non_indexed_record_count: self.draw_regions.non_indexed_record_count,
            total_instance_count: self.draw_regions.total_instance_count,
            canvas_width: self.surface_config.width,
            canvas_height: self.surface_config.height,
            ping_pong_index: self.arena.ping_pong_index() as u32,
        };
        SchedulerTelemetry {
            stage_timings,
            dispatch_counters,
            resource_stats,
        }
    }

    fn sync_shape_bank_plane(&mut self, shape_bank_words: u32) {
        let Some(shared_shape_bank) = self.shared_shape_bank.as_ref() else {
            return;
        };
        if shape_bank_words == 0 {
            return;
        }
        let available_words = shared_shape_bank.length();
        if shape_bank_words > available_words {
            panic!(
                "shape bank plane overflow (requested={}, available={})",
                shape_bank_words, available_words
            );
        }
        let mut plane_words = shared_shape_bank.subarray(0, shape_bank_words).to_vec();
        let (vertex_payload, index_payload) = realize_shape_bank_geometry(&mut plane_words);
        self.arena.write_geometry_payload(
            &self.device,
            &self.queue,
            vertex_payload.as_slice(),
            index_payload.as_slice(),
        );
        self.arena
            .write_shape_bank_words(&self.device, &self.queue, &plane_words);
    }

    fn sync_sink_table_plane_and_parse_regions(
        &mut self,
        sink_table_words: u32,
    ) -> IndirectRegionPlan {
        let Some(shared_sink_table) = self.shared_sink_table.as_ref() else {
            return IndirectRegionPlan::default();
        };
        if sink_table_words == 0 {
            return IndirectRegionPlan::default();
        }

        let available_words = shared_sink_table.length();
        if sink_table_words > available_words {
            panic!(
                "sink table plane overflow (requested={}, available={})",
                sink_table_words, available_words
            );
        }
        if sink_table_words < SINK_TABLE_HEADER_WORDS as u32 {
            panic!(
                "sink table missing header (words={}, required={})",
                sink_table_words, SINK_TABLE_HEADER_WORDS
            );
        }

        let total_record_count = shared_sink_table.get_index(1);
        let indexed_record_count = shared_sink_table.get_index(2);
        let non_indexed_record_count = shared_sink_table.get_index(3);
        let indexed_region_base_words = shared_sink_table.get_index(4);
        let non_indexed_region_base_words = shared_sink_table.get_index(5);
        let indexed_stride_words = shared_sink_table
            .get_index(6)
            .max(INDIRECT_INDEXED_STRIDE_WORDS as u32);
        let non_indexed_stride_words = shared_sink_table
            .get_index(7)
            .max(INDIRECT_NON_INDEXED_STRIDE_WORDS as u32);
        if total_record_count != indexed_record_count.saturating_add(non_indexed_record_count) {
            panic!(
                "sink table record count mismatch (total={}, indexed={}, nonIndexed={})",
                total_record_count, indexed_record_count, non_indexed_record_count
            );
        }
        let minimum_words = (SINK_TABLE_HEADER_WORDS as u32)
            .saturating_add(total_record_count.saturating_mul(SINK_TABLE_RECORD_WORDS as u32));
        if sink_table_words < minimum_words {
            panic!(
                "sink table truncated (words={}, required={})",
                sink_table_words, minimum_words
            );
        }

        let plane_words = shared_sink_table.subarray(0, sink_table_words).to_vec();
        self.arena
            .write_sink_table_words(&self.device, &self.queue, &plane_words);
        let mut total_instance_count: u32 = 0;
        for record in 0..(total_record_count as usize) {
            let record_base =
                SINK_TABLE_HEADER_WORDS + record.saturating_mul(SINK_TABLE_RECORD_WORDS);
            if record_base + SINK_RECORD_WORD_INSTANCE_COUNT >= plane_words.len() {
                break;
            }
            total_instance_count = total_instance_count
                .saturating_add(plane_words[record_base + SINK_RECORD_WORD_INSTANCE_COUNT]);
        }
        let mut mirrored_indirect_words: Vec<u32> = Vec::new();
        if let Some(shared_shape_bank) = self.shared_shape_bank.as_ref() {
            for record in 0..(total_record_count as usize) {
                let record_base =
                    SINK_TABLE_HEADER_WORDS + record.saturating_mul(SINK_TABLE_RECORD_WORDS);
                if record_base + SINK_RECORD_WORD_FIRST_INSTANCE >= plane_words.len() {
                    break;
                }
                let draw_mode = plane_words[record_base + SINK_RECORD_WORD_DRAW_MODE];
                let shape_handle_word_offset =
                    plane_words[record_base + SINK_RECORD_WORD_SHAPE_HANDLE_WORD_OFFSET] as usize;
                let indirect_record_index =
                    plane_words[record_base + SINK_RECORD_WORD_INDIRECT_RECORD_INDEX] as usize;
                let instance_count = plane_words[record_base + SINK_RECORD_WORD_INSTANCE_COUNT];
                let first_instance = plane_words[record_base + SINK_RECORD_WORD_FIRST_INSTANCE];
                if shape_handle_word_offset + SHAPE_BANK_HEADER_WORDS
                    > shared_shape_bank.length() as usize
                {
                    continue;
                }
                match draw_mode {
                    DRAW_MODE_INDEXED => {
                        let command_base = (indexed_region_base_words as usize).saturating_add(
                            indirect_record_index.saturating_mul(indexed_stride_words as usize),
                        );
                        let required_words =
                            command_base.saturating_add(INDIRECT_INDEXED_STRIDE_WORDS);
                        if mirrored_indirect_words.len() < required_words {
                            mirrored_indirect_words.resize(required_words, 0);
                        }
                        mirrored_indirect_words[command_base] = shared_shape_bank
                            .get_index((shape_handle_word_offset + SHAPE_WORD_INDEX_COUNT) as u32);
                        mirrored_indirect_words[command_base + 1] = instance_count;
                        mirrored_indirect_words[command_base + 2] = shared_shape_bank
                            .get_index((shape_handle_word_offset + SHAPE_WORD_FIRST_INDEX) as u32);
                        mirrored_indirect_words[command_base + 3] = shared_shape_bank
                            .get_index((shape_handle_word_offset + SHAPE_WORD_BASE_VERTEX) as u32);
                        mirrored_indirect_words[command_base + 4] = first_instance;
                    }
                    DRAW_MODE_NON_INDEXED => {
                        let command_base = (non_indexed_region_base_words as usize).saturating_add(
                            indirect_record_index.saturating_mul(non_indexed_stride_words as usize),
                        );
                        let required_words =
                            command_base.saturating_add(INDIRECT_NON_INDEXED_STRIDE_WORDS);
                        if mirrored_indirect_words.len() < required_words {
                            mirrored_indirect_words.resize(required_words, 0);
                        }
                        mirrored_indirect_words[command_base] = shared_shape_bank
                            .get_index((shape_handle_word_offset + SHAPE_WORD_VERTEX_COUNT) as u32);
                        mirrored_indirect_words[command_base + 1] = instance_count;
                        mirrored_indirect_words[command_base + 2] = shared_shape_bank
                            .get_index((shape_handle_word_offset + SHAPE_WORD_FIRST_VERTEX) as u32);
                        mirrored_indirect_words[command_base + 3] = first_instance;
                    }
                    _ => {}
                }
            }
        }
        // [LAW:single-enforcer] exception: this temporary CPU-side indirect
        // mirror keeps render visibility while validating draw-prep parity.
        self.arena.write_indirect_words(
            &self.device,
            &self.queue,
            mirrored_indirect_words.as_slice(),
        );
        IndirectRegionPlan {
            total_instance_count,
            indexed_record_count,
            non_indexed_record_count,
            indexed_region_base_words,
            non_indexed_region_base_words,
            indexed_stride_words,
            non_indexed_stride_words,
        }
    }

    fn input_marshal_phase(&mut self, timestamp_ms: f64) {
        let mut uniforms = self.arena.uniforms;
        if let Some(shared_input) = self.shared_input.as_ref() {
            if let Some(shared_input_signals) = self.shared_input_signals.as_ref() {
                // [LAW:single-enforcer] Frame input publication uses one atomic
                // signal word as the acquire fence before reading shared planes.
                let _ = Atomics::load::<Int32Array>(shared_input_signals, 0);
            }
            uniforms.resolution[0] = shared_input.get_index(INPUT_WORD_WIDTH as u32) as f32;
            uniforms.resolution[1] = shared_input.get_index(INPUT_WORD_HEIGHT as u32) as f32;
            uniforms.time_seconds =
                (shared_input.get_index(INPUT_WORD_TIME_MS as u32).max(0.0) * 0.001) as f32;
            uniforms.delta_time_seconds = (1.0 / 60.0) as f32;
            uniforms.view_proj[0][0] = shared_input.get_index(INPUT_WORD_ZOOM as u32) as f32;
            uniforms.view_proj[0][1] = shared_input.get_index(INPUT_WORD_PAN_X as u32) as f32;
            uniforms.view_proj[0][2] = shared_input.get_index(INPUT_WORD_PAN_Y as u32) as f32;
            uniforms.view_proj[0][3] = shared_input.get_index(INPUT_WORD_MOUSE_X as u32) as f32;
            uniforms.view_proj[1][0] = shared_input.get_index(INPUT_WORD_MOUSE_Y as u32) as f32;
            uniforms.view_proj[1][1] =
                shared_input.get_index(INPUT_WORD_MOUSE_BUTTONS as u32) as f32;
            uniforms.view_proj[1][2] = shared_input.get_index(INPUT_WORD_AUDIO_LOW as u32) as f32;
            uniforms.view_proj[1][3] = shared_input.get_index(INPUT_WORD_AUDIO_MID as u32) as f32;
            uniforms.view_proj[2][0] = shared_input.get_index(INPUT_WORD_AUDIO_HIGH as u32) as f32;
            uniforms.view_proj[2][1] =
                shared_input.get_index(INPUT_WORD_GAUGE_ACTIVE as u32) as f32;
            let shape_bank_word_limit = self
                .shared_shape_bank
                .as_ref()
                .map(|plane| plane.length())
                .unwrap_or_else(|| {
                    self.max_shapes
                        .saturating_mul(SHAPE_BANK_HEADER_WORDS as u32)
                });
            let sink_table_word_limit = self
                .shared_sink_table
                .as_ref()
                .map(|plane| plane.length())
                .unwrap_or_else(|| {
                    self.max_shapes
                        .saturating_mul(SINK_TABLE_RECORD_WORDS as u32)
                        .saturating_add(SINK_TABLE_HEADER_WORDS as u32)
                });
            let shape_bank_words = clamp_non_negative_u32(
                shared_input.get_index(INPUT_WORD_SHAPE_BANK_WORDS as u32),
                shape_bank_word_limit,
            );
            let sink_table_words = clamp_non_negative_u32(
                shared_input.get_index(INPUT_WORD_SINK_TABLE_WORDS as u32),
                sink_table_word_limit,
            );
            uniforms.view_proj[2][2] = shape_bank_words as f32;
            uniforms.view_proj[3][2] = sink_table_words as f32;
            uniforms.view_proj[3][3] = 0.0;
            self.last_shape_bank_words = shape_bank_words;
            self.last_sink_table_words = sink_table_words;
            self.sync_shape_bank_plane(shape_bank_words);
            self.draw_regions = self.sync_sink_table_plane_and_parse_regions(sink_table_words);
        } else {
            uniforms.time_seconds = (timestamp_ms.max(0.0) * 0.001) as f32;
            uniforms.delta_time_seconds = (1.0 / 60.0) as f32;
            self.last_shape_bank_words = 0;
            self.last_sink_table_words = 0;
            self.draw_regions = IndirectRegionPlan::default();
        }
        self.arena.update_uniforms(&self.queue, uniforms);
    }

    fn trigger_debug_readback(&self) {
        if self
            .debug_readback_in_flight
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let readback_gate = self.debug_readback_in_flight.clone();
        let slice = self.arena.debug_staging_buffer().slice(..);
        let staging_buffer_for_callback = self.arena.debug_staging_buffer().clone();
        let _ = slice.map_async(wgpu::MapMode::Read, move |result| {
            if result.is_ok() {
                let mapped = staging_buffer_for_callback.slice(..).get_mapped_range();
                let preview_f32_count = (mapped.len() / std::mem::size_of::<f32>()).min(24);
                if preview_f32_count > 0 {
                    let mut preview = String::new();
                    for index in 0..preview_f32_count {
                        if index > 0 {
                            preview.push_str(", ");
                        }
                        let byte_index = index * std::mem::size_of::<f32>();
                        let value = f32::from_le_bytes([
                            mapped[byte_index],
                            mapped[byte_index + 1],
                            mapped[byte_index + 2],
                            mapped[byte_index + 3],
                        ]);
                        preview.push_str(&format!("{value:.3}"));
                    }
                    // [LAW:single-enforcer] exception: temporary observability log
                    // for instance payload verification during migration.
                    console::info_1(&JsValue::from_str(&format!(
                        "[instancePreview] {}",
                        preview
                    )));
                }
                drop(mapped);
            }
            staging_buffer_for_callback.unmap();
            readback_gate.store(false, Ordering::SeqCst);
        });
    }

    pub fn take_frame_pacing_packet(&mut self) -> Option<WorkerObservabilityPacket> {
        // [LAW:single-enforcer] Scheduler is the only lifecycle/timing authority,
        // so all observability packets are drained from one owner.
        self.scheduler
            .take_observability_packet(worker_monotonic_now_ms())
    }

    pub fn inject_poison_alloc(&self) {
        let _guard = StrictAllocator::hot_path_guard();
        let _poison = Vec::<u8>::with_capacity(32);
    }
}
