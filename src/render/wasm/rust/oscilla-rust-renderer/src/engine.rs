use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use js_sys::{Atomics, Float32Array, Int32Array, SharedArrayBuffer, Uint32Array};
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use web_sys::console;
use web_sys::OffscreenCanvas;

use crate::allocator::StrictAllocator;
use crate::compute::{CompilerComputePassSpec, ComputeDispatcher};
use crate::default_shaders::{
    DEFAULT_ASSEMBLY_WGSL, DEFAULT_SIMULATION_WGSL, DEFAULT_UBER_SHADER_WGSL,
};
use crate::error_boundary::{send_engine_error, EngineErrorPayload};
use crate::memory::{
    GpuMemoryArena, INDIRECT_INDEXED_STRIDE_WORDS, INDIRECT_NON_INDEXED_STRIDE_WORDS,
    SHAPE_BANK_HEADER_WORDS, SINK_TABLE_DESCRIPTOR_WORDS, SINK_TABLE_HEADER_WORDS,
    SINK_TABLE_RECORD_WORDS,
};
use crate::render::{
    DepthTarget, IndirectRegionPlan, MsaaColorTarget, RenderDispatcher, CANONICAL_MSAA_SAMPLE_COUNT,
};
use crate::scheduler::WorkerScheduler;
use crate::telemetry::{
    build_scheduler_telemetry as build_scheduler_telemetry_packet, IndirectArgsRecord,
    ReadbackRenderCounters, ReadbackSnapshot, SchedulerState, SchedulerTelemetry,
    SchedulerTelemetryInputs, StageTimingsMs, WorkerObservabilityPacket,
};

const INPUT_WORD_WIDTH: usize = 0;
const INPUT_WORD_HEIGHT: usize = 1;
const INPUT_WORD_ZOOM: usize = 2;
const INPUT_WORD_PAN_X: usize = 3;
const INPUT_WORD_PAN_Y: usize = 4;
// INPUT_WORD_TIME_MS (index 5) is intentionally unused — the worker owns
// animation time via its rAF timestamp, not the main-thread's relayed value.
const INPUT_WORD_SINK_TABLE_WORDS: usize = 13;
const INPUT_WORD_SHAPE_BANK_WORDS: usize = 14;
const INPUT_WORD_INSTALL_REVISION: usize = 15;

// Camera parameters — written by CameraResolver on the JS main thread.
// [LAW:one-source-of-truth] Layout mirrors RUNTIME_INPUT_INDEX in
// src/render/rust/runtime-input-layout.ts — keep in sync.
const INPUT_WORD_CAMERA_PROJECTION: usize = 19;
const INPUT_WORD_CAMERA_CENTER_X: usize = 20;
const INPUT_WORD_CAMERA_CENTER_Y: usize = 21;
const INPUT_WORD_CAMERA_DISTANCE: usize = 22;
const INPUT_WORD_CAMERA_TILT_RAD: usize = 23;
const INPUT_WORD_CAMERA_YAW_RAD: usize = 24;
const INPUT_WORD_CAMERA_FOV_Y_RAD: usize = 25;
const INPUT_WORD_CAMERA_NEAR: usize = 26;
const INPUT_WORD_CAMERA_FAR: usize = 27;

const INPUT_SIGNAL_WORDS: u32 = 4;
const INPUT_FLOAT_WORDS: u32 = 32;

/// Build a 4x4 orthographic view-projection matrix incorporating
/// viewport dimensions, zoom, pan, and camera center offset.
///
/// For default camera (center 0.5, 0.5) and no pan, maps [0,1]² world
/// space to [-1,1]² clip space — identical to the legacy hardcoded matrix.
///
/// Camera center shifts the focal point: center_x=0.3 means the viewport
/// is centered on world x=0.3 rather than the default 0.5.
fn build_ortho_vp(
    viewport_width: f32,
    viewport_height: f32,
    zoom: f32,
    pan_x_px: f32,
    pan_y_px: f32,
    camera_center_x: f32,
    camera_center_y: f32,
) -> [[f32; 4]; 4] {
    // Scale: maps [0,1] → [-1,1] with zoom applied
    let sx = 2.0 * zoom;
    let sy = -2.0 * zoom;

    // Translation: pan + camera center offset
    // Camera center shifts the view: at center=(0.5,0.5) the offset is zero.
    let center_offset_x = (camera_center_x - 0.5) * 2.0 * zoom;
    let center_offset_y = (camera_center_y - 0.5) * 2.0 * zoom;
    let tx = -zoom + (2.0 * zoom * (pan_x_px / viewport_width)) - center_offset_x;
    let ty = zoom - (2.0 * zoom * (pan_y_px / viewport_height)) + center_offset_y;

    let mut m = [[0.0_f32; 4]; 4];
    m[0][0] = sx;
    m[1][1] = sy;
    // Map world Z [-1, 1] → NDC Z [0, 1] so negative Z isn't clipped
    m[2][2] = 0.5;
    m[3][0] = tx;
    m[3][1] = ty;
    m[3][2] = 0.5;
    m[3][3] = 1.0;
    m
}

/// 4x4 matrix multiply (column-major, matching WGSL mat4x4 layout).
fn mat4_mul(a: &[[f32; 4]; 4], b: &[[f32; 4]; 4]) -> [[f32; 4]; 4] {
    let mut m = [[0.0_f32; 4]; 4];
    for col in 0..4 {
        for row in 0..4 {
            m[col][row] = a[0][row] * b[col][0]
                + a[1][row] * b[col][1]
                + a[2][row] * b[col][2]
                + a[3][row] * b[col][3];
        }
    }
    m
}

/// Build a 4x4 perspective view-projection matrix.
///
/// Camera position is derived from spherical coordinates around a target
/// point. The view matrix uses a standard right-handed lookAt, and the
/// projection uses WebGPU NDC conventions (Z range [0, 1]).
fn build_perspective_vp(
    viewport_width: f32,
    viewport_height: f32,
    zoom: f32,
    pan_x_px: f32,
    pan_y_px: f32,
    center_x: f32,
    center_y: f32,
    distance: f32,
    tilt_rad: f32,
    yaw_rad: f32,
    fov_y_rad: f32,
    near: f32,
    far: f32,
) -> [[f32; 4]; 4] {
    // Pan offset: convert pixel pan to world-space camera target offset.
    // Simpler than ortho's (pan / viewport * 2 * zoom) because perspective
    // handles zoom via camera distance (distance / zoom), not matrix scaling.
    let pan_world_x = -pan_x_px / viewport_width;
    let pan_world_y = -pan_y_px / viewport_height;

    // Target point in world space (Z=0 canonical 2D plane), shifted by pan.
    let target = [center_x + pan_world_x, center_y + pan_world_y, 0.0_f32];

    // Zoom scales the camera distance (closer = more zoomed in).
    let effective_distance = distance / zoom.max(0.01);

    // Camera position from spherical coords around target
    let cos_tilt = tilt_rad.cos();
    let sin_tilt = tilt_rad.sin();
    let cos_yaw = yaw_rad.cos();
    let sin_yaw = yaw_rad.sin();
    let eye = [
        target[0] + effective_distance * cos_tilt * sin_yaw,
        target[1] + effective_distance * sin_tilt,
        target[2] + effective_distance * cos_tilt * cos_yaw,
    ];

    // --- View matrix (lookAt, right-handed) ---
    let up = [0.0_f32, 1.0, 0.0];
    let fwd = [
        target[0] - eye[0],
        target[1] - eye[1],
        target[2] - eye[2],
    ];
    let fwd_len = (fwd[0] * fwd[0] + fwd[1] * fwd[1] + fwd[2] * fwd[2]).sqrt().max(1e-10);
    let f = [fwd[0] / fwd_len, fwd[1] / fwd_len, fwd[2] / fwd_len];

    // right = normalize(cross(f, up))
    let rx = f[1] * up[2] - f[2] * up[1];
    let ry = f[2] * up[0] - f[0] * up[2];
    let rz = f[0] * up[1] - f[1] * up[0];
    let r_len = (rx * rx + ry * ry + rz * rz).sqrt().max(1e-10);
    let r = [rx / r_len, ry / r_len, rz / r_len];

    // true_up = cross(r, f)
    let u = [
        r[1] * f[2] - r[2] * f[1],
        r[2] * f[0] - r[0] * f[2],
        r[0] * f[1] - r[1] * f[0],
    ];

    let view: [[f32; 4]; 4] = [
        [r[0], u[0], -f[0], 0.0],
        [r[1], u[1], -f[1], 0.0],
        [r[2], u[2], -f[2], 0.0],
        [
            -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]),
            -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]),
            f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2],
            1.0,
        ],
    ];

    // --- Projection matrix (perspective, WebGPU Z range [0, 1]) ---
    let aspect = viewport_width / viewport_height.max(1.0);
    let half_fov = fov_y_rad * 0.5;
    let f_val = 1.0 / half_fov.tan().max(1e-10);
    let depth_range = far - near;
    let depth_scale = if depth_range.abs() > 1e-10 {
        far / depth_range
    } else {
        1.0
    };

    // Right-handed perspective for WebGPU NDC (Z [0, 1]):
    // - view_z is negative for objects in front → proj[2][3] = -1.0 for positive clip_w
    // - Y is negated to match the ortho convention (world Y-up → screen Y-down)
    let proj: [[f32; 4]; 4] = [
        [f_val / aspect, 0.0, 0.0, 0.0],
        [0.0, -f_val, 0.0, 0.0],
        [0.0, 0.0, -depth_scale, -1.0],
        [0.0, 0.0, -near * depth_scale, 0.0],
    ];

    mat4_mul(&proj, &view)
}

