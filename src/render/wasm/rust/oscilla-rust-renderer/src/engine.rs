use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use wasm_bindgen::JsValue;
use web_sys::console;
use web_sys::OffscreenCanvas;

use crate::allocator::StrictAllocator;
use crate::contract::{DrawCallSource, InstallReceipt, PipelineInstallPayload, RosterEntry};
use crate::error_boundary::{send_engine_error, EngineErrorPayload};
use crate::mmu::{self, GpuMemoryArena};
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
        clear_color: [f64; 4],
    },
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

        let now_ms = js_sys::Date::now();

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            sample_count,
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

        // MMU: allocate GPU memory arena
        console::log_1(&JsValue::from_str("[install_pipeline] Allocating arena..."));
        let arena = match mmu::allocate_arena(&self.device, &self.queue, &payload.manifest) {
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
                    let compute_result = translator::translate_compute_pass(spec, &arena);
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

                    // Group 0: only bind buffers the shader uses (matching translator)
                    let has_group0 = compute_result.uses_globals || compute_result.uses_scalars;
                    let auto_group0 = if has_group0 {
                        let mut entries = Vec::new();
                        let mut binding = 0u32;
                        if compute_result.uses_globals {
                            entries.push(wgpu::BindGroupEntry {
                                binding,
                                resource: arena.globals_buffer.as_entire_binding(),
                            });
                            binding += 1;
                        }
                        if compute_result.uses_scalars {
                            entries.push(wgpu::BindGroupEntry {
                                binding,
                                resource: arena.scalars_buffer.as_entire_binding(),
                            });
                        }
                        Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("compute_group0"),
                            layout: &pipeline.get_bind_group_layout(0),
                            entries: &entries,
                        }))
                    } else {
                        None
                    };

                    let has_group1 = !compute_result.bound_domain_keys.is_empty()
                        || !compute_result.bound_texture_keys.is_empty()
                        || !compute_result.bound_sampler_keys.is_empty();
                    let auto_group1 = if has_group1 {
                        let mut bg_entries = Vec::new();
                        let mut binding = 0u32;
                        // Domains first
                        for domain_id in &compute_result.bound_domain_keys {
                            bg_entries.push(wgpu::BindGroupEntry {
                                binding,
                                resource: arena.domain_buffers[domain_id].as_entire_binding(),
                            });
                            binding += 1;
                        }
                        // Textures next
                        for tex_id in &compute_result.bound_texture_keys {
                            bg_entries.push(wgpu::BindGroupEntry {
                                binding,
                                resource: wgpu::BindingResource::TextureView(
                                    &arena.textures[tex_id].view,
                                ),
                            });
                            binding += 1;
                        }
                        // Samplers last
                        for sampler_id in &compute_result.bound_sampler_keys {
                            bg_entries.push(wgpu::BindGroupEntry {
                                binding,
                                resource: wgpu::BindingResource::Sampler(
                                    &arena.samplers[sampler_id],
                                ),
                            });
                            binding += 1;
                        }
                        Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some("compute_group1"),
                            layout: &pipeline.get_bind_group_layout(1),
                            entries: &bg_entries,
                        }))
                    } else {
                        None
                    };

                    let dispatch = match &spec.dispatch {
                        crate::contract::DispatchMode::Exact { x, y, z } => [*x, *y, *z],
                        crate::contract::DispatchMode::Domain { domain_id } => {
                            let cap = payload
                                .manifest
                                .domains
                                .get(domain_id)
                                .map(|d| d.capacity)
                                .unwrap_or(1);
                            // ceil(capacity / workgroup_size[0])
                            let wg = spec.workgroup_size[0].max(1);
                            let workgroups = (cap + wg - 1) / wg;
                            [workgroups, 1, 1]
                        }
                        _ => [1, 1, 1],
                    };

                    passes.push(CompiledPass::Compute {
                        pipeline,
                        group0: auto_group0,
                        group1: auto_group1,
                        dispatch,
                    });
                }

                RosterEntry::SystemDrawPrep(spec) => {
                    let (module, _info) = translator::translate_draw_prep(spec, &arena);
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
                        let (shape_id, _domain_id) = match &draw_call.source {
                            DrawCallSource::Domain {
                                shape_id,
                                domain_id,
                                ..
                            } => (shape_id.clone(), domain_id.clone()),
                            DrawCallSource::FullScreenQuad => {
                                panic!("FullScreenQuad not yet implemented");
                            }
                        };

                        let shape = arena.shape_bank.get(&shape_id).unwrap_or_else(|| {
                            panic!("Shape '{}' not found in arena shape_bank", shape_id)
                        });

                        let render_result = translator::translate_render_pass(draw_call, &arena);
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
                                            format: self.surface_config.format,
                                            blend: Some(wgpu::BlendState::REPLACE),
                                            write_mask: wgpu::ColorWrites::ALL,
                                        })],
                                    }),
                                    primitive: wgpu::PrimitiveState {
                                        topology: shape.topology,
                                        strip_index_format: None,
                                        front_face: wgpu::FrontFace::Ccw,
                                        cull_mode: None,
                                        polygon_mode: wgpu::PolygonMode::Fill,
                                        unclipped_depth: false,
                                        conservative: false,
                                    },
                                    depth_stencil: None,
                                    multisample: wgpu::MultisampleState::default(),
                                    multiview_mask: None,
                                    cache: None,
                                });

                        // Bind group: domains + textures (matching translator's group 0 layout)
                        let has_bindings = !render_result.bound_domain_keys.is_empty()
                            || !render_result.bound_texture_keys.is_empty()
                            || !render_result.bound_sampler_keys.is_empty();
                        let bind_group = if has_bindings {
                            let mut bg_entries = Vec::new();
                            let mut binding = 0u32;
                            for domain_id in &render_result.bound_domain_keys {
                                bg_entries.push(wgpu::BindGroupEntry {
                                    binding,
                                    resource: arena.domain_buffers[domain_id].as_entire_binding(),
                                });
                                binding += 1;
                            }
                            for tex_id in &render_result.bound_texture_keys {
                                bg_entries.push(wgpu::BindGroupEntry {
                                    binding,
                                    resource: wgpu::BindingResource::TextureView(
                                        &arena.textures[tex_id].view,
                                    ),
                                });
                                binding += 1;
                            }
                            for sampler_id in &render_result.bound_sampler_keys {
                                bg_entries.push(wgpu::BindGroupEntry {
                                    binding,
                                    resource: wgpu::BindingResource::Sampler(
                                        &arena.samplers[sampler_id],
                                    ),
                                });
                                binding += 1;
                            }
                            Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                                label: Some("render_group0"),
                                layout: &pipeline.get_bind_group_layout(0),
                                entries: &bg_entries,
                            }))
                        } else {
                            None
                        };

                        let clear_color = spec
                            .targets
                            .colors
                            .first()
                            .and_then(|c| c.clear_color)
                            .unwrap_or([0.0, 0.0, 0.0, 1.0]);

                        passes.push(CompiledPass::Render {
                            pipeline,
                            bind_group,
                            vertex_buffer_id: shape_id,
                            clear_color,
                        });
                    }
                }
            }
        }

        // Check if sys:time global exists
        let global_time_word_offset = arena.global_offset_map.get("sys:time").copied();

        let elapsed = js_sys::Date::now() - start;
        let receipt = InstallReceipt {
            status: "success".into(),
            compilation_time_ms: elapsed,
            global_offset_map: Some(arena.global_offset_map.clone()),
            frame_payload_length: Some(arena.frame_payload_length),
            diagnostics: vec![],
        };

        self.compiled_roster = Some(CompiledRoster {
            arena,
            passes,
            global_time_word_offset,
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

        // Write time to globals buffer (engine-driven for this slice)
        if let Some(offset) = roster.global_time_word_offset {
            let time_secs = (self.frame_count as f64 / 60.0) as f32;
            self.queue.write_buffer(
                &roster.arena.globals_buffer,
                (offset * 4) as u64,
                bytemuck::bytes_of(&time_secs),
            );
        }

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("roster_frame"),
            });

        // Track whether we need to present a surface texture
        let mut surface_output: Option<wgpu::SurfaceTexture> = None;
        let mut surface_view: Option<wgpu::TextureView> = None;

        for pass in &roster.passes {
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
                CompiledPass::Render {
                    pipeline,
                    bind_group,
                    vertex_buffer_id,
                    clear_color,
                } => {
                    // Acquire surface texture if we haven't already
                    if surface_output.is_none() {
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

                    let view = surface_view.as_ref().unwrap();
                    let shape = &roster.arena.shape_bank[vertex_buffer_id];

                    {
                        let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: Some("render"),
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view,
                                depth_slice: None,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color {
                                        r: clear_color[0],
                                        g: clear_color[1],
                                        b: clear_color[2],
                                        a: clear_color[3],
                                    }),
                                    store: wgpu::StoreOp::Store,
                                },
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                            multiview_mask: None,
                        });

                        rpass.set_pipeline(pipeline);
                        if let Some(bg) = bind_group {
                            rpass.set_bind_group(0, Some(bg), &[]);
                        }
                        rpass.set_vertex_buffer(0, shape.vertex_buffer.slice(..));
                        rpass.draw_indirect(&roster.arena.indirect_buffer, 0);
                    }
                }
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));

        if let Some(output) = surface_output {
            output.present();
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
