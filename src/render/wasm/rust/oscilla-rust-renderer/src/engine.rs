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
    ReadbackSnapshot, SchedulerState, SchedulerTelemetry, SchedulerTelemetryInputs, StageTimingsMs,
    WorkerObservabilityPacket,
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
const INPUT_SIGNAL_WORDS: u32 = 4;
const INPUT_FLOAT_WORDS: u32 = 32;

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
const DESCRIPTOR_WORD_INSTANCE_COUNT_MODE: usize = 23;
const DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT: usize = 24;
const INSTANCE_COUNT_MODE_STATIC: u32 = 0;

impl Engine {
    pub async fn new(canvas: OffscreenCanvas, config: EngineConfig, initial_width: u32, initial_height: u32) -> Result<Self, JsValue> {
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

    pub fn rebuild_with_symbolic_manifest(
        &mut self,
        manifest: crate::memory::MemoryManifest,
        lowering: crate::compute::NagaModuleIR,
        max_active_lanes: u32,
        uber_shader_wgsl: &str,
        dispatch_instructions: Vec<crate::compute::NagaEmitterInstruction>,
    ) -> Result<(), String> {
        let resolver = crate::memory::SymbolResolver::build_from_manifest(&manifest);

        // [LAW:one-source-of-truth] Rust MMU is now the sole authority for physical layout.
        self.compute.rebuild_simulation_pipeline_with_manifest(
            &self.device,
            &resolver,
            lowering,
            max_active_lanes,
            dispatch_instructions,
        )?;

        self.render = RenderDispatcher::new(
            &self.device,
            uber_shader_wgsl,
            self.surface_format,
            self.sample_count,
            &self.compute.uniform_layout,
        );

        // Update the arena with the new resolver
        self.arena.symbol_resolver = resolver;
        self.arena.clear_simulation_planes(&self.queue);

        self.draw_regions = IndirectRegionPlan::default();
        self.last_shape_bank_words = 0;
        self.last_sink_table_words = 0;
        self.last_install_revision = 0;

        Ok(())
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
            self.sample_count,
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
            &self.render.arena_render_layout,
            particle_count as usize,
            shape_count as usize,
        );
        arena.clear_simulation_planes(&self.queue);
        self.arena = arena;
        self.draw_regions = IndirectRegionPlan::default();
        self.last_shape_bank_words = 0;
        self.last_sink_table_words = 0;
        self.last_install_revision = 0;
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
                stage_timings.fluid_pass_chain_ms = if self.compute.simulation_dispatch_count() > 1
                {
                    stage_timings.simulation_dispatch_ms
                } else {
                    0.0
                };
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
                if is_debug_tick {
                    // [RECOVER-10] Copy instance buffer to instance staging.
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
                    // [RECOVER-10] Copy indirect args buffer to indirect staging.
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
        // [RECOVER-04] Upload canonical ShapeBank words directly to topologyBank.
        // GPU vertex pulling reads control points from the topology buffer —
        // no CPU mesh realization needed.
        let canonical_words = shared_shape_bank.subarray(0, shape_bank_words).to_vec();
        self.arena
            .write_shape_bank_words(&self.device, &self.queue, &canonical_words);
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

        let plane_words = shared_sink_table.subarray(0, sink_table_words).to_vec();
        self.arena
            .write_sink_table_words(&self.device, &self.queue, &plane_words);
        // [RECOVER-07] Sum instance counts from descriptors, not zeroed record fields.
        // RECOVER-05 zeroed all record fields; StaticInstanceCount in descriptors
        // is the canonical source for assembly dispatch sizing.
        let total_record_count_usize = total_record_count as usize;
        let descriptor_region_base =
            SINK_TABLE_HEADER_WORDS + total_record_count_usize * SINK_TABLE_RECORD_WORDS;
        let mut total_instance_count: u32 = 0;
        for record in 0..total_record_count_usize {
            let descriptor_base = descriptor_region_base + record * SINK_TABLE_DESCRIPTOR_WORDS;
            if descriptor_base + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT >= plane_words.len() {
                break;
            }
            let mode = plane_words[descriptor_base + DESCRIPTOR_WORD_INSTANCE_COUNT_MODE];
            if mode == INSTANCE_COUNT_MODE_STATIC {
                total_instance_count = total_instance_count.saturating_add(
                    plane_words[descriptor_base + DESCRIPTOR_WORD_STATIC_INSTANCE_COUNT],
                );
            }
        }
        // [LAW:single-enforcer] Indirect args are authored by the canonical
        // GPU draw-prep pass; CPU mirror writes are intentionally removed.
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
            let sx = 2.0 * zoom;
            let sy = -2.0 * zoom;
            let tx = -zoom + (2.0 * zoom * (safe_pan_x_px / viewport_width));
            let ty = zoom - (2.0 * zoom * (safe_pan_y_px / viewport_height));
            header.view_proj = [[0.0; 4]; 4];
            header.view_proj[0][0] = sx;
            header.view_proj[1][1] = sy;
            header.view_proj[2][2] = 1.0;
            header.view_proj[3][0] = tx;
            header.view_proj[3][1] = ty;
            header.view_proj[3][3] = 1.0;
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
                self.sync_shape_bank_plane(shape_bank_words);
                self.draw_regions = self.sync_sink_table_plane_and_parse_regions(sink_table_words);
                self.last_install_revision = install_revision;
            }
        } else {
            // No shared input attached — use identity viewport.
            header.view_proj = [[0.0; 4]; 4];
            header.view_proj[0][0] = 2.0;
            header.view_proj[1][1] = -2.0;
            header.view_proj[2][2] = 1.0;
            header.view_proj[3][0] = -1.0;
            header.view_proj[3][1] = 1.0;
            header.view_proj[3][3] = 1.0;
            self.last_shape_bank_words = 0;
            self.last_sink_table_words = 0;
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
    fn trigger_debug_readback(&self) {
        let frame_count = self.frame_count;
        let captured_at_ms = worker_monotonic_now_ms();
        let indexed_record_count = self.draw_regions.indexed_record_count as usize;
        let non_indexed_record_count = self.draw_regions.non_indexed_record_count as usize;
        let pending_readback = self.pending_readback.clone();

        // --- Instance probe readback ---
        let instance_gate_acquired = self
            .debug_readback_in_flight
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok();

        // [LAW:dataflow-not-control-flow] Both readbacks are initiated unconditionally;
        // variability is in whether the in-flight gate was acquired.
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

        // --- Indirect args readback ---
        let indirect_gate_acquired = self
            .indirect_readback_in_flight
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok();

        if indirect_gate_acquired {
            let indirect_gate = self.indirect_readback_in_flight.clone();
            let indirect_staging_for_callback = self.arena.indirect_staging_buffer().clone();
            let slice = self.arena.indirect_staging_buffer().slice(..);
            let _ = slice.map_async(wgpu::MapMode::Read, move |result| {
                let mut records = Vec::new();
                if result.is_ok() {
                    let mapped = indirect_staging_for_callback.slice(..).get_mapped_range();
                    let u32_count = mapped.len() / std::mem::size_of::<u32>();
                    // Decode indexed records (5 words each)
                    for i in 0..indexed_record_count {
                        let base = i * INDIRECT_INDEXED_STRIDE_WORDS;
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
                        records.push(IndirectArgsRecord {
                            index_count: word(0),
                            instance_count: word(1),
                            first_index: word(2),
                            base_vertex: word(3) as i32,
                            first_instance: word(4),
                        });
                    }
                    // Decode non-indexed records (4 words each) — they start
                    // after the indexed region in the indirect buffer.
                    let non_indexed_base_words =
                        indexed_record_count * INDIRECT_INDEXED_STRIDE_WORDS;
                    for i in 0..non_indexed_record_count {
                        let base = non_indexed_base_words + i * INDIRECT_NON_INDEXED_STRIDE_WORDS;
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
                        records.push(IndirectArgsRecord {
                            index_count: 0,
                            instance_count: word(1),
                            first_index: 0,
                            base_vertex: 0,
                            first_instance: word(3),
                        });
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
                    instance_probe_values,
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