fn debug_readback_interval_frames_from_hz(debug_readback_hz: u32) -> u64 {
    // [LAW:one-source-of-truth] Debug readback cadence conversion is defined
    // once so bootstrap and runtime toggles cannot drift.
    if debug_readback_hz == 0 {
        0
    } else {
        (60 / debug_readback_hz.max(1)).max(1) as u64
    }
}

pub struct EngineConfig {
    pub max_particles: usize,
    pub max_shapes: usize,
    pub debug_readback_hz: u32,
}

pub struct PipelineRebuildFailure {
    pub code: &'static str,
    pub pass_id: String,
    pub message: String,
}

pub struct Engine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    surface_format: wgpu::TextureFormat,
    sample_count: u32,
    msaa_color_target: Option<MsaaColorTarget>,
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
    // [RECOVER-10] Separate in-flight gate for indirect-args readback so both
    // staging buffers can overlap async map operations independently.
    indirect_readback_in_flight: Arc<AtomicBool>,
    // [RECOVER-10] [LAW:single-enforcer] Accumulated readback snapshot polled
    // by the worker via take_readback_snapshot, mirroring scheduler telemetry.
    pending_readback: Arc<std::sync::Mutex<Option<ReadbackSnapshot>>>,
    max_particles: u32,
    max_shapes: u32,
    draw_regions: IndirectRegionPlan,
    last_shape_bank_words: u32,
    last_sink_table_words: u32,
    last_shape_header_sample: Vec<u32>,
    last_shape_cp_resolution_sample: Vec<u32>,
    sink_pointer_map: HashMap<SinkPointerKey, String>,
    last_install_revision: u32,
    pending_fatal_gpu_error: Arc<AtomicBool>,
    // [LAW:one-source-of-truth] Worker-owned animation time. The worker's own
    // rAF timestamp is the timing authority — not the main thread's timestamp
    // relayed via SharedArrayBuffer. This decouples animation smoothness from
    // main-thread scheduling jitter (React, MobX, GC pauses).
    prev_tick_timestamp_ms: f64,
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

fn parse_finite_u32(value: f64, context: &str) -> u32 {
    // [LAW:no-silent-fallbacks] Invalid shared-plane metadata must fail fast;
    // clamping hides contract violations and desynchronizes runtime ownership.
    if !value.is_finite() {
        panic!("{context} must be finite (value={value})");
    }
    if value < 0.0 {
        panic!("{context} must be non-negative (value={value})");
    }
    let floored = value.floor();
    if (value - floored).abs() > f64::EPSILON {
        panic!("{context} must be an integer (value={value})");
    }
    if floored > u32::MAX as f64 {
        panic!("{context} exceeds u32 max (value={value})");
    }
    floored as u32
}

fn extract_pass_id_from_message(message: &str) -> String {
    let Some(start) = message.find("pass \"") else {
        return "<bundle>".to_string();
    };
    let quoted = &message[(start + "pass \"".len())..];
    let Some(end) = quoted.find('"') else {
        return "<bundle>".to_string();
    };
    quoted[..end].to_string()
}

fn supports_msaa_x4(adapter: &wgpu::Adapter, format: wgpu::TextureFormat) -> bool {
    adapter
        .get_texture_format_features(format)
        .flags
        .contains(wgpu::TextureFormatFeatureFlags::MULTISAMPLE_X4)
}

fn resolve_sample_count(adapter: &wgpu::Adapter, surface_format: wgpu::TextureFormat) -> u32 {
    let surface_supports_x4 = supports_msaa_x4(adapter, surface_format);
    let depth_supports_x4 = supports_msaa_x4(adapter, wgpu::TextureFormat::Depth32Float);
    if surface_supports_x4 && depth_supports_x4 {
        CANONICAL_MSAA_SAMPLE_COUNT
    } else {
        1
    }
}

fn create_msaa_color_target(
    device: &wgpu::Device,
    surface_format: wgpu::TextureFormat,
    width: u32,
    height: u32,
    sample_count: u32,
) -> Option<MsaaColorTarget> {
    if sample_count > 1 {
        return Some(MsaaColorTarget::new(
            device,
            surface_format,
            width,
            height,
            sample_count,
        ));
    }
    None
}

// [RECOVER-07] Descriptor word offsets for total_instance_count derivation.
// RECOVER-05 zeroed all record fields; instance counts live in descriptors.
const DESCRIPTOR_WORD_POSITION_BASE_OFFSET: usize = 0;
const DESCRIPTOR_WORD_POSITION_LANE_STRIDE: usize = 1;
const DESCRIPTOR_WORD_POSITION_COMPONENT_STRIDE: usize = 2;
const DESCRIPTOR_WORD_COLOR_BASE_OFFSET: usize = 3;
const DESCRIPTOR_WORD_COLOR_LANE_STRIDE: usize = 4;
const DESCRIPTOR_WORD_COLOR_COMPONENT_STRIDE: usize = 5;
const DESCRIPTOR_WORD_SCALE_BASE_OFFSET: usize = 6;
const DESCRIPTOR_WORD_SCALE_LANE_STRIDE: usize = 7;
const DESCRIPTOR_WORD_SCALE_COMPONENT_STRIDE: usize = 8;
const DESCRIPTOR_WORD_ROTATION_MODE: usize = 9;
const DESCRIPTOR_WORD_ROTATION_BASE_OFFSET: usize = 10;
const DESCRIPTOR_WORD_ROTATION_LANE_STRIDE: usize = 11;
const DESCRIPTOR_WORD_ROTATION_COMPONENT_STRIDE: usize = 12;
const DESCRIPTOR_WORD_SCALE2_MODE: usize = 14;
const DESCRIPTOR_WORD_SCALE2_BASE_OFFSET: usize = 15;
const DESCRIPTOR_WORD_SCALE2_LANE_STRIDE: usize = 16;
const DESCRIPTOR_WORD_SCALE2_COMPONENT_STRIDE: usize = 17;
const DESCRIPTOR_WORD_SHAPE_SLOT_BASE_OFFSET: usize = 20;
const DESCRIPTOR_WORD_SHAPE_SLOT_LANE_STRIDE: usize = 21;
const DESCRIPTOR_WORD_SHAPE_SLOT_COMPONENT_STRIDE: usize = 22;
const DESCRIPTOR_WORD_INSTANCE_COUNT_MODE: usize = 23;
const DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT: usize = 24;
const DESCRIPTOR_WORD_SHAPE_WORD_OFFSET: usize = 25;
const DESCRIPTOR_WORD_POSITION_Z_MODE: usize = 26;
const DESCRIPTOR_WORD_POSITION_Z_BASE_OFFSET: usize = 27;
const DESCRIPTOR_WORD_POSITION_Z_LANE_STRIDE: usize = 28;
const DESCRIPTOR_WORD_POSITION_Z_COMPONENT_STRIDE: usize = 29;
const INSTANCE_COUNT_MODE_STATIC: u32 = 0;
const OPTIONAL_MODE_SLOT: u32 = 1;

