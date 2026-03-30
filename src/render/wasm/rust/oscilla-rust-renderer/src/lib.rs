mod allocator;
pub mod dsl;
mod engine;
mod error_boundary;
mod scheduler;
mod telemetry;

#[cfg(test)]
mod dsl_tests;

use std::cell::{Cell, RefCell};

use js_sys::Function;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, OffscreenCanvas};

use crate::engine::Engine;
use crate::error_boundary::install_panic_hook;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static LOOP_CALLBACK: RefCell<Option<Closure<dyn FnMut(f64)>>> = RefCell::new(None);
    static LOOP_ARMED: Cell<bool> = const { Cell::new(false) };
}

fn worker_scope() -> Result<DedicatedWorkerGlobalScope, JsValue> {
    Ok(js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>()?)
}

fn should_schedule_next_frame() -> bool {
    ENGINE.with(|engine_cell| {
        engine_cell
            .borrow()
            .as_ref()
            .map(Engine::should_schedule_next_frame)
            .unwrap_or(false)
    })
}

fn arm_worker_loop_if_needed() -> Result<(), JsValue> {
    if !should_schedule_next_frame() {
        return Ok(());
    }
    let was_armed = LOOP_ARMED.with(|armed| {
        let already_armed = armed.get();
        armed.set(true);
        already_armed
    });
    if was_armed {
        return Ok(());
    }
    let callback = LOOP_CALLBACK.with(|slot| {
        slot.borrow()
            .as_ref()
            .map(|installed| installed.as_ref().unchecked_ref::<Function>().clone())
    });
    let worker = worker_scope();
    match (callback, worker) {
        (Some(callback), Ok(worker)) => {
            // [LAW:single-enforcer] requestAnimationFrame arming is centralized
            // at one worker boundary so rebuild and tick reuse one cadence gate.
            worker.request_animation_frame(callback.unchecked_ref())?;
            Ok(())
        }
        (Some(_), Err(error)) => {
            LOOP_ARMED.with(|armed| armed.set(false));
            Err(error)
        }
        (None, _) => {
            LOOP_ARMED.with(|armed| armed.set(false));
            Err(JsValue::from_str(
                "Rust engine failed to install worker loop callback",
            ))
        }
    }
}

// ---------------------------------------------------------------------------
// WASM Exports
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub async fn init_engine(
    canvas: OffscreenCanvas,
    initial_width: u32,
    initial_height: u32,
) -> Result<(), JsValue> {
    install_panic_hook();
    let engine = Engine::new(canvas, initial_width, initial_height).await?;
    ENGINE.with(|engine_cell| {
        // [LAW:single-enforcer] The worker runtime stores one canonical engine
        // instance; worker callbacks and rebuild commands mutate this owner only.
        *engine_cell.borrow_mut() = Some(engine);
    });
    start_worker_loop()
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
        Ok::<(), JsValue>(())
    })?;
    arm_worker_loop_if_needed()
}

/// Phase 1: Pipeline Install — receives the full PipelineInstallPayload JSON.
/// Returns an InstallReceipt JSON object.
///
/// STUB: Returns error receipt until the MMU + AST translator are implemented.
#[wasm_bindgen]
pub fn install_pipeline(_payload: JsValue) -> Result<JsValue, JsValue> {
    // TODO: Deserialize PipelineInstallPayload, run MMU, translate AST, compile pipelines
    let receipt = js_sys::Object::new();
    js_sys::Reflect::set(
        &receipt,
        &JsValue::from_str("status"),
        &JsValue::from_str("error"),
    )?;
    js_sys::Reflect::set(
        &receipt,
        &JsValue::from_str("compilationTimeMs"),
        &JsValue::from_f64(0.0),
    )?;
    let diagnostics = js_sys::Array::new();
    let diag = js_sys::Object::new();
    js_sys::Reflect::set(
        &diag,
        &JsValue::from_str("severity"),
        &JsValue::from_str("error"),
    )?;
    js_sys::Reflect::set(
        &diag,
        &JsValue::from_str("phase"),
        &JsValue::from_str("manifest_allocation"),
    )?;
    js_sys::Reflect::set(
        &diag,
        &JsValue::from_str("message"),
        &JsValue::from_str("install_pipeline not yet implemented"),
    )?;
    diagnostics.push(&diag.into());
    js_sys::Reflect::set(
        &receipt,
        &JsValue::from_str("diagnostics"),
        &diagnostics.into(),
    )?;
    Ok(receipt.into())
}

/// Phase 2 Avenue 1: Update globals (Float32Array written to uniform buffer).
///
/// STUB: No-op until MMU allocates the globals buffer.
#[wasm_bindgen]
pub fn update_globals(_data: &[u8]) -> Result<(), JsValue> {
    // TODO: queue.write_buffer(globals_buffer, 0, data)
    Ok(())
}

/// Phase 2: Execute the compiled roster (compute → draw_prep → render → submit).
///
/// STUB: Clears canvas to dark gray so we can visually confirm the engine is alive.
#[wasm_bindgen]
pub fn render_frame() -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before render_frame")
        })?;
        engine.render_clear_frame()
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
            return packet.to_js_value();
        }
        Ok(JsValue::NULL)
    })
}

fn start_worker_loop() -> Result<(), JsValue> {
    let closure = Closure::wrap(Box::new(move |timestamp_ms: f64| {
        LOOP_ARMED.with(|armed| armed.set(false));
        ENGINE.with(|engine_cell| {
            if let Some(engine) = engine_cell.borrow_mut().as_mut() {
                if let Err(error) = engine.tick(timestamp_ms) {
                    web_sys::console::error_1(&error);
                }
            }
        });
        let _ = arm_worker_loop_if_needed();
    }) as Box<dyn FnMut(f64)>);

    LOOP_CALLBACK.with(|slot| {
        let mut slot_mut = slot.borrow_mut();
        *slot_mut = Some(closure);
    });
    arm_worker_loop_if_needed()
}
