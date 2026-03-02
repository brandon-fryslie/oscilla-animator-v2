use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use js_sys::{Float32Array, SharedArrayBuffer};
use wasm_bindgen::JsValue;
use web_sys::OffscreenCanvas;

use crate::allocator::StrictAllocator;
use crate::compute::ComputeDispatcher;
use crate::memory::GpuMemoryArena;
use crate::render::{DepthTarget, RenderDispatcher};
use crate::scheduler::{SchedulerState, WorkerObservabilityPacket, WorkerScheduler};

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

const DEFAULT_SIMULATION_WGSL: &str = r#"
@group(0) @binding(0) var<uniform> global_uniforms: array<vec4<f32>, 5>;
@group(1) @binding(0) var<storage, read> state_read: array<u32>;
@group(2) @binding(0) var<storage, read_write> state_write: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&state_write)) {
    return;
  }
  let base = state_read[index];
  let dt_bits = bitcast<u32>(global_uniforms[4].y);
  state_write[index] = base + dt_bits + 1u;
}
"#;

const DEFAULT_ASSEMBLY_WGSL: &str = r#"
@group(0) @binding(0) var<uniform> global_uniforms: array<vec4<f32>, 5>;
@group(1) @binding(0) var<storage, read> state_read: array<u32>;
@group(2) @binding(0) var<storage, read_write> instance_words: array<u32>;
@group(2) @binding(1) var<storage, read_write> indirect_words: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x == 0u && arrayLength(&indirect_words) >= 5u) {
    indirect_words[0] = 6u;
    indirect_words[1] = max(1u, u32(global_uniforms[4].x));
    indirect_words[2] = 0u;
    indirect_words[3] = 0u;
    indirect_words[4] = 0u;
  }
  if (gid.x < arrayLength(&instance_words)) {
    instance_words[gid.x] = state_read[gid.x % max(1u, arrayLength(&state_read))];
  }
}
"#;

const DEFAULT_UBER_SHADER_WGSL: &str = r#"
struct GlobalUniforms {
  view_proj: mat4x4<f32>,
  resolution: vec2<f32>,
  time_seconds: f32,
  delta_time_seconds: f32,
};

struct ShapeInstance {
  transform: mat4x4<f32>,
  color: vec4<f32>,
  sdf_params: vec3<f32>,
  material_id: u32,
  pad0: vec3<u32>,
};

@group(0) @binding(0) var<uniform> global: GlobalUniforms;
@group(1) @binding(0) var<storage, read> shape_bank: array<ShapeInstance>;

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@location(0) local_pos: vec2<f32>, @builtin(instance_index) instance_index: u32) -> VertexOutput {
  let instance = shape_bank[instance_index];
  let world_pos = instance.transform * vec4<f32>(local_pos, 0.0, 1.0);
  var out: VertexOutput;
  out.clip_position = global.view_proj * world_pos;
  out.color = instance.color;
  return out;
}

