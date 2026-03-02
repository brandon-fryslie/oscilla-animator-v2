use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use js_sys::{Float32Array, SharedArrayBuffer, Uint32Array};
use wasm_bindgen::JsCast;
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
const INPUT_SIGNAL_WORDS: u32 = 4;
const INPUT_FLOAT_WORDS: u32 = 32;

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

@vertex fn vs_main(@location(0) localPos: vec2<f32>, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let inst = instances[instanceIndex];
  let topologyWordOffset = u32(max(inst.transform1.z, 0.0));
  let topologyFlags = topologyBank[topologyWordOffset + 3u];
  let closedMask = select(0.0, 1.0, (topologyFlags & 1u) != 0u);
  let viewportPx = global.resolution;
  let panPx = vec2<f32>(global.view_proj[0].y, global.view_proj[0].z);
  let zoom = global.view_proj[0].x;
  let viewportMinPx = min(viewportPx.x, viewportPx.y);
  let centerPx = inst.transform0.xy * viewportPx;
  let centeredPx = (centerPx - (viewportPx * 0.5)) * zoom + (viewportPx * 0.5) + (panPx * zoom);
  let localScaled = vec2<f32>(
    localPos.x * inst.transform0.z * inst.transform1.x,
    localPos.y * inst.transform0.z * inst.transform1.y
  ) * viewportMinPx * zoom;
  let c = cos(inst.transform0.w);
  let s = sin(inst.transform0.w);
  let rotatedPx = vec2<f32>(
    localScaled.x * c - localScaled.y * s,
    localScaled.x * s + localScaled.y * c
  );
  let finalPx = centeredPx + rotatedPx;
  let ndc = vec2<f32>(
    (finalPx.x / viewportPx.x) * 2.0 - 1.0,
    1.0 - (finalPx.y / viewportPx.y) * 2.0
  );
  var out: VertexOutput;
  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.color = inst.color * (1.0 + closedMask * 0.0);
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
    shared_input: Option<Float32Array>,
    scheduler: WorkerScheduler,
    frame_count: u64,
    debug_readback_interval_frames: u64,
    debug_readback_in_flight: Arc<AtomicBool>,
    max_particles: u32,
    draw_record_count: u32,
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
            &render.instance_layout,
            &render.topology_layout,
            config.max_particles,
            config.max_shapes,
        );
        let depth_target = DepthTarget::new(&device, surface_config.width, surface_config.height);
        let debug_readback_interval_frames = (60 / config.debug_readback_hz.max(1)).max(1) as u64;
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
            shared_input: None,
            scheduler,
            frame_count: 0,
            debug_readback_interval_frames,
            debug_readback_in_flight: Arc::new(AtomicBool::new(false)),
            max_particles: config.max_particles as u32,
            draw_record_count: 0,
        })
    }

    pub fn attach_shared_input(&mut self, shared_input: SharedArrayBuffer) {
        // [LAW:one-source-of-truth] Shared input ABI layout is owned by the
        // renderer input plane: first 4 i32 signal words, then 32 f32 words.
        self.shared_input = Some(Float32Array::new_with_byte_offset_and_length(
            &shared_input,
            INPUT_SIGNAL_WORDS * std::mem::size_of::<i32>() as u32,
            INPUT_FLOAT_WORDS,
        ));
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
        self.arena = GpuMemoryArena::new(
            &self.device,
            &self.compute.uniform_layout,
            &self.compute.state_layout,
            &self.compute.assembly_layout,
            &self.render.instance_layout,
            &self.render.topology_layout,
            particle_count as usize,
            shape_count as usize,
        );
        self.draw_record_count = 0;
    }

    pub fn rebuild_simulation_pipeline(&mut self, simulation_wgsl: &str) {
        // [LAW:single-enforcer] Compiler-owned simulation WGSL is published at
        // one engine boundary so runtime hot path never recompiles or swaps ad hoc.
        self.compute.rebuild_simulation_pipeline_with_compiler_wgsl(
            &self.device,
            simulation_wgsl,
            self.max_particles,
        );
        let compiler_layout = self
            .compute
            .compiler_simulation_layout()
            .expect("compiler simulation layout must exist after rebuild");
        self.arena
            .rebuild_compiler_simulation_bind_groups(&self.device, compiler_layout);
    }

    pub fn sync_render_payload(
        &mut self,
        topology_words: &Uint32Array,
        instance_floats: &Float32Array,
        indirect_args_words: &Uint32Array,
        vertex_floats: &Float32Array,
        index_words: &Uint32Array,
        draw_record_count: u32,
    ) -> Result<(), JsValue> {
        let mut topology = vec![0u32; topology_words.length() as usize];
        topology_words.copy_to(topology.as_mut_slice());
        let mut instances = vec![0f32; instance_floats.length() as usize];
        instance_floats.copy_to(instances.as_mut_slice());
        let mut indirect = vec![0u32; indirect_args_words.length() as usize];
        indirect_args_words.copy_to(indirect.as_mut_slice());
        let mut vertices = vec![0f32; vertex_floats.length() as usize];
        vertex_floats.copy_to(vertices.as_mut_slice());
        let mut indices = vec![0u32; index_words.length() as usize];
        index_words.copy_to(indices.as_mut_slice());

        // [LAW:single-enforcer] Render payload upload is centralized in one
        // engine boundary so all GPU buffer mutations follow one schema.
        self.arena.sync_render_payload(
            &self.device,
            &self.queue,
            topology.as_slice(),
            instances.as_slice(),
            indirect.as_slice(),
            vertices.as_slice(),
            indices.as_slice(),
        );
        let available_records = (indirect.len() / crate::memory::INDIRECT_WORDS_PER_RECORD) as u32;
        self.draw_record_count = draw_record_count.min(available_records);
        Ok(())
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
        self.input_marshal_phase(tick_start_ms);
        if self.scheduler.state() == SchedulerState::Paused {
            let now_ms = worker_monotonic_now_ms();
            let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
            self.scheduler
                .record_paused_tick(now_ms, tick_elapsed_ms);
            return Ok(());
        }

        enum HotPathOutcome {
            Success { debug_tick: bool, frame_count: u64 },
            SurfaceTimeout,
            SurfaceLost,
            FatalOutOfMemory,
            FatalOther,
        }

        // [LAW:single-enforcer] Tick owns one strict allocator boundary for the
        // full per-frame command path.
        let outcome = {
            let _hot_path_guard = StrictAllocator::hot_path_guard();
            if self.draw_record_count == 0 {
                // [LAW:dataflow-not-control-flow] exception: when draw-record
                // cardinality is zero there is no presentation work to submit;
                // simulation and telemetry still execute in fixed order.
                let mut encoder =
                    self.device
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                            label: Some("HotPath.CommandEncoder"),
                        });
                self.compute
                    .encode_passes(&mut encoder, &mut self.arena, false);
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
                self.frame_count = self.frame_count.wrapping_add(1);
                HotPathOutcome::Success {
                    debug_tick: is_debug_tick,
                    frame_count: self.frame_count,
                }
            } else {
                match self.surface.get_current_texture() {
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

                        self.compute
                            .encode_passes(&mut encoder, &mut self.arena, false);
                        self.render.encode_passes(
                            &mut encoder,
                            &self.arena,
                            &color_view,
                            self.depth_target.view(),
                            self.draw_record_count,
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

                        HotPathOutcome::Success {
                            debug_tick: is_debug_tick,
                            frame_count: self.frame_count,
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
                }
            }
        };

        match outcome {
            HotPathOutcome::Success {
                debug_tick,
                frame_count,
            } => {
                // [LAW:single-enforcer] Async map callbacks can allocate in
                // browser glue and therefore run only after lock scope exits.
                if debug_tick {
                    self.trigger_debug_readback();
                }
                let now_ms = worker_monotonic_now_ms();
                let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
                self.scheduler.record_tick_success(
                    now_ms,
                    tick_elapsed_ms,
                    frame_count,
                );
                Ok(())
            }
            HotPathOutcome::SurfaceTimeout => self.finish_timeout(tick_start_ms),
            HotPathOutcome::SurfaceLost => self.finish_surface_lost(tick_start_ms),
            HotPathOutcome::FatalOutOfMemory => self.finish_fatal(
                tick_start_ms,
                "surface_out_of_memory",
                "Fatal Surface Error: OutOfMemory",
            ),
            HotPathOutcome::FatalOther => {
                self.finish_fatal(tick_start_ms, "surface_other", "Fatal Surface Error: Other")
            }
        }
    }

    fn finish_timeout(&mut self, tick_start_ms: f64) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler.record_surface_timeout(now_ms, tick_elapsed_ms);
        Ok(())
    }

    fn finish_surface_lost(&mut self, tick_start_ms: f64) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler.record_surface_lost(
            now_ms,
            tick_elapsed_ms,
            "Surface acquire failed with Lost/Outdated",
        );
        Ok(())
    }

    fn finish_fatal(
        &mut self,
        tick_start_ms: f64,
        code: &'static str,
        message: &'static str,
    ) -> Result<(), JsValue> {
        let now_ms = worker_monotonic_now_ms();
        let tick_elapsed_ms = (now_ms - tick_start_ms).max(0.0);
        self.scheduler.record_fatal(now_ms, tick_elapsed_ms, code, message);
        Err(JsValue::from_str(message))
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

        let readback_gate = self.debug_readback_in_flight.clone();
        let slice = self.arena.debug_staging_buffer().slice(..);
        let staging_buffer_for_callback = self.arena.debug_staging_buffer().clone();
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
            .take_observability_packet(worker_monotonic_now_ms())
    }

    pub fn inject_poison_alloc(&self) {
        let _guard = StrictAllocator::hot_path_guard();
        let _poison = Vec::<u8>::with_capacity(32);
    }
}
