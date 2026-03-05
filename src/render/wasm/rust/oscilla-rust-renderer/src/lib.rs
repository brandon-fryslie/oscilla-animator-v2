mod allocator;
mod compute;
mod engine;
mod memory;
mod render;
mod scheduler;

use std::cell::RefCell;

use js_sys::{Array, Function, Object};
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, OffscreenCanvas};

use crate::compute::CompilerComputePassSpec;
use crate::engine::{Engine, EngineConfig};

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static LOOP_CALLBACK: RefCell<Option<Closure<dyn FnMut(f64)>>> = RefCell::new(None);
}

fn worker_scope() -> Result<DedicatedWorkerGlobalScope, JsValue> {
    Ok(js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>()?)
}

fn read_required_string_field(value: &JsValue, field: &str) -> Result<String, JsValue> {
    let raw = js_sys::Reflect::get(value, &JsValue::from_str(field))?;
    raw.as_string()
        .ok_or_else(|| JsValue::from_str(format!("GPU pass field '{}' must be a string", field).as_str()))
}

fn parse_gpu_pass_specs(passes: JsValue) -> Result<Vec<CompilerComputePassSpec>, JsValue> {
    if !Array::is_array(&passes) {
        return Err(JsValue::from_str("GPU pass payload must be an array"));
    }
    let list = Array::from(&passes);
    if list.length() == 0 {
        return Err(JsValue::from_str("GPU pass payload must contain at least one pass"));
    }
    let mut specs = Vec::with_capacity(list.length() as usize);
    for idx in 0..list.length() {
        let item = list.get(idx);
        if !item.is_object() {
            return Err(JsValue::from_str(
                format!("GPU pass payload item {} must be an object", idx).as_str(),
            ));
        }
        let stage = read_required_string_field(&item, "stage")?;
        if stage != "compute" {
            return Err(JsValue::from_str(
                format!("GPU pass {} has unsupported stage '{}'", idx, stage).as_str(),
            ));
        }
        specs.push(CompilerComputePassSpec {
            pass_id: read_required_string_field(&item, "passId")?,
            entry_point: read_required_string_field(&item, "entryPoint")?,
            wgsl: read_required_string_field(&item, "wgsl")?,
        });
    }
    Ok(specs)
}

#[wasm_bindgen]
pub async fn init_engine(
    canvas: OffscreenCanvas,
    max_particles: u32,
    max_shapes: u32,
    debug_readback_hz: u32,
) -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    let config = EngineConfig {
        max_particles: max_particles as usize,
        max_shapes: max_shapes as usize,
        debug_readback_hz,
    };
    let engine = Engine::new(canvas, config).await?;
    ENGINE.with(|engine_cell| {
        // [LAW:single-enforcer] The worker runtime stores one canonical engine
        // instance; worker callbacks and rebuild commands mutate this owner only.
        *engine_cell.borrow_mut() = Some(engine);
    });
    start_worker_loop()
}

#[wasm_bindgen]
pub fn attach_shared_input(shared_input: js_sys::SharedArrayBuffer) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before attaching shared input")
        })?;
        engine.attach_shared_input(shared_input);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn attach_shared_shape_bank(
    shared_shape_bank: js_sys::SharedArrayBuffer,
) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before attaching shared shape bank")
        })?;
        engine.attach_shared_shape_bank(shared_shape_bank);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn attach_shared_sink_table(
    shared_sink_table: js_sys::SharedArrayBuffer,
) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before attaching shared sink table")
        })?;
        engine.attach_shared_sink_table(shared_sink_table);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn pause_engine() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before pause_engine")
        })?;
        engine.pause();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn resume_engine() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before resume_engine")
        })?;
        engine.resume();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn rebuild_pipeline(
    simulation_wgsl: String,
    assembly_wgsl: String,
    uber_shader_wgsl: String,
    particle_count: u32,
    shape_count: u32,
) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before rebuild_pipeline")
        })?;
        engine.rebuild_pipeline(
            simulation_wgsl.as_str(),
            assembly_wgsl.as_str(),
            uber_shader_wgsl.as_str(),
            particle_count,
            shape_count,
        );
        Ok(())
    })
}