@fragment
fn fs_main(in_data: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in_data.color.rgb * in_data.color.a, in_data.color.a);
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
    assembly_write_bind_group: wgpu::BindGroup,
    shared_input: Option<Float32Array>,
    scheduler: WorkerScheduler,
    frame_count: u64,
    debug_readback_interval_frames: u64,
    debug_readback_in_flight: Arc<AtomicBool>,
    strict_lock_start_frame: u64,
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
            &compute.assembly_layout,
            &render.render_layout,
            config.max_particles,
            config.max_shapes,
        );
        let assembly_write_bind_group = arena.assembly_write_bind_group.clone();
        let depth_target = DepthTarget::new(&device, surface_config.width, surface_config.height);
        let debug_readback_interval_frames = (60 / config.debug_readback_hz.max(1)).max(1) as u64;
        let scheduler = WorkerScheduler::new(js_sys::Date::now());

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
            assembly_write_bind_group,
            shared_input: None,
            scheduler,
            frame_count: 0,
            debug_readback_interval_frames,
            debug_readback_in_flight: Arc::new(AtomicBool::new(false)),
            strict_lock_start_frame: 600,
        })
    }

    pub fn attach_shared_input(&mut self, shared_input: SharedArrayBuffer) {
        self.shared_input = Some(Float32Array::new(&shared_input));
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
        self.scheduler.mark_paused(js_sys::Date::now());
    }

    pub fn resume(&mut self) {
        self.scheduler.mark_running(js_sys::Date::now());
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
        self.arena = GpuMemoryArena::new(
            &self.device,
            &self.compute.uniform_layout,
            &self.compute.state_layout,
            &self.compute.assembly_layout,
            &self.render.render_layout,
            particle_count as usize,
            shape_count as usize,
        );
        self.assembly_write_bind_group = self.arena.assembly_write_bind_group.clone();
    }

    pub fn tick(&mut self, timestamp_ms: f64) -> Result<(), JsValue> {
        let tick_start_ms = js_sys::Date::now();
        self.scheduler.begin_loop_iteration(tick_start_ms);
        self.input_marshal_phase(timestamp_ms);
        if self.scheduler.state() == SchedulerState::Paused {
            let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
            self.scheduler
                .record_paused_tick(js_sys::Date::now(), tick_elapsed_ms);
            return Ok(());
        }

        // [LAW:single-enforcer] Tick owns allocator lock boundary so allocation
        // enforcement remains centralized at one runtime boundary.
        // [LAW:single-enforcer] exception: wgpu performs lazy backend setup in
        // early frames; strict enforcement activates after warm-up.
        let strict_lock_enabled = self.frame_count >= self.strict_lock_start_frame;
        if strict_lock_enabled {
            StrictAllocator::lock();
        }
        let frame = match self.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Timeout) => {
                if strict_lock_enabled {
                    StrictAllocator::unlock();
                }
                let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
                self.scheduler
                    .record_surface_timeout(js_sys::Date::now(), tick_elapsed_ms);
                return Ok(());
            }
            Err(wgpu::SurfaceError::Outdated | wgpu::SurfaceError::Lost) => {
                if strict_lock_enabled {
                    StrictAllocator::unlock();
                }
                self.surface.configure(&self.device, &self.surface_config);
                let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
                self.scheduler.record_surface_lost(
                    js_sys::Date::now(),
                    tick_elapsed_ms,
                    "Surface acquire failed with Lost/Outdated",
                );
                return Ok(());
            }
            Err(wgpu::SurfaceError::OutOfMemory) => {
                if strict_lock_enabled {
                    StrictAllocator::unlock();
                }
                let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
                self.scheduler.record_fatal(
                    js_sys::Date::now(),
                    tick_elapsed_ms,
                    "surface_out_of_memory",
                    "Fatal Surface Error: OutOfMemory",
                );
                return Err(JsValue::from_str("Fatal Surface Error: OutOfMemory"));
            }
            Err(wgpu::SurfaceError::Other) => {
                if strict_lock_enabled {
                    StrictAllocator::unlock();
                }
                let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
                self.scheduler.record_fatal(
                    js_sys::Date::now(),
                    tick_elapsed_ms,
                    "surface_other",
                    "Fatal Surface Error: Other",
                );
                return Err(JsValue::from_str("Fatal Surface Error: Other"));
            }
        };

        let color_view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("HotPath.CommandEncoder"),
            });

        self.compute.encode_passes(
            &mut encoder,
            &mut self.arena,
            &self.assembly_write_bind_group,
        );
        self.render.encode_passes(
            &mut encoder,
            &self.arena,
            &color_view,
            self.depth_target.view(),
        );

        let is_debug_tick = self.frame_count % self.debug_readback_interval_frames == 0;
        if is_debug_tick {
            encoder.copy_buffer_to_buffer(
                self.arena.read_state_buffer(),
                0,
                self.arena.debug_staging_buffer(),
                0,
                self.arena.debug_staging_buffer().size(),
            );
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        frame.present();
        self.frame_count = self.frame_count.wrapping_add(1);
        if strict_lock_enabled {
            StrictAllocator::unlock();
        }

        if is_debug_tick {
            self.trigger_debug_readback();
        }

        let tick_elapsed_ms = (js_sys::Date::now() - tick_start_ms).max(0.0);
        self.scheduler
            .record_tick_success(js_sys::Date::now(), tick_elapsed_ms, self.frame_count);

        Ok(())
    }

    fn input_marshal_phase(&mut self, timestamp_ms: f64) {
        let mut uniforms = self.arena.uniforms;
        if let Some(shared_input) = self.shared_input.as_ref() {
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
        } else {
            uniforms.time_seconds = (timestamp_ms.max(0.0) * 0.001) as f32;
            uniforms.delta_time_seconds = (1.0 / 60.0) as f32;
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

        let staging_buffer = self.arena.debug_staging_buffer().clone();
        let staging_buffer_for_callback = staging_buffer.clone();
        let readback_gate = self.debug_readback_in_flight.clone();
        let slice = staging_buffer.slice(..);
        let _ = slice.map_async(wgpu::MapMode::Read, move |result| {
            if result.is_ok() {
                let mapped = staging_buffer_for_callback.slice(..).get_mapped_range();
                drop(mapped);
            }
            staging_buffer_for_callback.unmap();
            readback_gate.store(false, Ordering::SeqCst);
        });
    }

    pub fn take_runtime_event_code(&mut self) -> u32 {
        self.scheduler.take_legacy_runtime_event_code()
    }

    pub fn take_frame_pacing_packet(&mut self) -> Option<WorkerObservabilityPacket> {
        // [LAW:single-enforcer] Scheduler is the only lifecycle/timing authority,
        // so all observability packets are drained from one owner.
        self.scheduler
            .take_observability_packet(js_sys::Date::now())
    }

    pub fn inject_poison_alloc(&self) {
        StrictAllocator::lock();
        let _poison = Vec::<u8>::with_capacity(32);
        StrictAllocator::unlock();
    }
}
