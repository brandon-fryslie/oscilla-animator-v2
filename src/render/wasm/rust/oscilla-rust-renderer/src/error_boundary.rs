use std::panic;
use std::sync::Once;

use js_sys::{Object, Reflect};
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use web_sys::DedicatedWorkerGlobalScope;

static PANIC_HOOK_ONCE: Once = Once::new();

pub struct EngineErrorPayload {
    pub msg_type: &'static str,
    pub source: &'static str,
    pub message: String,
    pub location: String,
    pub fatal: bool,
}

impl EngineErrorPayload {
    pub fn new(
        source: &'static str,
        message: impl Into<String>,
        location: impl Into<String>,
        fatal: bool,
    ) -> Self {
        Self {
            msg_type: "ENGINE_ERROR",
            source,
            message: message.into(),
            location: location.into(),
            fatal,
        }
    }
}

pub fn send_engine_error(payload: &EngineErrorPayload) {
    if let Ok(global) = js_sys::global().dyn_into::<DedicatedWorkerGlobalScope>() {
        let object = Object::new();
        let _ = Reflect::set(
            &object,
            &JsValue::from_str("type"),
            &JsValue::from_str(payload.msg_type),
        );
        let _ = Reflect::set(
            &object,
            &JsValue::from_str("source"),
            &JsValue::from_str(payload.source),
        );
        let _ = Reflect::set(
            &object,
            &JsValue::from_str("message"),
            &JsValue::from_str(payload.message.as_str()),
        );
        let _ = Reflect::set(
            &object,
            &JsValue::from_str("location"),
            &JsValue::from_str(payload.location.as_str()),
        );
        let _ = Reflect::set(
            &object,
            &JsValue::from_str("fatal"),
            &JsValue::from_bool(payload.fatal),
        );
        let _ = global.post_message(&object.into());
    }
}

pub fn install_panic_hook() {
    PANIC_HOOK_ONCE.call_once(|| {
        // [LAW:single-enforcer] Panic boundary is installed once at wasm init;
        // all Rust panics route through one structured worker payload contract.
        panic::set_hook(Box::new(|info| {
            let message = if let Some(payload) = info.payload().downcast_ref::<&str>() {
                payload.to_string()
            } else if let Some(payload) = info.payload().downcast_ref::<String>() {
                payload.clone()
            } else {
                "Unknown Rust panic".to_string()
            };

            let location = info
                .location()
                .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
                .unwrap_or_else(|| "unknown_location".to_string());

            send_engine_error(&EngineErrorPayload::new(
                "RUST_PANIC",
                message,
                location,
                true,
            ));
        }));
    });
}
