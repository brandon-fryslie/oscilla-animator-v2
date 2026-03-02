mod allocator;
mod compute;
mod engine;
mod memory;
mod render;
mod wgpu_compat;

use std::cell::RefCell;

use js_sys::Object;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, OffscreenCanvas};

use crate::engine::{Engine, EngineConfig};

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static LOOP_CALLBACK: RefCell<Option<Closure<dyn FnMut()>>> = RefCell::new(None);
}

fn worker_scope() -> Result<DedicatedWorkerGlobalScope, JsValue> {
    Ok(js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>()?)
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
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before attaching shared input"))?;
        engine.attach_shared_input(shared_input);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn pause_engine() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before pause_engine"))?;
        engine.pause();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn resume_engine() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before resume_engine"))?;
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
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before rebuild_pipeline"))?;
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
pub fn resize_surface(width: u32, height: u32) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before resize_surface"))?;
        engine.resize_surface(width, height);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn inject_poison_alloc() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before inject_poison_alloc"))?;
        engine.inject_poison_alloc();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn take_runtime_event_code() -> Result<u32, JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before take_runtime_event_code"))?;
        Ok(engine.take_runtime_event_code())
    })
}

#[wasm_bindgen]
pub fn take_frame_pacing_packet() -> Result<JsValue, JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before take_frame_pacing_packet"))?;
        if let Some(packet) = engine.take_frame_pacing_packet() {
            let payload = Object::new();
            js_sys::Reflect::set(&payload, &JsValue::from_str("meanMs"), &JsValue::from_f64(packet.mean_ms))?;
            js_sys::Reflect::set(&payload, &JsValue::from_str("stdDevMs"), &JsValue::from_f64(packet.std_dev_ms))?;
            js_sys::Reflect::set(
                &payload,
                &JsValue::from_str("sampleCount"),
                &JsValue::from_f64(packet.sample_count as f64),
            )?;
            js_sys::Reflect::set(
                &payload,
                &JsValue::from_str("frameCount"),
                &JsValue::from_f64(packet.frame_count as f64),
            )?;
            return Ok(payload.into());
        }
        Ok(JsValue::NULL)
    })
}

#[wasm_bindgen]
pub fn take_runtime_status() -> Result<JsValue, JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Rust engine must be initialized before take_runtime_status"))?;
        let payload = Object::new();
        js_sys::Reflect::set(
            &payload,
            &JsValue::from_str("state"),
            &JsValue::from_str(engine.runtime_state().as_str()),
        )?;
        js_sys::Reflect::set(
            &payload,
            &JsValue::from_str("frameCount"),
            &JsValue::from_f64(engine.frame_count() as f64),
        )?;
        js_sys::Reflect::set(
            &payload,
            &JsValue::from_str("lastEventCode"),
            &JsValue::from_f64(engine.last_event_code() as f64),
        )?;
        if let Some(message) = engine.last_error_message() {
            js_sys::Reflect::set(&payload, &JsValue::from_str("lastError"), &JsValue::from_str(message))?;
        } else {
            js_sys::Reflect::set(&payload, &JsValue::from_str("lastError"), &JsValue::NULL)?;
        }
        Ok(payload.into())
    })
}

fn start_worker_loop() -> Result<(), JsValue> {
    let global = worker_scope()?;
    let closure = Closure::wrap(Box::new(move || {
        ENGINE.with(|engine_cell| {
            if let Some(engine) = engine_cell.borrow_mut().as_mut() {
                if let Err(error) = engine.tick(js_sys::Date::now()) {
                    web_sys::console::error_1(&error);
                }
            }
        });

        if let Ok(worker) = worker_scope() {
            LOOP_CALLBACK.with(|slot| {
                if let Some(next_callback) = slot.borrow().as_ref() {
                    // [LAW:single-enforcer] Scheduling is owned at this worker
                    // boundary so tick cadence cannot diverge across callsites.
                    let _ = worker.set_timeout_with_callback_and_timeout_and_arguments_0(
                        next_callback.as_ref().unchecked_ref(),
                        16,
                    );
                }
            });
        }
    }) as Box<dyn FnMut()>);

    LOOP_CALLBACK.with(|slot| {
        *slot.borrow_mut() = Some(closure);
    });

    LOOP_CALLBACK.with(|slot| {
        if let Some(callback) = slot.borrow().as_ref() {
            global.set_timeout_with_callback_and_timeout_and_arguments_0(
                callback.as_ref().unchecked_ref(),
                16,
            )?;
            Ok(())
        } else {
            Err(JsValue::from_str("Rust engine failed to install worker loop callback"))
        }
    })
}
