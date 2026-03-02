mod allocator;
mod compute;
mod engine;
mod memory;
mod render;

use std::cell::RefCell;
use std::rc::Rc;

use js_sys::Object;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, OffscreenCanvas};

use crate::engine::{Engine, EngineConfig};

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static RAF_CALLBACK: RefCell<Option<Closure<dyn FnMut(f64)>>> = RefCell::new(None);
}

fn worker_scope() -> Result<DedicatedWorkerGlobalScope, JsValue> {
    js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>()
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

fn start_worker_loop() -> Result<(), JsValue> {
    let global = worker_scope()?;
    let callback_cell: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
    let callback_cell_clone = Rc::clone(&callback_cell);

    let closure = Closure::wrap(Box::new(move |timestamp_ms: f64| {
        ENGINE.with(|engine_cell| {
            if let Some(engine) = engine_cell.borrow_mut().as_mut() {
                if let Err(error) = engine.tick(timestamp_ms) {
                    web_sys::console::error_1(&error);
                }
            }
        });

        if let Ok(worker) = worker_scope() {
            if let Some(next_callback) = callback_cell_clone.borrow().as_ref() {
                let _ = worker.request_animation_frame(next_callback.as_ref().unchecked_ref());
            }
        }
    }) as Box<dyn FnMut(f64)>);

    *callback_cell.borrow_mut() = Some(closure);

    RAF_CALLBACK.with(|slot| {
        *slot.borrow_mut() = callback_cell.borrow_mut().take();
    });

    RAF_CALLBACK.with(|slot| {
        if let Some(callback) = slot.borrow().as_ref() {
            global.request_animation_frame(callback.as_ref().unchecked_ref())?;
            Ok(())
        } else {
            Err(JsValue::from_str("Rust engine failed to install worker RAF callback"))
        }
    })
}
