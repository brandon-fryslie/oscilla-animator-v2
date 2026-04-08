use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::{any::Any, panic::AssertUnwindSafe};

use wasm_bindgen::JsValue;
use web_sys::console;
use web_sys::OffscreenCanvas;
use wgpu::util::DeviceExt;

use crate::allocator::StrictAllocator;
use crate::contract::{
    BlendMode, CompilationDiagnostic, CullMode, DepthCompare, DepthLoadOp, DrawCallSource,
    InstallReceipt, LoadOp, PipelineInstallPayload, RosterEntry, StencilCompare, StencilLoadOp,
    StencilOp,
};
use crate::error_boundary::{send_engine_error, EngineErrorPayload};
use crate::mmu::{self, AllocatedShape, GpuMemoryArena};
use crate::scheduler::WorkerScheduler;
use crate::telemetry::{SchedulerState, SchedulerTelemetry, WorkerObservabilityPacket};
use crate::translator;

/// Resolve MSAA sample count. Prefer 4x, fall back to 1x.
fn resolve_sample_count(adapter: &wgpu::Adapter, format: wgpu::TextureFormat) -> u32 {
    let flags = adapter.get_texture_format_features(format).flags;
    if flags.contains(wgpu::TextureFormatFeatureFlags::MULTISAMPLE_X4) {
        4
    } else {
        1
    }
}

fn create_runtime_surface(
    instance: &wgpu::Instance,
    canvas: OffscreenCanvas,
) -> Result<wgpu::Surface<'static>, JsValue> {
    instance
        .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
        .map_err(|error| JsValue::from_str(&format!("create_surface failed: {error}")))
}

// ---------------------------------------------------------------------------
// Compiled pipeline state
// ---------------------------------------------------------------------------

struct CompiledRoster {
    arena: GpuMemoryArena,
    passes: Vec<CompiledPass>,
    /// Word offset of "sys:time" in the globals buffer (if present).
    global_time_word_offset: Option<u32>,
    /// Word offset of "sys:resolution" in the globals buffer (if present).
    global_resolution_word_offset: Option<u32>,
    /// True when any render pass targets the canvas surface.
    /// [LAW:dataflow-not-control-flow] Pre-resolved so execute_roster acquires
    /// the surface texture unconditionally before the pass loop.
    needs_surface: bool,
}

enum CompiledPass {
    Compute {
        pipeline: wgpu::ComputePipeline,
        group0: Option<wgpu::BindGroup>,
        group1: Option<wgpu::BindGroup>,
        dispatch: [u32; 3],
    },
    DrawPrep {
        pipeline: wgpu::ComputePipeline,
        bind_group: wgpu::BindGroup,
    },
    Render {
        pipeline: wgpu::RenderPipeline,
        bind_group: Option<wgpu::BindGroup>,
        vertex_buffer_id: String,
        draw_mode: RenderDrawMode,
        color_load_op: ColorLoadOp,
        /// Color target texture ID — "canvas" or a named texture. All targets are
        /// looked up uniformly in the arena (canvas is registered at frame start).
        color_target_id: String,
        depth_stencil: Option<CompiledDepthStencilAttachment>,
        /// Pixel-resolved viewport from TS compiler — used directly, no per-frame math.
        viewport: [f32; 6],
        /// Pixel-resolved scissor rect from TS compiler — used directly, no per-frame math.
        scissor_rect: [u32; 4],
    },
}

enum RenderDrawMode {
    Indirect,
    Direct {
        vertex_count: u32,
        instance_count: u32,
    },
}

#[derive(Debug)]
enum ColorLoadOp {
    Clear(wgpu::Color),
    Load,
}

struct CompiledDepthStencilAttachment {
    texture_id: String,
    depth_ops: Option<wgpu::Operations<f32>>,
    stencil_ops: Option<wgpu::Operations<u32>>,
}

fn install_error_json(phase: &str, block_id: Option<&str>, message: impl Into<String>) -> String {
    let receipt = InstallReceipt::error(vec![CompilationDiagnostic {
        severity: "error".into(),
        phase: phase.into(),
        block_id: block_id.map(ToOwned::to_owned),
        symbol_id: None,
        message: message.into(),
    }]);
    serde_json::to_string(&receipt).unwrap_or_else(|_| {
        "{\"status\":\"error\",\"compilationTimeMs\":0,\"diagnostics\":[{\"severity\":\"fatal\",\"phase\":\"manifest_allocation\",\"message\":\"failed to serialize install receipt\"}]}".to_string()
    })
}

fn panic_to_message(payload: Box<dyn Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic payload".to_string()
    }
}

fn built_in_fullscreen_shape(device: &wgpu::Device) -> AllocatedShape {
    // [LAW:one-source-of-truth] Canonical fullscreen geometry lives in one helper.
    let vertices: [f32; 6] = [-1.0, -1.0, 3.0, -1.0, -1.0, 3.0];
    let contents = bytemuck::cast_slice(&vertices);
    let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("builtin_fullscreen_triangle_vbo"),
        contents,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    });
    AllocatedShape {
        vertex_buffer,
        index_buffer: None,
        vertex_count: 3,
        index_count: 0,
        topology: wgpu::PrimitiveTopology::TriangleList,
        vertex_stride: 8,
    }
}

// [LAW:dataflow-not-control-flow] Variance lives in the contract enums; the
// translations below are total `match` statements with no defensive defaults.
// Adding a variant is a compile error until handled here.

fn blend_state_for(mode: BlendMode) -> Option<wgpu::BlendState> {
    Some(match mode {
        BlendMode::Opaque => wgpu::BlendState::REPLACE,
        BlendMode::Alpha => wgpu::BlendState::ALPHA_BLENDING,
        BlendMode::Additive => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::OVER,
        },
        BlendMode::Multiply => wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::Dst,
                dst_factor: wgpu::BlendFactor::Zero,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::OVER,
        },
    })
}

