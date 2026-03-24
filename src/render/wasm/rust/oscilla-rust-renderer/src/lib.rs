mod allocator;
mod compute;
mod default_shaders;
mod engine;
mod error_boundary;
mod fluid_kernels;
mod memory;
mod render;
mod scheduler;
mod shader_prelude;
mod telemetry;

use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use js_sys::{Array, Function, Object, Reflect};
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, OffscreenCanvas};

use crate::compute::CompilerComputePassSpec;
use crate::engine::{Engine, EngineConfig, PipelineRebuildFailure};
use crate::error_boundary::install_panic_hook;
use crate::memory::MemoryManifest;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
    static LOOP_CALLBACK: RefCell<Option<Closure<dyn FnMut(f64)>>> = RefCell::new(None);
    static LOOP_ARMED: Cell<bool> = const { Cell::new(false) };
}

fn worker_scope() -> Result<DedicatedWorkerGlobalScope, JsValue> {
    Ok(js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>()?)
}

fn read_required_string_field(value: &JsValue, field: &str) -> Result<String, JsValue> {
    let raw = js_sys::Reflect::get(value, &JsValue::from_str(field))?;
    raw.as_string().ok_or_else(|| {
        JsValue::from_str(format!("GPU pass field '{}' must be a string", field).as_str())
    })
}

fn read_optional_memory_manifest_field(
    value: &JsValue,
    field: &str,
) -> Result<Option<MemoryManifest>, JsValue> {
    let raw = js_sys::Reflect::get(value, &JsValue::from_str(field))?;
    if raw.is_undefined() || raw.is_null() {
        return Ok(None);
    }
    let json = js_sys::JSON::stringify(&raw)?
        .as_string()
        .ok_or_else(|| JsValue::from_str("GPU pass memoryManifest must be JSON-serializable"))?;
    let manifest: MemoryManifest = serde_json::from_str(&json).map_err(|error| {
        JsValue::from_str(
            format!("GPU pass field '{}' is not a valid MemoryManifest: {}", field, error)
                .as_str(),
        )
    })?;
    Ok(Some(manifest))
}

fn pipeline_rebuild_failure_to_js_value(error: PipelineRebuildFailure) -> JsValue {
    let object = Object::new();
    let _ = Reflect::set(
        &object,
        &JsValue::from_str("code"),
        &JsValue::from_str(error.code),
    );
    let _ = Reflect::set(
        &object,
        &JsValue::from_str("passId"),
        &JsValue::from_str(error.pass_id.as_str()),
    );
    let _ = Reflect::set(
        &object,
        &JsValue::from_str("message"),
        &JsValue::from_str(error.message.as_str()),
    );
    object.into()
}

fn parse_gpu_pass_specs(passes: JsValue) -> Result<Vec<CompilerComputePassSpec>, JsValue> {
    if !Array::is_array(&passes) {
        return Err(JsValue::from_str("GPU pass payload must be an array"));
    }
    let list = Array::from(&passes);
    if list.length() == 0 {
        return Err(JsValue::from_str(
            "GPU pass payload must contain at least one pass",
        ));
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
        match stage.as_str() {
            "compute" => {
                // [LAW:single-enforcer] ComputeDispatcher is the only runtime owner
                // of executable pass compilation in this engine revision.
                specs.push(CompilerComputePassSpec {
                    pass_id: read_required_string_field(&item, "passId")?,
                    entry_point: read_required_string_field(&item, "entryPoint")?,
                    wgsl: read_required_string_field(&item, "wgsl")?,
                    memory_manifest: read_optional_memory_manifest_field(&item, "memoryManifest")?,
                });
            }
            _ => {
                return Err(JsValue::from_str(
                    format!("GPU pass {} has unsupported stage '{}'", idx, stage).as_str(),
                ));
            }
        }
    }
    if specs.is_empty() {
        return Err(JsValue::from_str(
            // [LAW:no-silent-fallbacks] The compute pipeline install boundary
            // must fail explicitly when no executable compute pass is present.
            "GPU pass payload must contain at least one compute pass",
        ));
    }
    Ok(specs)
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

#[wasm_bindgen]
pub async fn init_engine(
    canvas: OffscreenCanvas,
    max_particles: u32,
    max_shapes: u32,
    debug_readback_hz: u32,
    initial_width: u32,
    initial_height: u32,
) -> Result<(), JsValue> {
    install_panic_hook();
    let config = EngineConfig {
        max_particles: max_particles as usize,
        max_shapes: max_shapes as usize,
        debug_readback_hz,
    };
    let engine = Engine::new(canvas, config, initial_width, initial_height).await?;
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
        Ok::<(), JsValue>(())
    })?;
    arm_worker_loop_if_needed()
}