const SHAPE_WORD_KIND: usize = 0;
const SHAPE_WORD_TOPOLOGY_MODE: usize = 1;
const SHAPE_WORD_CP_ARENA_BASE_OFFSET: usize = 11;
const SHAPE_WORD_CP_ARENA_LANE_STRIDE: usize = 14;
const SHAPE_WORD_CP_ARENA_COMPONENT_STRIDE: usize = 15;

const SHAPE_CLASS_TYPE1_RIGID: u32 = 1;
const SHAPE_CLASS_TYPE2_PARAMETRIC: u32 = 2;
const TOPOLOGY_MODE_NON_PATH: u32 = 0;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum SinkPointerSemantic {
    Position,
    Color,
    Scale,
    Rotation,
    Scale2,
    PositionZ,
    Shape,
}

impl SinkPointerSemantic {
    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "position" => Some(Self::Position),
            "color" => Some(Self::Color),
            "scale" => Some(Self::Scale),
            "rotation" => Some(Self::Rotation),
            "scale2" => Some(Self::Scale2),
            "positionZ" => Some(Self::PositionZ),
            "shape" => Some(Self::Shape),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Position => "position",
            Self::Color => "color",
            Self::Scale => "scale",
            Self::Rotation => "rotation",
            Self::Scale2 => "scale2",
            Self::PositionZ => "positionZ",
            Self::Shape => "shape",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct SinkPointerKey {
    record_index: usize,
    semantic: SinkPointerSemantic,
}

impl Engine {
    fn resolve_resource_to_physical_words(
        &self,
        resource_id: &str,
        context: &str,
    ) -> (u32, u32, u32) {
        let resolved = self
            .arena
            .symbol_resolver
            .resolve(resource_id)
            .unwrap_or_else(|| panic!("sink table {} references unknown resource {}", context, resource_id));
        match resolved.storage_location {
            crate::memory::ResourceStorageLocation::Arena => {}
            // [LAW:no-silent-fallbacks] Draw-prep descriptors target render
            // input slots only; non-arena resources are invalid here.
            crate::memory::ResourceStorageLocation::State => {
                panic!(
                    "sink table {} resource {} resolves to state storage (expected arena)",
                    context, resource_id
                );
            }
            crate::memory::ResourceStorageLocation::GlobalControlUbo => {
                panic!(
                    "sink table {} resource {} resolves to GlobalControlUbo (expected arena)",
                    context, resource_id
                );
            }
            crate::memory::ResourceStorageLocation::Texture2D => {
                panic!(
                    "sink table {} resource {} resolves to Texture2D (expected arena)",
                    context, resource_id
                );
            }
        }
        (
            resolved.base_offset_bytes / 4,
            resolved.lane_stride_bytes / 4,
            resolved.component_stride_bytes / 4,
        )
    }

    fn resolve_slot_to_physical_words(
        &self,
        slot_id: u32,
        context: &str,
    ) -> (u32, u32, u32) {
        let resource_id = format!("arena:slot:{}", slot_id);
        self.resolve_resource_to_physical_words(&resource_id, context)
    }

    fn parse_sink_pointer_key(raw_key: &str) -> Result<SinkPointerKey, String> {
        let mut parts = raw_key.split(':');
        let record_part = parts
            .next()
            .ok_or_else(|| format!("sink pointer key '{}' is missing record index", raw_key))?;
        let semantic_part = parts
            .next()
            .ok_or_else(|| format!("sink pointer key '{}' is missing semantic", raw_key))?;
        if parts.next().is_some() {
            return Err(format!(
                "sink pointer key '{}' must use '<record>:<semantic>' format",
                raw_key
            ));
        }
        let record_index = record_part.parse::<usize>().map_err(|_| {
            format!(
                "sink pointer key '{}' has invalid record index '{}'",
                raw_key, record_part
            )
        })?;
        let semantic = SinkPointerSemantic::parse(semantic_part).ok_or_else(|| {
            format!(
                "sink pointer key '{}' has unknown semantic '{}'",
                raw_key, semantic_part
            )
        })?;
        Ok(SinkPointerKey {
            record_index,
            semantic,
        })
    }

    pub fn set_sink_pointer_map(
        &mut self,
        sink_pointer_map: HashMap<String, String>,
    ) -> Result<(), String> {
        let mut parsed: HashMap<SinkPointerKey, String> = HashMap::new();
        for (raw_key, raw_resource_id) in sink_pointer_map {
            let key = Self::parse_sink_pointer_key(raw_key.as_str())?;
            let resource_id = raw_resource_id.trim();
            if resource_id.is_empty() {
                return Err(format!(
                    "sink pointer key '{}' maps to empty resource ID",
                    raw_key
                ));
            }
            if parsed.insert(key, resource_id.to_string()).is_some() {
                return Err(format!("sink pointer key '{}' is duplicated", raw_key));
            }
        }
        // [LAW:one-source-of-truth] Sink descriptor symbolic pointer ownership
        // is centralized in engine state and consumed by one MMU patch boundary.
        self.sink_pointer_map = parsed;
        Ok(())
    }

    fn sink_pointer_resource_id(
        &self,
        record_index: usize,
        semantic: SinkPointerSemantic,
    ) -> Result<&str, String> {
        let key = SinkPointerKey {
            record_index,
            semantic,
        };
        self.sink_pointer_map
            .get(&key)
            .map(|resource_id| resource_id.as_str())
            .ok_or_else(|| {
                format!(
                    "sink pointer map missing key '{}:{}'",
                    record_index,
                    semantic.as_str()
                )
            })
    }

    fn patch_sink_descriptor_triplet(
        &self,
        plane_words: &mut [u32],
        descriptor_base: usize,
        base_word: usize,
        lane_word: usize,
        component_word: usize,
        record_index: usize,
        semantic: SinkPointerSemantic,
    ) -> Result<(), String> {
        let resource_id = self.sink_pointer_resource_id(record_index, semantic)?;
        let (base, lane, component) = self.resolve_resource_to_physical_words(resource_id, semantic.as_str());
        plane_words[descriptor_base + base_word] = base;
        plane_words[descriptor_base + lane_word] = lane;
        plane_words[descriptor_base + component_word] = component;
        Ok(())
    }