fn cull_face_for(mode: CullMode) -> Option<wgpu::Face> {
    match mode {
        CullMode::None => None,
        CullMode::Front => Some(wgpu::Face::Front),
        CullMode::Back => Some(wgpu::Face::Back),
    }
}

fn depth_compare_for(mode: DepthCompare) -> wgpu::CompareFunction {
    match mode {
        DepthCompare::Less => wgpu::CompareFunction::Less,
        DepthCompare::Always => wgpu::CompareFunction::Always,
        DepthCompare::Equal => wgpu::CompareFunction::Equal,
        DepthCompare::Greater => wgpu::CompareFunction::Greater,
    }
}

fn stencil_compare_for(mode: StencilCompare) -> wgpu::CompareFunction {
    match mode {
        StencilCompare::Always => wgpu::CompareFunction::Always,
        StencilCompare::Never => wgpu::CompareFunction::Never,
        StencilCompare::Equal => wgpu::CompareFunction::Equal,
        StencilCompare::NotEqual => wgpu::CompareFunction::NotEqual,
        StencilCompare::Less => wgpu::CompareFunction::Less,
        StencilCompare::LessEqual => wgpu::CompareFunction::LessEqual,
        StencilCompare::Greater => wgpu::CompareFunction::Greater,
        StencilCompare::GreaterEqual => wgpu::CompareFunction::GreaterEqual,
    }
}

fn stencil_op_for(op: StencilOp) -> wgpu::StencilOperation {
    match op {
        StencilOp::Keep => wgpu::StencilOperation::Keep,
        StencilOp::Zero => wgpu::StencilOperation::Zero,
        StencilOp::Replace => wgpu::StencilOperation::Replace,
        StencilOp::Invert => wgpu::StencilOperation::Invert,
        StencilOp::IncrementClamp => wgpu::StencilOperation::IncrementClamp,
        StencilOp::DecrementClamp => wgpu::StencilOperation::DecrementClamp,
        StencilOp::IncrementWrap => wgpu::StencilOperation::IncrementWrap,
        StencilOp::DecrementWrap => wgpu::StencilOperation::DecrementWrap,
    }
}

fn stencil_face_state_for(
    face: Option<&crate::contract::StencilFaceState>,
) -> wgpu::StencilFaceState {
    match face {
        Some(face) => wgpu::StencilFaceState {
            compare: stencil_compare_for(face.compare),
            fail_op: stencil_op_for(face.fail_op),
            depth_fail_op: stencil_op_for(face.depth_fail_op),
            pass_op: stencil_op_for(face.pass_op),
        },
        None => wgpu::StencilFaceState::IGNORE,
    }
}

/// [LAW:dataflow-not-control-flow] Convert the depth load-op enum directly to
/// the wgpu Operations struct. The Clear value lives inside the enum variant —
/// no Option<value> coupling, no unwrap_or(default).
fn depth_ops_for(op: Option<DepthLoadOp>) -> Option<wgpu::Operations<f32>> {
    op.map(|op| wgpu::Operations {
        load: match op {
            DepthLoadOp::Load => wgpu::LoadOp::Load,
            DepthLoadOp::Clear { value } => wgpu::LoadOp::Clear(value),
        },
        store: wgpu::StoreOp::Store,
    })
}

fn stencil_ops_for(op: Option<StencilLoadOp>) -> Option<wgpu::Operations<u32>> {
    op.map(|op| wgpu::Operations {
        load: match op {
            StencilLoadOp::Load => wgpu::LoadOp::Load,
            StencilLoadOp::Clear { value } => wgpu::LoadOp::Clear(value),
        },
        store: wgpu::StoreOp::Store,
    })
}

fn color_load_op_for(op: LoadOp, clear_color: Option<[f64; 4]>) -> ColorLoadOp {
    match op {
        LoadOp::Load => ColorLoadOp::Load,
        LoadOp::Clear => {
            let cc = clear_color.unwrap_or([0.0, 0.0, 0.0, 1.0]);
            ColorLoadOp::Clear(wgpu::Color { r: cc[0], g: cc[1], b: cc[2], a: cc[3] })
        }
    }
}

/// Selection of which arena buffers to bind to a single bind group, in
/// canonical order: globals → scalars → domains → atomic_domains → textures
/// → samplers. The binding index is the position of each included resource
/// in this sequence — so compute group0 (globals+scalars), compute group1
/// (the rest), and the merged render group all read out of the same
/// assembly routine. [LAW:single-enforcer]
#[derive(Default)]
struct BindGroupSelection<'a> {
    include_globals: bool,
    include_scalars: bool,
    domain_keys: &'a [String],
    atomic_domain_keys: &'a [String],
    texture_keys: &'a [String],
    sampler_keys: &'a [String],
}

/// Build a bind group from the selection, or return `None` if the selection
/// is empty. The caller owns the layout source (typically
/// `pipeline.get_bind_group_layout(group_index)`).
///
/// [LAW:dataflow-not-control-flow] The binding sequence is data: callers
/// declare what to include, and this function lays them out unconditionally
/// in the canonical order. No per-callsite `for domain in ... push` loops.
fn build_bind_group(
    device: &wgpu::Device,
    arena: &GpuMemoryArena,
    layout: &wgpu::BindGroupLayout,
    label: &str,
    sel: BindGroupSelection,
) -> Option<wgpu::BindGroup> {
    let mut entries: Vec<wgpu::BindGroupEntry> = Vec::new();
    if sel.include_globals {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: arena.globals_buffer.as_entire_binding(),
        });
    }
    if sel.include_scalars {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: arena.scalars_buffer.as_entire_binding(),
        });
    }
    for k in sel.domain_keys {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: arena.domain_buffers[k].as_entire_binding(),
        });
    }
    for k in sel.atomic_domain_keys {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: arena.domain_atomic_buffers[k].as_entire_binding(),
        });
    }
    for k in sel.texture_keys {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: wgpu::BindingResource::TextureView(&arena.textures[k].view),
        });
    }
    for k in sel.sampler_keys {
        entries.push(wgpu::BindGroupEntry {
            binding: entries.len() as u32,
            resource: wgpu::BindingResource::Sampler(&arena.samplers[k]),
        });
    }
    if entries.is_empty() {
        return None;
    }
    Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &entries,
    }))
}