#[wasm_bindgen]
pub fn set_debug_readback_hz(debug_readback_hz: u32) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before set_debug_readback_hz")
        })?;
        // [LAW:single-enforcer] Debug readback cadence changes are applied at
        // one engine boundary so worker telemetry toggles stay deterministic.
        engine.set_debug_readback_hz(debug_readback_hz);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn set_sink_pointer_map(sink_pointer_map_json: String) -> Result<(), JsValue> {
    let sink_pointer_map: HashMap<String, String> = if sink_pointer_map_json.is_empty()
        || sink_pointer_map_json == "{}"
    {
        HashMap::new()
    } else {
        serde_json::from_str(&sink_pointer_map_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sink pointer map: {}", e)))?
    };

    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before set_sink_pointer_map")
        })?;
        engine
            .set_sink_pointer_map(sink_pointer_map)
            .map_err(|e| JsValue::from_str(&e))?;
        Ok(())
    })
}

#[wasm_bindgen]
pub async fn rebuild_gpu_pipelines(passes: JsValue) -> Result<(), JsValue> {
    let pass_specs = parse_gpu_pass_specs(passes)?;
    let mut engine = ENGINE.with(|engine_cell| {
        engine_cell.borrow_mut().take().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before rebuild_gpu_pipelines")
        })
    })?;
    let rebuild_result = engine.rebuild_gpu_pipelines(pass_specs.as_slice()).await;
    ENGINE.with(|engine_cell| {
        *engine_cell.borrow_mut() = Some(engine);
    });
    arm_worker_loop_if_needed()?;
    rebuild_result.map_err(pipeline_rebuild_failure_to_js_value)
}

// [RECOVER-11] Upload MSDF atlas data for Type5 text rendering.
// Data is a Uint32Array: [0]=width, [1]=height, [2..]=packed RGBA pixels.
#[wasm_bindgen]
pub fn upload_atlas_data(data: js_sys::Uint32Array) -> Result<(), JsValue> {
    ENGINE.with(|engine_cell| {
        let mut engine_ref = engine_cell.borrow_mut();
        let engine = engine_ref.as_mut().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before upload_atlas_data")
        })?;
        let words = data.to_vec();
        engine.upload_atlas_data(&words);
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
            // [LAW:single-enforcer] JS serialization of scheduler observability
            // packets is owned by telemetry.rs so this boundary stays thin.
            return packet.to_js_value();
        }
        Ok(JsValue::NULL)
    })
}

// [RECOVER-10] [LAW:single-enforcer] One polling boundary for structured
// readback data (indirect args + instance probe), mirroring telemetry pattern.
#[wasm_bindgen]
pub fn take_readback_snapshot() -> Result<JsValue, JsValue> {
    ENGINE.with(|engine_cell| {
        let engine_ref = engine_cell.borrow();
        let engine = engine_ref.as_ref().ok_or_else(|| {
            JsValue::from_str("Rust engine must be initialized before take_readback_snapshot")
        })?;
        if let Some(snapshot) = engine.take_readback_snapshot() {
            return snapshot.to_js_value();
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