    fn resolve_sink_descriptor_symbols(
        &self,
        plane_words: &mut [u32],
        total_record_count: usize,
    ) -> Result<(), String> {
        // [LAW:single-enforcer] Sink descriptor physical address resolution is
        // owned by Rust MMU at the renderer boundary.
        let descriptor_region_base =
            SINK_TABLE_HEADER_WORDS + total_record_count * SINK_TABLE_RECORD_WORDS;
        for record in 0..total_record_count {
            let descriptor_base = descriptor_region_base + record * SINK_TABLE_DESCRIPTOR_WORDS;
            if descriptor_base + SINK_TABLE_DESCRIPTOR_WORDS > plane_words.len() {
                break;
            }

            self.patch_sink_descriptor_triplet(
                plane_words,
                descriptor_base,
                DESCRIPTOR_WORD_POSITION_BASE_OFFSET,
                DESCRIPTOR_WORD_POSITION_LANE_STRIDE,
                DESCRIPTOR_WORD_POSITION_COMPONENT_STRIDE,
                record,
                SinkPointerSemantic::Position,
            )?;

            self.patch_sink_descriptor_triplet(
                plane_words,
                descriptor_base,
                DESCRIPTOR_WORD_COLOR_BASE_OFFSET,
                DESCRIPTOR_WORD_COLOR_LANE_STRIDE,
                DESCRIPTOR_WORD_COLOR_COMPONENT_STRIDE,
                record,
                SinkPointerSemantic::Color,
            )?;

            self.patch_sink_descriptor_triplet(
                plane_words,
                descriptor_base,
                DESCRIPTOR_WORD_SCALE_BASE_OFFSET,
                DESCRIPTOR_WORD_SCALE_LANE_STRIDE,
                DESCRIPTOR_WORD_SCALE_COMPONENT_STRIDE,
                record,
                SinkPointerSemantic::Scale,
            )?;

            let rotation_mode = plane_words[descriptor_base + DESCRIPTOR_WORD_ROTATION_MODE];
            if rotation_mode == OPTIONAL_MODE_SLOT {
                self.patch_sink_descriptor_triplet(
                    plane_words,
                    descriptor_base,
                    DESCRIPTOR_WORD_ROTATION_BASE_OFFSET,
                    DESCRIPTOR_WORD_ROTATION_LANE_STRIDE,
                    DESCRIPTOR_WORD_ROTATION_COMPONENT_STRIDE,
                    record,
                    SinkPointerSemantic::Rotation,
                )?;
            }

            let scale2_mode = plane_words[descriptor_base + DESCRIPTOR_WORD_SCALE2_MODE];
            if scale2_mode == OPTIONAL_MODE_SLOT {
                self.patch_sink_descriptor_triplet(
                    plane_words,
                    descriptor_base,
                    DESCRIPTOR_WORD_SCALE2_BASE_OFFSET,
                    DESCRIPTOR_WORD_SCALE2_LANE_STRIDE,
                    DESCRIPTOR_WORD_SCALE2_COMPONENT_STRIDE,
                    record,
                    SinkPointerSemantic::Scale2,
                )?;
            }

            let position_z_mode = plane_words[descriptor_base + DESCRIPTOR_WORD_POSITION_Z_MODE];
            if position_z_mode == OPTIONAL_MODE_SLOT {
                self.patch_sink_descriptor_triplet(
                    plane_words,
                    descriptor_base,
                    DESCRIPTOR_WORD_POSITION_Z_BASE_OFFSET,
                    DESCRIPTOR_WORD_POSITION_Z_LANE_STRIDE,
                    DESCRIPTOR_WORD_POSITION_Z_COMPONENT_STRIDE,
                    record,
                    SinkPointerSemantic::PositionZ,
                )?;
            }

            self.patch_sink_descriptor_triplet(
                plane_words,
                descriptor_base,
                DESCRIPTOR_WORD_SHAPE_SLOT_BASE_OFFSET,
                DESCRIPTOR_WORD_SHAPE_SLOT_LANE_STRIDE,
                DESCRIPTOR_WORD_SHAPE_SLOT_COMPONENT_STRIDE,
                record,
                SinkPointerSemantic::Shape,
            )?;
        }
        Ok(())
    }

    fn resolve_shape_bank_control_point_slots(
        &self,
        shape_bank_words: &mut [u32],
        shape_word_offsets: &[u32],
    ) -> Option<[u32; 5]> {
        // [LAW:single-enforcer] ShapeBank control-point address resolution is
        // owned by Rust MMU at renderer install boundary.
        let mut first_resolution_sample: Option<[u32; 5]> = None;
        let mut offsets: Vec<usize> = shape_word_offsets
            .iter()
            .map(|offset| *offset as usize)
            .collect();
        offsets.sort_unstable();
        offsets.dedup();

        for shape_word_offset in offsets {
            if shape_word_offset + SHAPE_BANK_HEADER_WORDS > shape_bank_words.len() {
                panic!(
                    "shape bank handle {} out of bounds for {} words",
                    shape_word_offset,
                    shape_bank_words.len()
                );
            }

            let kind = shape_bank_words[shape_word_offset + SHAPE_WORD_KIND];
            if kind != SHAPE_CLASS_TYPE1_RIGID && kind != SHAPE_CLASS_TYPE2_PARAMETRIC {
                continue;
            }

            let topology_mode = shape_bank_words[shape_word_offset + SHAPE_WORD_TOPOLOGY_MODE];
            let needs_control_points =
                kind == SHAPE_CLASS_TYPE2_PARAMETRIC || topology_mode != TOPOLOGY_MODE_NON_PATH;
            if !needs_control_points {
                continue;
            }

            let control_point_slot_id =
                shape_bank_words[shape_word_offset + SHAPE_WORD_CP_ARENA_BASE_OFFSET];
            if first_resolution_sample.is_none() {
                first_resolution_sample = Some([
                    shape_word_offset as u32,
                    control_point_slot_id,
                    u32::MAX,
                    0,
                    0,
                ]);
            }
            let context = format!("shape-bank cp header @{}", shape_word_offset);
            let (base_words, lane_words, component_words) =
                self.resolve_slot_to_physical_words(control_point_slot_id, &context);
            shape_bank_words[shape_word_offset + SHAPE_WORD_CP_ARENA_BASE_OFFSET] = base_words;
            shape_bank_words[shape_word_offset + SHAPE_WORD_CP_ARENA_LANE_STRIDE] = lane_words;
            shape_bank_words[shape_word_offset + SHAPE_WORD_CP_ARENA_COMPONENT_STRIDE] =
                component_words;
            if first_resolution_sample.is_some() {
                first_resolution_sample = Some([
                    shape_word_offset as u32,
                    control_point_slot_id,
                    base_words,
                    lane_words,
                    component_words,
                ]);
            }
        }
        first_resolution_sample
    }

