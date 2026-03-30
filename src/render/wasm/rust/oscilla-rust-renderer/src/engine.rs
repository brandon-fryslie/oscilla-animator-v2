use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use wasm_bindgen::JsValue;
use web_sys::console;
use web_sys::OffscreenCanvas;

use crate::allocator::StrictAllocator;
use crate::error_boundary::{send_engine_error, EngineErrorPayload};
use crate::scheduler::WorkerScheduler;
use crate::telemetry::{
    SchedulerState, SchedulerTelemetry, WorkerObservabilityPacket,
};

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

pub struct Engine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    sample_count: u32,
    scheduler: WorkerScheduler,
    frame_count: u64,
    pending_fatal_gpu_error: Arc<AtomicBool>,
}

impl Engine {
    pub async fn new(
        canvas: OffscreenCanvas,
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

    /// Stub render: clears the canvas to dark gray.
    /// Proves the engine is alive and the surface is configured.
    pub fn render_clear_frame(&mut self) -> Result<(), JsValue> {
        let output = match self.surface.get_current_texture() {
            Ok(output) => output,
            Err(wgpu::SurfaceError::Timeout) => return Ok(()),
            Err(error) => {
                return Err(JsValue::from_str(&format!(
                    "get_current_texture failed: {error}"
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

        // Render (currently just clear)
        self.render_clear_frame()?;

        self.frame_count = self.frame_count.wrapping_add(1);
        let telemetry = SchedulerTelemetry::default();
        let elapsed = js_sys::Date::now() - tick_start;
        self.scheduler.record_tick_success(
            tick_start,
            elapsed,
            self.frame_count,
            telemetry,
        );

        Ok(())
    }
}