#[wasm_bindgen]
pub fn rebuild_gpu_pipelines(passes: JsValue) -> Result<(), JsValue> {
    let pass_specs = parse_gpu_pass_specs(passes)?;
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before rebuild_gpu_pipelines")
        })?;
        engine.rebuild_gpu_pipelines(pass_specs.as_slice());
        Ok(())
    })
}

#[wasm_bindgen]
pub fn resize_surface(width: u32, height: u32) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before resize_surface")
        })?;
        engine.resize_surface(width, height);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn inject_poison_alloc() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before inject_poison_alloc")
        })?;
        engine.inject_poison_alloc();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn take_frame_pacing_packet() -> Result<JsValue, JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before take_frame_pacing_packet")
        })?;
        if let Some(packet) = engine.take_frame_pacing_packet() {
            let payload = Object::new();
            js_sys::Reflect::set(
                &payload,
                &JsValue::from_str("state"),
                &JsValue::from_str(packet.state.as_str()),
            )?;
            let heartbeat = Object::new();
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("sequence"),
                &JsValue::from_f64(packet.heartbeat.sequence as f64),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("state"),
                &JsValue::from_str(packet.heartbeat.state.as_str()),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("emittedAtMs"),
                &JsValue::from_f64(packet.heartbeat.emitted_at_ms),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("frameCount"),
                &JsValue::from_f64(packet.heartbeat.frame_count as f64),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("loopCount"),
                &JsValue::from_f64(packet.heartbeat.loop_count as f64),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("meanTickMs"),
                &JsValue::from_f64(packet.heartbeat.mean_tick_ms),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("stdDevTickMs"),
                &JsValue::from_f64(packet.heartbeat.std_dev_tick_ms),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("sampleCount"),
                &JsValue::from_f64(packet.heartbeat.sample_count as f64),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("lastTickMs"),
                &JsValue::from_f64(packet.heartbeat.last_tick_ms),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("lastSuccessMs"),
                &JsValue::from_f64(packet.heartbeat.last_success_ms),
            )?;
            let telemetry = Object::new();
            let stage_timings = Object::new();
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("inputMarshalMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.input_marshal_ms),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("simulationDispatchMs"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .stage_timings
                        .simulation_dispatch_ms,
                ),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("fluidPassChainMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.fluid_pass_chain_ms),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("drawPrepMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.draw_prep_ms),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("renderMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.render_ms),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("swapMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.swap_ms),
            )?;
            js_sys::Reflect::set(
                &stage_timings,
                &JsValue::from_str("totalFrameMs"),
                &JsValue::from_f64(packet.heartbeat.telemetry.stage_timings.total_frame_ms),
            )?;

            let dispatch_counters = Object::new();
            js_sys::Reflect::set(
                &dispatch_counters,
                &JsValue::from_str("computeDispatchCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .dispatch_counters
                        .compute_dispatch_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &dispatch_counters,
                &JsValue::from_str("computeWorkgroupCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .dispatch_counters
                        .compute_workgroup_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &dispatch_counters,
                &JsValue::from_str("activeLaneCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .dispatch_counters
                        .active_lane_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &dispatch_counters,
                &JsValue::from_str("guardedLaneCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .dispatch_counters
                        .guarded_lane_count as f64,
                ),
            )?;

            let resource_stats = Object::new();
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("shapeBankWordCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .resource_stats
                        .shape_bank_word_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("sinkTableWordCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .resource_stats
                        .sink_table_word_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("indexedRecordCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .resource_stats
                        .indexed_record_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("nonIndexedRecordCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .resource_stats
                        .non_indexed_record_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("totalInstanceCount"),
                &JsValue::from_f64(
                    packet
                        .heartbeat
                        .telemetry
                        .resource_stats
                        .total_instance_count as f64,
                ),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("canvasWidth"),
                &JsValue::from_f64(packet.heartbeat.telemetry.resource_stats.canvas_width as f64),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("canvasHeight"),
                &JsValue::from_f64(packet.heartbeat.telemetry.resource_stats.canvas_height as f64),
            )?;
            js_sys::Reflect::set(
                &resource_stats,
                &JsValue::from_str("pingPongIndex"),
                &JsValue::from_f64(
                    packet.heartbeat.telemetry.resource_stats.ping_pong_index as f64,
                ),
            )?;

            js_sys::Reflect::set(
                &telemetry,
                &JsValue::from_str("stageTimings"),
                &stage_timings.into(),
            )?;
            js_sys::Reflect::set(
                &telemetry,
                &JsValue::from_str("dispatchCounters"),
                &dispatch_counters.into(),
            )?;
            js_sys::Reflect::set(
                &telemetry,
                &JsValue::from_str("resourceStats"),
                &resource_stats.into(),
            )?;
            js_sys::Reflect::set(
                &heartbeat,
                &JsValue::from_str("telemetry"),
                &telemetry.into(),
            )?;
            js_sys::Reflect::set(&payload, &JsValue::from_str("heartbeat"), &heartbeat.into())?;

            let events = Array::new();
            for event in packet.events {
                let event_payload = Object::new();
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("severity"),
                    &JsValue::from_str(event.severity.as_str()),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("code"),
                    &JsValue::from_str(event.code),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("stage"),
                    &JsValue::from_str(event.stage),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("message"),
                    &JsValue::from_str(event.message.as_str()),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("state"),
                    &JsValue::from_str(event.state.as_str()),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("frameCount"),
                    &JsValue::from_f64(event.frame_count as f64),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("loopCount"),
                    &JsValue::from_f64(event.loop_count as f64),
                )?;
                js_sys::Reflect::set(
                    &event_payload,
                    &JsValue::from_str("emittedAtMs"),
                    &JsValue::from_f64(event.emitted_at_ms),
                )?;
                events.push(&event_payload.into());
            }
            js_sys::Reflect::set(&payload, &JsValue::from_str("events"), &events.into())?;

            js_sys::Reflect::set(
                &payload,
                &JsValue::from_str("frameCount"),
                &JsValue::from_f64(packet.heartbeat.frame_count as f64),
            )?;
            return Ok(payload.into());
        }
        Ok(JsValue::NULL)
    })
}

fn start_worker_loop() -> Result<(), JsValue> {
    let global = worker_scope()?;
    let closure = Closure::wrap(Box::new(move |timestamp_ms: f64| {
        ENGINE.with(|engine_cell| {
            if let Some(engine) = engine_cell.borrow_mut().as_mut() {
                if let Err(error) = engine.tick(timestamp_ms) {
                    web_sys::console::error_1(&error);
                }
            }
        });

        if let Ok(worker) = worker_scope() {
            LOOP_CALLBACK.with(|slot| {
                if let Some(next_callback) = slot.borrow().as_ref() {
                    // [LAW:single-enforcer] Scheduling is owned at this worker
                    // boundary so tick cadence cannot diverge across callsites.
                    let _ = worker.request_animation_frame(next_callback.as_ref().unchecked_ref());
                }
            });
        }
    }) as Box<dyn FnMut(f64)>);

    let first_callback = LOOP_CALLBACK.with(|slot| {
        let mut slot_mut = slot.borrow_mut();
        *slot_mut = Some(closure);
        slot_mut
            .as_ref()
            .map(|callback| callback.as_ref().unchecked_ref::<Function>().clone())
    });
    if let Some(callback) = first_callback {
        global.request_animation_frame(callback.unchecked_ref())?;
        Ok(())
    } else {
        Err(JsValue::from_str(
            "Rust engine failed to install worker loop callback",
        ))
    }
}