    pub async fn new(
        canvas: OffscreenCanvas,
        config: EngineConfig,
        initial_width: u32,
        initial_height: u32,
    ) -> Result<Self, JsValue> {
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
        let pending_fatal_gpu_error = Arc::new(AtomicBool::new(false));
        let pending_fatal_gpu_error_for_callback = pending_fatal_gpu_error.clone();

        // [LAW:single-enforcer] Asynchronous WebGPU validation/internal/OOM
        // faults are classified and emitted through one runtime error boundary.
        device.on_uncaptured_error(Box::new(move |error| {
            let payload = match error {
                wgpu::Error::Validation {
                    source: _,
                    description,
                } => EngineErrorPayload::new("WEBGPU_VALIDATION", description, "GPU_DRIVER", true),
                wgpu::Error::OutOfMemory { source: _ } => {
                    EngineErrorPayload::new("WEBGPU_OOM", "GPU out of memory", "GPU_DRIVER", true)
                }
                wgpu::Error::Internal {
                    source: _,
                    description,
                } => EngineErrorPayload::new("WEBGPU_INTERNAL", description, "GPU_DRIVER", true),
            };
            if payload.fatal {
                pending_fatal_gpu_error_for_callback.store(true, Ordering::SeqCst);
            }
            send_engine_error(&payload);
        }));

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
        // [LAW:one-source-of-truth] Initial surface dimensions come from the
        // bootstrap caller (OffscreenCanvas size at transfer time). Subsequent
        // resizes are driven by shared-buffer reads in input_marshal_phase.
        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: initial_width.max(1),
            height: initial_height.max(1),
            present_mode,
            desired_maximum_frame_latency: 2,
            alpha_mode,
            view_formats: vec![],
        };
        surface.configure(&device, &surface_config);
        let sample_count = resolve_sample_count(&adapter, surface_config.format);
        if sample_count != CANONICAL_MSAA_SAMPLE_COUNT {
            // [LAW:no-silent-fallbacks] When 4x MSAA is unsupported, emit an
            // explicit diagnostic instead of silently degrading quality.
            console::warn_1(&JsValue::from_str(
                "WebGPU adapter lacks 4x MSAA support for color/depth targets; using sample_count=1",
            ));
        }
        let msaa_color_target = create_msaa_color_target(
            &device,
            surface_config.format,
            surface_config.width,
            surface_config.height,
            sample_count,
        );

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
            sample_count,
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
            &render.arena_render_layout,
            config.max_particles,
            config.max_shapes,
        );
        arena.clear_simulation_planes(&queue);
        let depth_target = DepthTarget::new(
            &device,
            surface_config.width,
            surface_config.height,
            sample_count,
        );
        let debug_readback_interval_frames =
            debug_readback_interval_frames_from_hz(config.debug_readback_hz);
        let scheduler = WorkerScheduler::new(worker_monotonic_now_ms());

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            surface_format,
            sample_count,
            msaa_color_target,
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
            indirect_readback_in_flight: Arc::new(AtomicBool::new(false)),
            pending_readback: Arc::new(std::sync::Mutex::new(None)),
            max_particles: config.max_particles as u32,
            max_shapes: config.max_shapes as u32,
            draw_regions: IndirectRegionPlan::default(),
            last_shape_bank_words: 0,
            last_sink_table_words: 0,
            last_shape_header_sample: Vec::new(),
            last_shape_cp_resolution_sample: Vec::new(),
            sink_pointer_map: HashMap::new(),
            last_install_revision: 0,
            pending_fatal_gpu_error,
            prev_tick_timestamp_ms: 0.0,
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
            .resize(&self.device, safe_width, safe_height, self.sample_count);
        if let Some(msaa_color_target) = self.msaa_color_target.as_mut() {
            msaa_color_target.resize(
                &self.device,
                self.surface_format,
                safe_width,
                safe_height,
                self.sample_count,
            );
        }
    }

    pub fn pause(&mut self) {
        self.scheduler.mark_paused(worker_monotonic_now_ms());
    }

    pub fn resume(&mut self) {
        // [LAW:one-source-of-truth] Reset worker-owned time anchor so the
        // first post-resume tick uses nominal dt instead of the pause gap.
        self.prev_tick_timestamp_ms = 0.0;
        self.scheduler.mark_running(worker_monotonic_now_ms());
    }

    pub fn set_debug_readback_hz(&mut self, debug_readback_hz: u32) {
        self.debug_readback_interval_frames =
            debug_readback_interval_frames_from_hz(debug_readback_hz);
    }

    // [RECOVER-11] Upload MSDF atlas data to the GPU atlas storage buffer.
    // Data layout: [0]=width, [1]=height, [2..]=packed RGBA pixels (1 u32 per pixel).
    pub fn upload_atlas_data(&mut self, data: &[u32]) {
        self.arena.write_atlas_data(&self.device, &self.queue, data);
    }

    pub async fn rebuild_gpu_pipelines(
        &mut self,
        pass_specs: &[CompilerComputePassSpec],
    ) -> Result<(), PipelineRebuildFailure> {
        // [LAW:single-enforcer] Compiler-owned GPU pass artifacts are published
        // at one engine boundary so runtime hot path never recompiles ad hoc.
        if let Some(memory_manifest) = pass_specs
            .iter()
            .find_map(|spec| spec.memory_manifest.as_ref())
        {
            // [LAW:one-source-of-truth] Draw-prep descriptor resolution uses
            // the same compile-owned memory manifest used for shader lowering.
            let resolver = crate::memory::SymbolResolver::build_from_manifest(memory_manifest);
            self.arena
                .rebuild_buffers_from_resolver(&self.device, &resolver);
            self.arena.symbol_resolver = resolver;
            // [LAW:one-source-of-truth] The sink pointer map carries symbolic
            // resource IDs, not physical addresses. The new SymbolResolver
            // resolves those same IDs to their updated physical locations, so
            // the map stays valid across arena rebuilds. The TS side owns the
            // dedup invariant: it only re-sends the map when compilation
            // produces different slot assignments (different JSON payload).
        }
        let staged = self
            .compute
            .stage_gpu_pipelines_with_compiler_wgsl(&self.device, pass_specs, self.max_particles)
            .await
            .map_err(|message| {
                self.build_pipeline_rebuild_failure("pipeline_contract_rejected", &message)
            })?;
        self.compute
            .activate_staged_gpu_pipelines(&self.device, staged)
            .await
            .map_err(|message| {
                self.build_pipeline_rebuild_failure("pipeline_activation_rejected", &message)
            })?;
        self.arena.clear_simulation_planes(&self.queue);
        Ok(())
    }

    pub fn should_schedule_next_frame(&self) -> bool {
        // [LAW:dataflow-not-control-flow] The worker loop uses one canonical
        // arm/resume path; bootstrap keeps cadence unarmed by leaving the
        // scheduler in Booting until shared runtime inputs are attached.
        matches!(
            self.scheduler.state(),
            SchedulerState::Running | SchedulerState::Paused
        ) && !self.pending_fatal_gpu_error.load(Ordering::SeqCst)
    }

    fn build_pipeline_rebuild_failure(
        &self,
        code: &'static str,
        message: &str,
    ) -> PipelineRebuildFailure {
        PipelineRebuildFailure {
            code,
            pass_id: extract_pass_id_from_message(message),
            message: message.to_string(),
        }
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
        if self.pending_fatal_gpu_error.swap(false, Ordering::SeqCst) {
            return self.finish_fatal(
                tick_start_ms,
                "uncaptured_gpu_error",
                "Fatal GPU error detected after queue submission",
                "GPU_DRIVER",
                self.build_scheduler_telemetry(stage_timings),
            );
        }
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
                instance_readback_armed: bool,
                indirect_readback_armed: bool,
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

                let draw_prep_record_count = self
                    .draw_regions
                    .indexed_record_count
                    .saturating_add(self.draw_regions.non_indexed_record_count);

                let simulation_stage_start_ms = worker_monotonic_now_ms();
                self.compute.encode_simulation_and_assembly(
                    &self.device,
                    &mut encoder,
                    &mut self.arena,
                    self.draw_regions.total_instance_count,
                );
                let simulation_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.simulation_dispatch_ms =
                    (simulation_stage_end_ms - simulation_stage_start_ms).max(0.0);
                let draw_prep_stage_start_ms = worker_monotonic_now_ms();
                // [LAW:dataflow-not-control-flow] Draw-prep emits per-frame indirect
                // instance counts; reset the target buffer before every draw-prep dispatch.
                encoder.clear_buffer(&self.arena.indirect_buffer, 0, None);
                self.compute
                    .encode_draw_prep(&mut encoder, &self.arena, draw_prep_record_count);
                let draw_prep_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.draw_prep_ms =
                    (draw_prep_stage_end_ms - draw_prep_stage_start_ms).max(0.0);

                let render_stage_start_ms = worker_monotonic_now_ms();
                self.render.encode_passes(
                    &mut encoder,
                    &self.arena,
                    &color_view,
                    self.msaa_color_target.as_ref().map(MsaaColorTarget::view),
                    self.depth_target.view(),
                    self.draw_regions,
                );
                let render_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.render_ms = (render_stage_end_ms - render_stage_start_ms).max(0.0);

                let is_debug_tick = self.debug_readback_interval_frames > 0
                    && self.frame_count % self.debug_readback_interval_frames == 0;
                let mut instance_readback_armed = false;
                let mut indirect_readback_armed = false;
                if is_debug_tick {
                    instance_readback_armed = self
                        .debug_readback_in_flight
                        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok();
                    indirect_readback_armed = self
                        .indirect_readback_in_flight
                        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok();

                    // [RECOVER-10] Copy instance buffer to instance staging.
                    if instance_readback_armed {
                        let instance_copy_bytes = self
                            .arena
                            .debug_staging_buffer()
                            .size()
                            .min(self.arena.instance_buffer.size());
                        encoder.copy_buffer_to_buffer(
                            &self.arena.instance_buffer,
                            0,
                            self.arena.debug_staging_buffer(),
                            0,
                            instance_copy_bytes,
                        );
                    }
                    // [RECOVER-10] Copy indirect args buffer to indirect staging.
                    if indirect_readback_armed {
                        let indirect_copy_bytes = self
                            .arena
                            .indirect_staging_buffer()
                            .size()
                            .min(self.arena.indirect_buffer.size());
                        encoder.copy_buffer_to_buffer(
                            &self.arena.indirect_buffer,
                            0,
                            self.arena.indirect_staging_buffer(),
                            0,
                            indirect_copy_bytes,
                        );
                    }
                }

                let swap_stage_start_ms = worker_monotonic_now_ms();
                self.queue.submit(std::iter::once(encoder.finish()));
                frame.present();
                let swap_stage_end_ms = worker_monotonic_now_ms();
                stage_timings.swap_ms = (swap_stage_end_ms - swap_stage_start_ms).max(0.0);
                self.frame_count = self.frame_count.wrapping_add(1);

                HotPathOutcome::Success {
                    debug_tick: is_debug_tick,
                    instance_readback_armed,
                    indirect_readback_armed,
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
                instance_readback_armed,
                indirect_readback_armed,
                frame_count,
                stage_timings,
            } => {
                // [LAW:single-enforcer] Async map callbacks can allocate in
                // browser glue and therefore run only after lock scope exits.
                if debug_tick {
                    self.trigger_debug_readback(instance_readback_armed, indirect_readback_armed);
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
        // TODO(#161): Move timeout/lost/fatal telemetry routing into a dedicated
        // telemetry boundary module shared with scheduler state transitions.
        // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/161
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
        // [LAW:one-source-of-truth] Telemetry packet shaping is centralized in
        // telemetry.rs, while engine.rs only publishes execution measurements.
        build_scheduler_telemetry_packet(
            stage_timings,
            SchedulerTelemetryInputs {
                simulation_dispatch_count: self.compute.simulation_dispatch_count(),
                simulation_workgroup_count: self.compute.simulation_workgroup_count(),
                indexed_record_count: self.draw_regions.indexed_record_count,
                non_indexed_record_count: self.draw_regions.non_indexed_record_count,
                total_instance_count: self.draw_regions.total_instance_count,
                shape_bank_word_count: self.last_shape_bank_words,
                sink_table_word_count: self.last_sink_table_words,
                canvas_width: self.surface_config.width,
                canvas_height: self.surface_config.height,
                ping_pong_index: self.arena.ping_pong_index() as u32,
            },
        )
    }

    fn sync_shape_bank_plane(&mut self, shape_bank_words: u32, shape_word_offsets: &[u32]) {
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
        // [RECOVER-04] Upload canonical ShapeBank words directly to topologyBank.
        // GPU vertex pulling reads control points from the topology buffer —
        // no CPU mesh realization needed.
        let mut canonical_words = shared_shape_bank.subarray(0, shape_bank_words).to_vec();
        self.last_shape_cp_resolution_sample.clear();
        if let Some(sample) =
            self.resolve_shape_bank_control_point_slots(&mut canonical_words, shape_word_offsets)
        {
            self.last_shape_cp_resolution_sample.extend_from_slice(&sample);
        }
        self.last_shape_header_sample.clear();
        if let Some(first_shape_word_offset) = shape_word_offsets.first() {
            let offset = *first_shape_word_offset as usize;
            if offset + SHAPE_BANK_HEADER_WORDS <= canonical_words.len() {
                self.last_shape_header_sample
                    .extend_from_slice(&canonical_words[offset..(offset + SHAPE_BANK_HEADER_WORDS)]);
            }
        }
        self.arena
            .write_shape_bank_words(&self.device, &self.queue, &canonical_words);
    }

    fn sync_sink_table_plane_and_parse_regions(
        &mut self,
        sink_table_words: u32,
    ) -> (IndirectRegionPlan, Vec<u32>) {
        let Some(shared_sink_table) = self.shared_sink_table.as_ref() else {
            return (IndirectRegionPlan::default(), Vec::new());
        };
        if sink_table_words == 0 {
            return (IndirectRegionPlan::default(), Vec::new());
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
        let minimum_record_words = (SINK_TABLE_HEADER_WORDS as u32)
            .saturating_add(total_record_count.saturating_mul(SINK_TABLE_RECORD_WORDS as u32));
        let minimum_descriptor_words =
            total_record_count.saturating_mul(SINK_TABLE_DESCRIPTOR_WORDS as u32);
        let minimum_words = minimum_record_words.saturating_add(minimum_descriptor_words);
        if sink_table_words < minimum_words {
            panic!(
                "sink table truncated (words={}, required={})",
                sink_table_words, minimum_words
            );
        }

        let total_record_count_usize = total_record_count as usize;
        let mut plane_words = shared_sink_table.subarray(0, sink_table_words).to_vec();
        self.resolve_sink_descriptor_symbols(&mut plane_words, total_record_count_usize)
            .unwrap_or_else(|error| panic!("sink pointer map resolution failed: {}", error));
        self.arena
            .write_sink_table_words(&self.device, &self.queue, &plane_words);
        // [RECOVER-07] Sum instance counts from descriptors, not zeroed record fields.
        // RECOVER-05 zeroed all record fields; StaticInstanceCount in descriptors
        // is the canonical source for assembly dispatch sizing.
        let descriptor_region_base =
            SINK_TABLE_HEADER_WORDS + total_record_count_usize * SINK_TABLE_RECORD_WORDS;
        let mut shape_word_offsets = Vec::with_capacity(total_record_count_usize);
        let mut total_instance_count: u32 = 0;
        for record in 0..total_record_count_usize {
            let descriptor_base = descriptor_region_base + record * SINK_TABLE_DESCRIPTOR_WORDS;
            if descriptor_base + DESCRIPTOR_WORD_SHAPE_WORD_OFFSET >= plane_words.len() {
                break;
            }
            shape_word_offsets.push(plane_words[descriptor_base + DESCRIPTOR_WORD_SHAPE_WORD_OFFSET]);
            let mode = plane_words[descriptor_base + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
            if mode == INSTANCE_COUNT_MODE_STATIC {
                total_instance_count = total_instance_count.saturating_add(
                    plane_words[descriptor_base + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT],
                );
            }
        }
        // [LAW:single-enforcer] Indirect args are authored by the canonical
        // GPU draw-prep pass; CPU mirror writes are intentionally removed.
        (
            IndirectRegionPlan {
                total_instance_count,
                indexed_record_count,
                non_indexed_record_count,
                indexed_region_base_words,
                non_indexed_region_base_words,
                indexed_stride_words,
                non_indexed_stride_words,
            },
            shape_word_offsets,
        )
    }

    fn input_marshal_phase(&mut self, timestamp_ms: f64) {
        // [LAW:one-source-of-truth] Surface dimensions are driven by the
        // shared input buffer — no separate RESIZE_CANVAS message needed.
        // Read dimensions before the shared_input borrow scope so we can
        // call resize_surface (which needs &mut self).
        if let Some(shared_input) = self.shared_input.as_ref() {
            let pixel_w = (shared_input.get_index(INPUT_WORD_WIDTH as u32) as u32).max(1);
            let pixel_h = (shared_input.get_index(INPUT_WORD_HEIGHT as u32) as u32).max(1);
            if pixel_w != self.surface_config.width || pixel_h != self.surface_config.height {
                self.resize_surface(pixel_w, pixel_h);
            }
        }

        // [LAW:one-source-of-truth] Worker-owned time: the worker's rAF
        // timestamp is the single timing authority. This decouples animation
        // smoothness from main-thread scheduling jitter (React, MobX, GC).
        let safe_timestamp_ms = timestamp_ms.max(0.0);
        let prev_ms = self.prev_tick_timestamp_ms;
        // [LAW:dataflow-not-control-flow] dt computation always produces a
        // value; the prev_ms == 0 sentinel yields dt=0 (no advancement) so
        // the first real dt comes from two consecutive rAF timestamps — never
        // from a baked refresh rate assumption.
        let delta_seconds = if prev_ms > 0.0 {
            let raw_dt = (safe_timestamp_ms - prev_ms).max(0.0) * 0.001;
            // Clamp dt to 2x the previous frame's dt (or 50ms hard cap) to
            // absorb occasional dropped frames without letting animations
            // jump after long stalls (tab backgrounding, debugger pauses).
            raw_dt.min(0.05) as f32
        } else {
            0.0_f32
        };
        self.prev_tick_timestamp_ms = safe_timestamp_ms;

        let mut header = self.arena.frame_header;
        // Time and dt are worker-owned — never read from SharedArrayBuffer.
        header.time_seconds = (safe_timestamp_ms * 0.001) as f32;
        header.delta_time_seconds = delta_seconds;

        if let Some(shared_input) = self.shared_input.as_ref() {
            if let Some(shared_input_signals) = self.shared_input_signals.as_ref() {
                // [LAW:single-enforcer] Frame input publication uses one atomic
                // signal word as the acquire fence before reading shared planes.
                let _ = Atomics::load::<Int32Array>(shared_input_signals, 0);
            }
            header.resolution[0] = shared_input.get_index(INPUT_WORD_WIDTH as u32) as f32;
            header.resolution[1] = shared_input.get_index(INPUT_WORD_HEIGHT as u32) as f32;
            let viewport_width = header.resolution[0].max(1.0);
            let viewport_height = header.resolution[1].max(1.0);
            let raw_zoom = shared_input.get_index(INPUT_WORD_ZOOM as u32) as f32;
            let zoom = if raw_zoom.is_finite() && raw_zoom > 0.0 {
                raw_zoom
            } else {
                1.0
            };
            let pan_x_px = shared_input.get_index(INPUT_WORD_PAN_X as u32) as f32;
            let pan_y_px = shared_input.get_index(INPUT_WORD_PAN_Y as u32) as f32;
            let safe_pan_x_px = if pan_x_px.is_finite() { pan_x_px } else { 0.0 };
            let safe_pan_y_px = if pan_y_px.is_finite() { pan_y_px } else { 0.0 };

            // Read camera parameters from shared input.
            // [LAW:one-source-of-truth] Camera param indices mirror
            // RUNTIME_INPUT_INDEX in runtime-input-layout.ts.
            let camera_center_x = {
                let v = shared_input.get_index(INPUT_WORD_CAMERA_CENTER_X as u32) as f32;
                if v.is_finite() { v } else { 0.5 }
            };
            let camera_center_y = {
                let v = shared_input.get_index(INPUT_WORD_CAMERA_CENTER_Y as u32) as f32;
                if v.is_finite() { v } else { 0.5 }
            };

            // [LAW:dataflow-not-control-flow] VP matrix is always written;
            // the camera_projection word selects which math produces it.
            let camera_projection = {
                let v = shared_input.get_index(INPUT_WORD_CAMERA_PROJECTION as u32) as f32;
                if v.is_finite() { v } else { 0.0 }
            };
            header.view_proj = if camera_projection >= 0.5 {
                // Perspective mode — read remaining camera params
                let camera_distance = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_DISTANCE as u32) as f32;
                    if v.is_finite() && v > 0.0 { v } else { 2.0 }
                };
                let camera_tilt_rad = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_TILT_RAD as u32) as f32;
                    if v.is_finite() { v } else { 0.0 }
                };
                let camera_yaw_rad = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_YAW_RAD as u32) as f32;
                    if v.is_finite() { v } else { 0.0 }
                };
                let camera_fov_y_rad = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_FOV_Y_RAD as u32) as f32;
                    if v.is_finite() && v > 0.01 { v } else { 0.7854 }
                };
                let camera_near = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_NEAR as u32) as f32;
                    if v.is_finite() && v > 0.0 { v } else { 0.01 }
                };
                let camera_far = {
                    let v = shared_input.get_index(INPUT_WORD_CAMERA_FAR as u32) as f32;
                    if v.is_finite() && v > 0.0 { v } else { 100.0 }
                };
                build_perspective_vp(
                    viewport_width, viewport_height,
                    zoom, safe_pan_x_px, safe_pan_y_px,
                    camera_center_x, camera_center_y,
                    camera_distance, camera_tilt_rad, camera_yaw_rad,
                    camera_fov_y_rad, camera_near, camera_far,
                )
            } else {
                // Ortho mode (default)
                build_ortho_vp(
                    viewport_width, viewport_height,
                    zoom, safe_pan_x_px, safe_pan_y_px,
                    camera_center_x, camera_center_y,
                )
            };
            let install_revision = parse_finite_u32(
                shared_input
                    .get_index(INPUT_WORD_INSTALL_REVISION as u32)
                    .into(),
                "installRevision",
            );
            // [LAW:single-enforcer] Shared-plane upload ownership is gated by
            // one install revision word; per-frame ticks do not re-copy planes.
            if install_revision != self.last_install_revision {
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
                            .saturating_add(
                                self.max_shapes
                                    .saturating_mul(SINK_TABLE_DESCRIPTOR_WORDS as u32),
                            )
                            .saturating_add(SINK_TABLE_HEADER_WORDS as u32)
                    });
                let shape_bank_words = parse_finite_u32(
                    shared_input
                        .get_index(INPUT_WORD_SHAPE_BANK_WORDS as u32)
                        .into(),
                    "shapeBankWordCount",
                );
                let sink_table_words = parse_finite_u32(
                    shared_input
                        .get_index(INPUT_WORD_SINK_TABLE_WORDS as u32)
                        .into(),
                    "sinkTableWordCount",
                );
                if shape_bank_words > shape_bank_word_limit {
                    panic!(
                        "shape bank word count exceeds shared plane limit (requested={}, limit={})",
                        shape_bank_words, shape_bank_word_limit
                    );
                }
                if sink_table_words > sink_table_word_limit {
                    panic!(
                        "sink table word count exceeds shared plane limit (requested={}, limit={})",
                        sink_table_words, sink_table_word_limit
                    );
                }
                self.last_shape_bank_words = shape_bank_words;
                self.last_sink_table_words = sink_table_words;
                let (draw_regions, shape_word_offsets) =
                    self.sync_sink_table_plane_and_parse_regions(sink_table_words);
                self.sync_shape_bank_plane(shape_bank_words, &shape_word_offsets);
                self.draw_regions = draw_regions;
                self.last_install_revision = install_revision;
            }
        } else {
            // No shared input attached — use identity viewport.
            // Default camera center (0.5, 0.5) produces zero offset.
            header.view_proj = build_ortho_vp(1.0, 1.0, 1.0, 0.0, 0.0, 0.5, 0.5);
            self.last_shape_bank_words = 0;
            self.last_sink_table_words = 0;
            self.last_shape_header_sample.clear();
            self.last_shape_cp_resolution_sample.clear();
            self.last_install_revision = 0;
            self.draw_regions = IndirectRegionPlan::default();
        }
        // [LAW:one-source-of-truth] publish_frame_header writes to the arena
        // header zone (canonical) and the uniform buffer (derived transport).
        self.arena.publish_frame_header(&self.queue, header);
    }

    // [RECOVER-10] [LAW:single-enforcer] Canonical structured readback replaces
    // the ad hoc console-only instance preview. Both instance probe and indirect
    // args are read back through this one boundary.
    fn trigger_debug_readback(
        &self,
        instance_gate_acquired: bool,
        indirect_gate_acquired: bool,
    ) {
        let frame_count = self.frame_count;
        let captured_at_ms = worker_monotonic_now_ms();
        let expected_indexed_record_count = self.draw_regions.indexed_record_count;
        let expected_non_indexed_record_count = self.draw_regions.non_indexed_record_count;
        let expected_total_instance_count = self.draw_regions.total_instance_count;
        let indexed_record_count = expected_indexed_record_count as usize;
        let non_indexed_record_count = expected_non_indexed_record_count as usize;
        let indexed_region_base_words = self.draw_regions.indexed_region_base_words as usize;
        let non_indexed_region_base_words = self.draw_regions.non_indexed_region_base_words as usize;
        let indexed_stride_words = self.draw_regions.indexed_stride_words.max(1) as usize;
        let non_indexed_stride_words = self.draw_regions.non_indexed_stride_words.max(1) as usize;
        let shape_header_sample = self.last_shape_header_sample.clone();
        let shape_cp_resolution_sample = self.last_shape_cp_resolution_sample.clone();
        let pending_readback = self.pending_readback.clone();

        // [LAW:dataflow-not-control-flow] Both readback paths are evaluated
        // each debug tick; variability is represented by gate-acquired inputs.
        let instance_values: Arc<std::sync::Mutex<Vec<f32>>> =
            Arc::new(std::sync::Mutex::new(Vec::new()));

        if instance_gate_acquired {
            let readback_gate = self.debug_readback_in_flight.clone();
            let instance_values_for_callback = instance_values.clone();
            let instance_staging_for_callback = self.arena.debug_staging_buffer().clone();
            let slice = self.arena.debug_staging_buffer().slice(..);
            let _ = slice.map_async(wgpu::MapMode::Read, move |result| {
                if result.is_ok() {
                    let mapped = instance_staging_for_callback.slice(..).get_mapped_range();
                    let f32_count = (mapped.len() / std::mem::size_of::<f32>()).min(24);
                    let mut values = Vec::with_capacity(f32_count);
                    for index in 0..f32_count {
                        let byte_index = index * std::mem::size_of::<f32>();
                        values.push(f32::from_le_bytes([
                            mapped[byte_index],
                            mapped[byte_index + 1],
                            mapped[byte_index + 2],
                            mapped[byte_index + 3],
                        ]));
                    }
                    if let Ok(mut slot) = instance_values_for_callback.lock() {
                        *slot = values;
                    }
                    drop(mapped);
                }
                instance_staging_for_callback.unmap();
                readback_gate.store(false, Ordering::SeqCst);
            });
        }

        if indirect_gate_acquired {
            let indirect_gate = self.indirect_readback_in_flight.clone();
            let indirect_staging_for_callback = self.arena.indirect_staging_buffer().clone();
            let slice = self.arena.indirect_staging_buffer().slice(..);
            let _ = slice.map_async(wgpu::MapMode::Read, move |result| {
                let mut records = Vec::new();
                let mut indirect_words_head = Vec::new();
                let mut decoded_indexed_record_count = 0u32;
                let mut decoded_non_indexed_record_count = 0u32;
                let mut decoded_indexed_instance_count = 0u32;
                let mut decoded_non_indexed_instance_count = 0u32;
                let mut decoded_non_zero_record_count = 0u32;
                if result.is_ok() {
                    let mapped = indirect_staging_for_callback.slice(..).get_mapped_range();
                    let u32_count = mapped.len() / std::mem::size_of::<u32>();
                    let head_word_count = u32_count.min(16);
                    for word_index in 0..head_word_count {
                        let byte_idx = word_index * std::mem::size_of::<u32>();
                        indirect_words_head.push(u32::from_le_bytes([
                            mapped[byte_idx],
                            mapped[byte_idx + 1],
                            mapped[byte_idx + 2],
                            mapped[byte_idx + 3],
                        ]));
                    }
                    // Decode indexed records (5 words each)
                    for i in 0..indexed_record_count {
                        let base = indexed_region_base_words + i * indexed_stride_words;
                        if base + 4 >= u32_count {
                            break;
                        }
                        let word = |offset: usize| -> u32 {
                            let byte_idx = (base + offset) * std::mem::size_of::<u32>();
                            u32::from_le_bytes([
                                mapped[byte_idx],
                                mapped[byte_idx + 1],
                                mapped[byte_idx + 2],
                                mapped[byte_idx + 3],
                            ])
                        };
                        let instance_count = word(1);
                        records.push(IndirectArgsRecord {
                            index_count: word(0),
                            vertex_count: 0,
                            instance_count,
                            first_index: word(2),
                            first_vertex: 0,
                            base_vertex: word(3) as i32,
                            first_instance: word(4),
                        });
                        decoded_indexed_record_count =
                            decoded_indexed_record_count.saturating_add(1);
                        decoded_indexed_instance_count =
                            decoded_indexed_instance_count.saturating_add(instance_count);
                        if instance_count > 0 {
                            decoded_non_zero_record_count =
                                decoded_non_zero_record_count.saturating_add(1);
                        }
                    }
                    // Decode non-indexed records (4 words each) — they start
                    // at the non-indexed base region declared in the sink table.
                    for i in 0..non_indexed_record_count {
                        let base = non_indexed_region_base_words + i * non_indexed_stride_words;
                        if base + 3 >= u32_count {
                            break;
                        }
                        let word = |offset: usize| -> u32 {
                            let byte_idx = (base + offset) * std::mem::size_of::<u32>();
                            u32::from_le_bytes([
                                mapped[byte_idx],
                                mapped[byte_idx + 1],
                                mapped[byte_idx + 2],
                                mapped[byte_idx + 3],
                            ])
                        };
                        let instance_count = word(1);
                        records.push(IndirectArgsRecord {
                            index_count: 0,
                            vertex_count: word(0),
                            instance_count,
                            first_index: 0,
                            first_vertex: word(2),
                            base_vertex: 0,
                            first_instance: word(3),
                        });
                        decoded_non_indexed_record_count =
                            decoded_non_indexed_record_count.saturating_add(1);
                        decoded_non_indexed_instance_count =
                            decoded_non_indexed_instance_count.saturating_add(instance_count);
                        if instance_count > 0 {
                            decoded_non_zero_record_count =
                                decoded_non_zero_record_count.saturating_add(1);
                        }
                    }
                    drop(mapped);
                }
                indirect_staging_for_callback.unmap();
                indirect_gate.store(false, Ordering::SeqCst);

                // Assemble snapshot and store for polling.
                let instance_probe_values = instance_values
                    .lock()
                    .ok()
                    .map(|v| v.clone())
                    .unwrap_or_default();
                let snapshot = ReadbackSnapshot {
                    frame_count,
                    captured_at_ms,
                    indirect_args: records,
                    indirect_words_head,
                    shape_header_sample: shape_header_sample.clone(),
                    shape_cp_resolution_sample: shape_cp_resolution_sample.clone(),
                    instance_probe_values,
                    render_counters: ReadbackRenderCounters {
                        expected_indexed_record_count,
                        expected_non_indexed_record_count,
                        expected_total_instance_count,
                        decoded_indexed_record_count,
                        decoded_non_indexed_record_count,
                        decoded_indexed_instance_count,
                        decoded_non_indexed_instance_count,
                        decoded_non_zero_record_count,
                    },
                };
                if let Ok(mut slot) = pending_readback.lock() {
                    *slot = Some(snapshot);
                }
            });
        }
    }

    // [RECOVER-10] [LAW:single-enforcer] One polling boundary for readback
    // snapshots, mirroring the take_frame_pacing_packet pattern.
    pub fn take_readback_snapshot(&self) -> Option<ReadbackSnapshot> {
        self.pending_readback
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
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