/// Look up the color view and optional MSAA resolve target for a render pass.
/// The canvas surface is acquired per-frame; named textures live in the arena.
/// MSAA resolve is active when `msaa_view` is Some (engine negotiated 4x at init).
fn lookup_color_view<'a>(
    target_id: &str,
    surface_view: &'a Option<wgpu::TextureView>,
    msaa_view: &'a Option<wgpu::TextureView>,
    arena: &'a GpuMemoryArena,
) -> (&'a wgpu::TextureView, Option<&'a wgpu::TextureView>) {
    if target_id == "canvas" {
        let view = surface_view.as_ref().unwrap();
        match msaa_view {
            Some(msaa) => (msaa, Some(view)),
            None => (view, None),
        }
    } else {
        let tex = arena.textures.get(target_id).unwrap();
        (&tex.view, None)
    }
}

fn is_depth_or_stencil_format(format: wgpu::TextureFormat) -> bool {
    matches!(
        format,
        wgpu::TextureFormat::Depth16Unorm
            | wgpu::TextureFormat::Depth24Plus
            | wgpu::TextureFormat::Depth24PlusStencil8
            | wgpu::TextureFormat::Depth32Float
            | wgpu::TextureFormat::Depth32FloatStencil8
            | wgpu::TextureFormat::Stencil8
    )
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

pub struct Engine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    sample_count: u32,
    /// MSAA intermediate render target (None when sample_count == 1)
    msaa_view: Option<wgpu::TextureView>,
    scheduler: WorkerScheduler,
    frame_count: u64,
    pending_fatal_gpu_error: Arc<AtomicBool>,
    compiled_roster: Option<CompiledRoster>,
}

impl Engine {
    pub async fn new(
        canvas: OffscreenCanvas,
        initial_width: u32,
        initial_height: u32,
    ) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let surface = create_runtime_surface(&instance, canvas)?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .map_err(|error| JsValue::from_str(&format!("request_adapter failed: {error}")))?;

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
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("Oscilla.Render.Device"),
                required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE,
                required_limits,
                experimental_features: wgpu::ExperimentalFeatures::default(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
            })
            .await
            .map_err(|error| JsValue::from_str(&format!("request_device failed: {error}")))?;

        let pending_fatal_gpu_error = Arc::new(AtomicBool::new(false));
        let pending_fatal_gpu_error_for_callback = pending_fatal_gpu_error.clone();

        // [LAW:single-enforcer] Asynchronous WebGPU validation/internal/OOM
        // faults are classified and emitted through one runtime error boundary.
        device.on_uncaptured_error(Arc::new(move |error| {
            let (kind, desc) = match &error {
                wgpu::Error::Validation { description, .. } => ("WEBGPU_VALIDATION", description.as_str()),
                wgpu::Error::OutOfMemory { .. } => ("WEBGPU_OOM", "GPU out of memory"),
                wgpu::Error::Internal { description, .. } => ("WEBGPU_INTERNAL", description.as_str()),
            };
            // Always log to console so Safari errors are visible
            console::error_1(&JsValue::from_str(&format!("[GPU ERROR] {kind}: {desc}")));
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
        // bootstrap caller (OffscreenCanvas size at transfer time).
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
        if sample_count != 4 {
            console::warn_1(&JsValue::from_str(
                "WebGPU adapter lacks 4x MSAA support; using sample_count=1",
            ));
        }

        // Create MSAA render target when multisampling is active
        let msaa_view = if sample_count > 1 {
            let msaa_texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("msaa_target"),
                size: wgpu::Extent3d {
                    width: surface_config.width,
                    height: surface_config.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count,
                dimension: wgpu::TextureDimension::D2,
                format: surface_config.format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            Some(msaa_texture.create_view(&wgpu::TextureViewDescriptor::default()))
        } else {
            None
        };

        let now_ms = js_sys::Date::now();

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            sample_count,
            msaa_view,
            scheduler: WorkerScheduler::new(now_ms),
            frame_count: 0,
            pending_fatal_gpu_error,
            compiled_roster: None,
        })
    }

    pub fn should_schedule_next_frame(&self) -> bool {
        let state = self.scheduler.state();
        state == SchedulerState::Running || state == SchedulerState::Booting
    }

    pub fn pause(&mut self) {
        let now_ms = js_sys::Date::now();
        self.scheduler.mark_paused(now_ms);
    }

    pub fn resume(&mut self) {
        let now_ms = js_sys::Date::now();
        self.scheduler.mark_running(now_ms);
    }

    pub fn inject_poison_alloc(&mut self) {
        StrictAllocator::lock();
        // Intentionally left locked — next allocation will panic.
        // Used for testing the strict allocator guard.
    }

    pub fn take_frame_pacing_packet(&mut self) -> Option<WorkerObservabilityPacket> {
        let now_ms = js_sys::Date::now();
        self.scheduler.take_observability_packet(now_ms)
    }

    // -----------------------------------------------------------------------
    // Pipeline install
    // -----------------------------------------------------------------------

    pub fn install_pipeline(&mut self, payload_json: &str) -> String {
        let start = js_sys::Date::now();
        console::log_1(&JsValue::from_str("[install_pipeline] Starting..."));

        let payload: PipelineInstallPayload = match serde_json::from_str(payload_json) {
            Ok(p) => {
                console::log_1(&JsValue::from_str("[install_pipeline] JSON parsed OK"));
                p
            }
            Err(e) => {
                console::error_1(&JsValue::from_str(&format!(
                    "[install_pipeline] JSON parse error: {}",
                    e
                )));
                let receipt = InstallReceipt::fatal(
                    "manifest_allocation",
                    format!("JSON parse error: {}", e),
                );
                return serde_json::to_string(&receipt).unwrap();
            }
        };

        // Parse registered WGSL functions
        let parsed_functions = if !payload.functions.is_empty() {
            console::log_1(&JsValue::from_str(&format!(
                "[install_pipeline] Parsing {} registered WGSL functions...",
                payload.functions.len()
            )));
            match crate::wgsl_functions::parse_registered_functions(&payload.functions) {
                Ok(parsed) => {
                    console::log_1(&JsValue::from_str(&format!(
                        "[install_pipeline] Parsed {} WGSL functions OK",
                        parsed.len()
                    )));
                    parsed
                }
                Err(e) => {
                    let receipt = InstallReceipt::fatal(
                        "ast_lowering",
                        format!("WGSL function parse error: {}", e),
                    );
                    return serde_json::to_string(&receipt).unwrap();
                }
            }
        } else {
            std::collections::HashMap::new()
        };
        // parsed_functions is passed to translate_compute_pass and translate_render_pass below

        // MMU: allocate GPU memory arena
        console::log_1(&JsValue::from_str("[install_pipeline] Allocating arena..."));
        let mut arena = match mmu::allocate_arena(&self.device, &self.queue, &payload.manifest) {
            Ok(a) => a,
            Err(diagnostics) => {
                let receipt = InstallReceipt::error(diagnostics);
                return serde_json::to_string(&receipt).unwrap();
            }
        };

        // Compile each roster entry
        console::log_1(&JsValue::from_str(&format!(
            "[install_pipeline] Arena OK. Compiling {} roster entries...",
            payload.roster.len()
        )));
        let mut passes = Vec::new();
        for (entry_idx, entry) in payload.roster.iter().enumerate() {
            console::log_1(&JsValue::from_str(&format!(
                "[install_pipeline] Compiling roster entry {}...",
                entry_idx
            )));
            match entry {
                RosterEntry::Compute(spec) => {
                    console::log_1(&JsValue::from_str(&format!(
                        "[install_pipeline] Translating compute pass '{}'...",
                        spec.pass_id
                    )));
                    let compute_result = match std::panic::catch_unwind(AssertUnwindSafe(|| {
                        translator::translate_compute_pass(spec, &arena, Some(&parsed_functions))
                    })) {
                        Ok(result) => result,
                        Err(payload) => {
                            return install_error_json(
                                "ast_lowering",
                                Some(spec.pass_id.as_str()),
                                format!(
                                    "Compute translation panic in '{}': {}",
                                    spec.pass_id,
                                    panic_to_message(payload)
                                ),
                            );
                        }
                    };
                    // Debug: emit compute WGSL
                    if let Ok(wgsl) = naga::back::wgsl::write_string(
                        &compute_result.module,
                        &compute_result.info,
                        naga::back::wgsl::WriterFlags::empty(),
                    ) {
                        console::log_1(&JsValue::from_str(&format!(
                            "[install_pipeline] Compute WGSL:\n{}",
                            wgsl
                        )));
                    }
                    let shader = self
                        .device
                        .create_shader_module(wgpu::ShaderModuleDescriptor {
                            label: Some(&format!("compute_{}", spec.pass_id)),
                            source: wgpu::ShaderSource::Naga(std::borrow::Cow::Owned(
                                compute_result.module,
                            )),
                        });

                    let pipeline =
                        self.device
                            .create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                                label: Some(&format!("compute_{}", spec.pass_id)),
                                layout: None,
                                module: &shader,
                                entry_point: Some("main"),
                                compilation_options: Default::default(),
                                cache: None,
                            });

                    console::log_1(&JsValue::from_str(&format!(
                        "[install_pipeline] Compute '{}': uses_globals={}, uses_scalars={}, domains={}, textures={}, samplers={}",
                        spec.pass_id, compute_result.uses_globals, compute_result.uses_scalars,
                        compute_result.bound_domain_keys.len(),
                        compute_result.bound_texture_keys.len(),
                        compute_result.bound_sampler_keys.len(),
                    )));

                    // Group 0: uniforms (globals + scalars). Group 1: resources
                    // (domains + atomic domains + textures + samplers). The translator
                    // decides which group each binding sits in; we just mirror its layout.
                    let auto_group0 = build_bind_group(
                        &self.device,
                        &arena,
                        &pipeline.get_bind_group_layout(0),
                        "compute_group0",
                        BindGroupSelection {
                            include_globals: compute_result.uses_globals,
                            include_scalars: compute_result.uses_scalars,
                            ..Default::default()
                        },
                    );
                    let auto_group1 = build_bind_group(
                        &self.device,
                        &arena,
                        &pipeline.get_bind_group_layout(1),
                        "compute_group1",
                        BindGroupSelection {
                            domain_keys: &compute_result.bound_domain_keys,
                            atomic_domain_keys: &compute_result.bound_atomic_domain_keys,
                            texture_keys: &compute_result.bound_texture_keys,
                            sampler_keys: &compute_result.bound_sampler_keys,
                            ..Default::default()
                        },
                    );

                    let dispatch = match &spec.dispatch {
                        crate::contract::DispatchMode::Exact { x, y, z } => [*x, *y, *z],
                        crate::contract::DispatchMode::Domain { domain_id } => {
                            let Some(cap) =
                                payload.manifest.domains.get(domain_id).map(|d| d.capacity)
                            else {
                                return install_error_json(
                                    "manifest_allocation",
                                    Some(spec.pass_id.as_str()),
                                    format!(
                                        "Dispatch domain '{}' not found in manifest.domains",
                                        domain_id
                                    ),
                                );
                            };
                            // ceil(capacity / workgroup_size[0])
                            let wg = spec.workgroup_size[0].max(1);
                            let workgroups = (cap + wg - 1) / wg;
                            [workgroups, 1, 1]
                        }
                        crate::contract::DispatchMode::Texture { texture_id } => {
                            let Some(tex_info) = arena.textures.get(texture_id) else {
                                return install_error_json(
                                    "manifest_allocation",
                                    Some(spec.pass_id.as_str()),
                                    format!(
                                        "Dispatch texture '{}' not found in arena.textures",
                                        texture_id
                                    ),
                                );
                            };
                            let wg_x = spec.workgroup_size[0].max(1);
                            let wg_y = spec.workgroup_size[1].max(1);
                            let size = tex_info.texture.size();
                            let width = size.width;
                            let height = size.height;
                            [(width + wg_x - 1) / wg_x, (height + wg_y - 1) / wg_y, 1]
                        }
                    };

                    passes.push(CompiledPass::Compute {
                        pipeline,
                        group0: auto_group0,
                        group1: auto_group1,
                        dispatch,
                    });
                }

                RosterEntry::SystemCameraUpdate(spec) => {
                    console::log_1(&JsValue::from_str(&format!(
                        "[install_pipeline] Translating camera pass '{}' (cameraRef={})...",
                        spec.pass_id, spec.camera_ref
                    )));
                    // Synthesize a ComputePassSpec — camera is a 1-thread compute
                    let synthetic = crate::contract::ComputePassSpec {
                        pass_id: spec.pass_id.clone(),
                        source_block_ids: vec![],
                        workgroup_size: [1, 1, 1],
                        dispatch: crate::contract::DispatchMode::Exact { x: 1, y: 1, z: 1 },
                        dependencies: crate::contract::ComputeDependencies {
                            requires_globals: true,
                            domains: std::collections::HashMap::new(),
                            textures: std::collections::HashMap::new(),
                        },
                        ast: spec.ast.clone(),
                    };
                    let compute_result =
                        match std::panic::catch_unwind(AssertUnwindSafe(|| {
                            translator::translate_compute_pass(&synthetic, &arena, Some(&parsed_functions))
                        })) {
                            Ok(result) => result,
                            Err(payload) => {
                                return install_error_json(
                                    "ast_lowering",
                                    None,
                                    format!("Camera pass '{}' translation panicked: {:?}", spec.pass_id, payload),
                                );
                            }
                        };
                    let shader = self
                        .device
                        .create_shader_module(wgpu::ShaderModuleDescriptor {
                            label: Some(&format!("camera_{}", spec.pass_id)),
                            source: wgpu::ShaderSource::Naga(std::borrow::Cow::Owned(
                                compute_result.module,
                            )),
                        });
                    let pipeline =
                        self.device
                            .create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                                label: Some(&format!("camera_{}", spec.pass_id)),
                                layout: None,
                                module: &shader,
                                entry_point: Some("main"),
                                compilation_options: Default::default(),
                                cache: None,
                            });
                    // Bind globals + scalars (camera reads globals, writes scalars)
                    let group0 = build_bind_group(
                        &self.device,
                        &arena,
                        &pipeline.get_bind_group_layout(0),
                        "camera_group0",
                        BindGroupSelection {
                            include_globals: compute_result.uses_globals,
                            include_scalars: compute_result.uses_scalars,
                            ..Default::default()
                        },
                    );
                    passes.push(CompiledPass::Compute {
                        pipeline,
                        group0,
                        group1: None,
                        dispatch: [1, 1, 1],
                    });
                }

                RosterEntry::SystemDrawPrep(spec) => {
                    let (module, _info) = match std::panic::catch_unwind(AssertUnwindSafe(|| {
                        translator::translate_draw_prep(spec, &arena)
                    })) {
                        Ok(result) => result,
                        Err(payload) => {
                            return install_error_json(
                                "ast_lowering",
                                Some(spec.pass_id.as_str()),
                                format!(
                                    "DrawPrep translation panic in '{}': {}",
                                    spec.pass_id,
                                    panic_to_message(payload)
                                ),
                            );
                        }
                    };
                    let shader = self
                        .device
                        .create_shader_module(wgpu::ShaderModuleDescriptor {
                            label: Some(&format!("draw_prep_{}", spec.pass_id)),
                            source: wgpu::ShaderSource::Naga(std::borrow::Cow::Owned(module)),
                        });

                    let pipeline =
                        self.device
                            .create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                                label: Some(&format!("draw_prep_{}", spec.pass_id)),
                                layout: None,
                                module: &shader,
                                entry_point: Some("draw_prep"),
                                compilation_options: Default::default(),
                                cache: None,
                            });

                    let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("draw_prep_group0"),
                        layout: &pipeline.get_bind_group_layout(0),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: arena.scalars_buffer.as_entire_binding(),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: arena.indirect_buffer.as_entire_binding(),
                            },
                        ],
                    });

                    passes.push(CompiledPass::DrawPrep {
                        pipeline,
                        bind_group,
                    });
                }

                RosterEntry::Render(spec) => {
                    for draw_call in &spec.draw_calls {
                        let (shape_id, draw_mode) = match &draw_call.source {
                            DrawCallSource::Domain { shape_id, .. } => {
                                (shape_id.clone(), RenderDrawMode::Indirect)
                            }
                            DrawCallSource::FullScreenQuad => {
                                let builtin_shape_id = "__builtin:fullscreen-triangle".to_string();
                                if !arena.shape_bank.contains_key(&builtin_shape_id) {
                                    arena.shape_bank.insert(
                                        builtin_shape_id.clone(),
                                        built_in_fullscreen_shape(&self.device),
                                    );
                                }
                                (
                                    builtin_shape_id,
                                    RenderDrawMode::Direct {
                                        vertex_count: 3,
                                        instance_count: 1,
                                    },
                                )
                            }
                        };

                        let Some(shape) = arena.shape_bank.get(&shape_id) else {
                            return install_error_json(
                                "manifest_allocation",
                                Some(spec.pass_id.as_str()),
                                format!("Shape '{}' not found in manifest.shapeBank", shape_id),
                            );
                        };

                        let Some(color_target) = spec.targets.colors.first() else {
                            return install_error_json(
                                "manifest_allocation",
                                Some(spec.pass_id.as_str()),
                                "Render pass must declare at least one color target",
                            );
                        };
                        // Resolve color target format
                        let color_format = if color_target.texture_id == "canvas" {
                            self.surface_config.format
                        } else {
                            match arena.textures.get(&color_target.texture_id) {
                                Some(tex) => tex.format,
                                None => {
                                    return install_error_json(
                                        "pipeline_creation",
                                        Some(spec.pass_id.as_str()),
                                        format!("Color target texture '{}' not found in manifest", color_target.texture_id),
                                    );
                                }
                            }
                        };

                        let render_result = match std::panic::catch_unwind(AssertUnwindSafe(|| {
                            translator::translate_render_pass(draw_call, &arena, Some(&parsed_functions))
                        })) {
                            Ok(result) => result,
                            Err(payload) => {
                                return install_error_json(
                                    "ast_lowering",
                                    Some(spec.pass_id.as_str()),
                                    format!(
                                        "Render translation panic in '{}': {}",
                                        spec.pass_id,
                                        panic_to_message(payload)
                                    ),
                                );
                            }
                        };
                        let shader =
                            self.device
                                .create_shader_module(wgpu::ShaderModuleDescriptor {
                                    label: Some(&format!("render_{}", spec.pass_id)),
                                    source: wgpu::ShaderSource::Naga(std::borrow::Cow::Owned(
                                        render_result.module,
                                    )),
                                });

                        // Vertex buffer layout from shape
                        let vertex_buffer_layout = wgpu::VertexBufferLayout {
                            array_stride: shape.vertex_stride as u64,
                            step_mode: wgpu::VertexStepMode::Vertex,
                            attributes: &[wgpu::VertexAttribute {
                                format: wgpu::VertexFormat::Float32x2,
                                offset: 0,
                                shader_location: 0,
                            }],
                        };

                        let depth_stencil_state = spec
                            .targets
                            .depth_stencil
                            .as_ref()
                            .map(|depth_target| {
                                let tex = arena.textures.get(&depth_target.texture_id).ok_or_else(
                                    || {
                                        format!(
                                    "Depth/stencil texture '{}' not found in manifest.textures",
                                    depth_target.texture_id
                                )
                                    },
                                )?;
                                if !is_depth_or_stencil_format(tex.format) {
                                    return Err(format!(
                                        "Texture '{}' is not a depth/stencil format (got {:?})",
                                        depth_target.texture_id, tex.format
                                    ));
                                }
                                Ok(wgpu::DepthStencilState {
                                    format: tex.format,
                                    depth_write_enabled: Some(draw_call.pipeline_state.depth_write),
                                    depth_compare: Some(depth_compare_for(
                                        draw_call.pipeline_state.depth_compare,
                                    )),
                                    stencil: wgpu::StencilState {
                                        front: stencil_face_state_for(
                                            draw_call.pipeline_state.stencil_front.as_ref(),
                                        ),
                                        back: stencil_face_state_for(
                                            draw_call.pipeline_state.stencil_back.as_ref(),
                                        ),
                                        read_mask: draw_call
                                            .pipeline_state
                                            .stencil_read_mask
                                            .unwrap_or(u32::MAX),
                                        write_mask: draw_call
                                            .pipeline_state
                                            .stencil_write_mask
                                            .unwrap_or(u32::MAX),
                                    },
                                    bias: wgpu::DepthBiasState::default(),
                                })
                            })
                            .transpose();
                        let depth_stencil_state = match depth_stencil_state {
                            Ok(v) => v,
                            Err(message) => {
                                return install_error_json(
                                    "pipeline_creation",
                                    Some(spec.pass_id.as_str()),
                                    message,
                                );
                            }
                        };

                        let pipeline =
                            self.device
                                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                                    label: Some(&format!("render_{}", spec.pass_id)),
                                    layout: None,
                                    vertex: wgpu::VertexState {
                                        module: &shader,
                                        entry_point: Some("vs_main"),
                                        compilation_options: Default::default(),
                                        buffers: &[vertex_buffer_layout],
                                    },
                                    fragment: Some(wgpu::FragmentState {
                                        module: &shader,
                                        entry_point: Some("fs_main"),
                                        compilation_options: Default::default(),
                                        targets: &[Some(wgpu::ColorTargetState {
                                            format: color_format,
                                            blend: blend_state_for(
                                                draw_call.pipeline_state.blend_mode,
                                            ),
                                            write_mask: wgpu::ColorWrites::ALL,
                                        })],
                                    }),
                                    primitive: wgpu::PrimitiveState {
                                        topology: shape.topology,
                                        strip_index_format: None,
                                        front_face: wgpu::FrontFace::Ccw,
                                        cull_mode: cull_face_for(
                                            draw_call.pipeline_state.cull_mode,
                                        ),
                                        polygon_mode: wgpu::PolygonMode::Fill,
                                        unclipped_depth: false,
                                        conservative: false,
                                    },
                                    depth_stencil: depth_stencil_state.clone(),
                                    multisample: wgpu::MultisampleState {
                                        count: spec.sample_count,
                                        mask: !0,
                                        alpha_to_coverage_enabled: false,
                                    },
                                    multiview_mask: None,
                                    cache: None,
                                });

                        // Bind group: render passes use a single group with the
                        // full six-slot layout (matching translator's group 0).
                        let bind_group = build_bind_group(
                            &self.device,
                            &arena,
                            &pipeline.get_bind_group_layout(0),
                            "render_group0",
                            BindGroupSelection {
                                include_globals: render_result.uses_globals,
                                include_scalars: render_result.uses_scalars,
                                domain_keys: &render_result.bound_domain_keys,
                                atomic_domain_keys: &render_result.bound_atomic_domain_keys,
                                texture_keys: &render_result.bound_texture_keys,
                                sampler_keys: &render_result.bound_sampler_keys,
                            },
                        );

                        let color_load_op = color_load_op_for(color_target.load_op, color_target.clear_color);
                        let depth_stencil =
                            spec.targets.depth_stencil.as_ref().map(|depth_target| {
                                CompiledDepthStencilAttachment {
                                    texture_id: depth_target.texture_id.clone(),
                                    depth_ops: depth_ops_for(depth_target.depth),
                                    stencil_ops: stencil_ops_for(depth_target.stencil),
                                }
                            });
                        let vp = &spec.viewport;
                        let sc = &spec.scissor_rect;
                        passes.push(CompiledPass::Render {
                            pipeline,
                            bind_group,
                            vertex_buffer_id: shape_id,
                            draw_mode,
                            color_load_op,
                            color_target_id: color_target.texture_id.clone(),
                            depth_stencil,
                            viewport: [vp.x, vp.y, vp.width, vp.height, vp.min_depth, vp.max_depth],
                            scissor_rect: [sc.x as u32, sc.y as u32, sc.width as u32, sc.height as u32],
                        });
                    }
                }
            }
        }

        // Check if engine-driven globals exist
        let global_time_word_offset = arena.global_offset_map.get("sys:time").copied();
        let global_resolution_word_offset = arena.global_offset_map.get("sys:resolution").copied();

        let elapsed = js_sys::Date::now() - start;
        let receipt = InstallReceipt {
            status: "success".into(),
            compilation_time_ms: elapsed,
            global_offset_map: Some(arena.global_offset_map.clone()),
            frame_payload_length: Some(arena.frame_payload_length),
            diagnostics: vec![],
        };

        // [LAW:dataflow-not-control-flow] Pre-resolve whether any pass targets the
        // canvas, so execute_roster acquires the surface unconditionally before the loop.
        let needs_surface = passes.iter().any(|p| matches!(
            p,
            CompiledPass::Render { color_target_id, .. } if color_target_id == "canvas"
        ));

        self.compiled_roster = Some(CompiledRoster {
            arena,
            passes,
            global_time_word_offset,
            global_resolution_word_offset,
            needs_surface,
        });

        serde_json::to_string(&receipt).unwrap()
    }

    // -----------------------------------------------------------------------
    // Globals update
    // -----------------------------------------------------------------------

    pub fn update_globals(&self, data: &[u8]) {
        if let Some(ref roster) = self.compiled_roster {
            self.queue
                .write_buffer(&roster.arena.globals_buffer, 0, data);
        }
    }

    // -----------------------------------------------------------------------
    // Roster execution
    // -----------------------------------------------------------------------

    fn execute_roster(&mut self) -> Result<(), JsValue> {
        let roster = self.compiled_roster.as_ref().unwrap();

        // Write engine-driven globals (time, resolution) before GPU dispatch
        if let Some(offset) = roster.global_time_word_offset {
            let time_secs = (self.frame_count as f64 / 60.0) as f32;
            self.queue.write_buffer(
                &roster.arena.globals_buffer,
                (offset * 4) as u64,
                bytemuck::bytes_of(&time_secs),
            );
        }
        if let Some(offset) = roster.global_resolution_word_offset {
            let w = self.surface_config.width as f32;
            let h = self.surface_config.height as f32;
            let data: [f32; 2] = [w, h];
            self.queue.write_buffer(
                &roster.arena.globals_buffer,
                (offset * 4) as u64,
                bytemuck::cast_slice(&data),
            );
        }

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("roster_frame"),
            });

        let log_frame = self.frame_count < 3; // Log first 3 frames for diagnostics

        // [LAW:dataflow-not-control-flow] Acquire surface once before the loop.
        // The needs_surface flag was pre-resolved at compile time.
        let mut surface_output: Option<wgpu::SurfaceTexture> = None;
        let mut surface_view: Option<wgpu::TextureView> = None;
        if roster.needs_surface {
            let output = match self.surface.get_current_texture() {
                wgpu::CurrentSurfaceTexture::Success(output)
                | wgpu::CurrentSurfaceTexture::Suboptimal(output) => output,
                wgpu::CurrentSurfaceTexture::Timeout
                | wgpu::CurrentSurfaceTexture::Occluded => return Ok(()),
                other => {
                    return Err(JsValue::from_str(&format!(
                        "get_current_texture failed: {other:?}"
                    )));
                }
            };
            let view = output
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default());
            surface_view = Some(view);
            surface_output = Some(output);
        }

        for (pass_idx, pass) in roster.passes.iter().enumerate() {
            match pass {
                CompiledPass::Compute {
                    pipeline,
                    group0,
                    group1,
                    dispatch,
                } => {
                    let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                        label: Some("compute"),
                        timestamp_writes: None,
                    });
                    cpass.set_pipeline(pipeline);
                    if let Some(g0) = group0 {
                        cpass.set_bind_group(0, Some(g0), &[]);
                    }
                    if let Some(g1) = group1 {
                        cpass.set_bind_group(1, Some(g1), &[]);
                    }
                    cpass.dispatch_workgroups(dispatch[0], dispatch[1], dispatch[2]);
                }
                CompiledPass::DrawPrep {
                    pipeline,
                    bind_group,
                } => {
                    let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                        label: Some("draw_prep"),
                        timestamp_writes: None,
                    });
                    cpass.set_pipeline(pipeline);
                    cpass.set_bind_group(0, Some(bind_group), &[]);
                    cpass.dispatch_workgroups(1, 1, 1);
                }
                // [LAW:dataflow-not-control-flow] The render arm reads only pre-resolved
                // CompiledPass fields. No string comparisons, no unwrap_or defaults.
                CompiledPass::Render {
                    pipeline,
                    bind_group,
                    vertex_buffer_id,
                    draw_mode,
                    color_load_op,
                    color_target_id,
                    depth_stencil,
                    viewport,
                    scissor_rect,
                } => {
                    let Some(shape) = roster.arena.shape_bank.get(vertex_buffer_id) else {
                        return Err(JsValue::from_str(&format!(
                            "Compiled shape '{}' missing from arena",
                            vertex_buffer_id
                        )));
                    };
                    let depth_stencil_attachment = depth_stencil
                        .as_ref()
                        .map(|target| {
                            let Some(texture) = roster.arena.textures.get(&target.texture_id)
                            else {
                                return Err(JsValue::from_str(&format!(
                                    "Depth/stencil texture '{}' missing at runtime",
                                    target.texture_id
                                )));
                            };
                            Ok(wgpu::RenderPassDepthStencilAttachment {
                                view: &texture.view,
                                depth_ops: target.depth_ops,
                                stencil_ops: target.stencil_ops,
                            })
                        })
                        .transpose()?;

                    // Look up color target view. Canvas uses the per-frame surface
                    // (with MSAA resolve if active); named textures use the arena.
                    let (color_view, resolve_target) =
                        lookup_color_view(color_target_id, &surface_view, &self.msaa_view, &roster.arena);
                    let load = match color_load_op {
                        ColorLoadOp::Clear(color) => wgpu::LoadOp::Clear(*color),
                        ColorLoadOp::Load => wgpu::LoadOp::Load,
                    };
                    {
                        let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("render"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: color_view,
                                depth_slice: None,
                                resolve_target,
                                ops: wgpu::Operations {
                                    load,
                                    store: wgpu::StoreOp::Store,
                                },
                            })],
                            depth_stencil_attachment: depth_stencil_attachment,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });

                        rpass.set_viewport(viewport[0], viewport[1], viewport[2], viewport[3], viewport[4], viewport[5]);
                        rpass.set_scissor_rect(scissor_rect[0], scissor_rect[1], scissor_rect[2], scissor_rect[3]);

                        rpass.set_pipeline(pipeline);
                        if let Some(bg) = bind_group {
                            rpass.set_bind_group(0, Some(bg), &[]);
                        }
                        rpass.set_vertex_buffer(0, shape.vertex_buffer.slice(..));
                        match draw_mode {
                            RenderDrawMode::Indirect => {
                                rpass.draw_indirect(&roster.arena.indirect_buffer, 0);
                            }
                            RenderDrawMode::Direct {
                                vertex_count,
                                instance_count,
                            } => {
                                rpass.draw(0..*vertex_count, 0..*instance_count);
                            }
                        }
                    }
                }
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));

        if let Some(output) = surface_output {
            if log_frame {
                console::log_1(&JsValue::from_str(&format!(
                    "[FRAME {}] submit + present (surface {}x{}, {} passes, sample_count={})",
                    self.frame_count,
                    self.surface_config.width, self.surface_config.height,
                    roster.passes.len(), self.sample_count,
                )));
            }
            output.present();
        } else if log_frame {
            console::warn_1(&JsValue::from_str(&format!(
                "[FRAME {}] no surface acquired — nothing to present",
                self.frame_count,
            )));
        }

        Ok(())
    }

    /// Stub render: clears the canvas to dark gray.
    /// Proves the engine is alive and the surface is configured.
    pub fn render_clear_frame(&mut self) -> Result<(), JsValue> {
        let output = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(output)
            | wgpu::CurrentSurfaceTexture::Suboptimal(output) => output,
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                return Ok(())
            }
            other => {
                return Err(JsValue::from_str(&format!(
                    "get_current_texture failed: {other:?}"
                )));
            }
        };

        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("clear_frame"),
            });

        {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("clear_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.12,
                            g: 0.12,
                            b: 0.14,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }

    /// Main tick — called every rAF frame.
    /// Currently just clears and pumps telemetry.
    pub fn tick(&mut self, _timestamp_ms: f64) -> Result<(), JsValue> {
        let tick_start = js_sys::Date::now();
        self.scheduler.begin_loop_iteration(tick_start);

        // Check for fatal GPU errors
        if self.pending_fatal_gpu_error.load(Ordering::SeqCst) {
            let telemetry = SchedulerTelemetry::default();
            let elapsed = js_sys::Date::now() - tick_start;
            self.scheduler.record_fatal(
                tick_start,
                elapsed,
                "GPU_FATAL",
                "Pending fatal GPU error detected",
                "tick",
                telemetry,
            );
            return Ok(());
        }

        // Paused?
        if self.scheduler.state() == SchedulerState::Paused {
            let telemetry = SchedulerTelemetry::default();
            let elapsed = js_sys::Date::now() - tick_start;
            self.scheduler
                .record_paused_tick(tick_start, elapsed, telemetry);
            return Ok(());
        }

        // Render: execute compiled roster if available, otherwise clear
        if self.compiled_roster.is_some() {
            self.execute_roster()?;
        } else {
            self.render_clear_frame()?;
        }

        self.frame_count = self.frame_count.wrapping_add(1);
        let telemetry = SchedulerTelemetry::default();
        let elapsed = js_sys::Date::now() - tick_start;
        self.scheduler
            .record_tick_success(tick_start, elapsed, self.frame_count, telemetry);

        Ok(())
    }
}
